import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hashPassword } from '../auth/password.js';
import { DatabaseService } from '../database/database.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { User, UserRow, toUser } from './user.entity.js';

/**
 * Every authenticated request loads its user; with the database ~90 ms away that
 * doubles the response time, so users are kept for a short while. The TTL bounds
 * how long a role change or deletion takes to apply.
 */
const USER_CACHE_TTL_MS = 60_000;
const USER_CACHE_MAX = 1_000;

export interface OAuthProfile {
  email: string;
  name: string;
  avatar: string | null;
}

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);
  private readonly adminEmails: string[];
  private readonly cache = new Map<string, { user: User; expires: number }>();

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {
    this.adminEmails = (config.get<string>('ADMIN_EMAILS') ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
  }

  async onModuleInit(): Promise<void> {
    await this.seedAdmin();
    if (!this.adminEmails.length) return;
    // Users from ADMIN_EMAILS who signed up before being listed there. Only verified
    // emails: anyone can register an address with a password without owning it.
    const { rowCount } = await this.db.query(
      `UPDATE users SET role = 'ADMIN', updated_at = NOW()
       WHERE email = ANY($1) AND email_verified AND role IS DISTINCT FROM 'ADMIN'`,
      [this.adminEmails],
    );
    if (rowCount) {
      this.logger.log(`Promoted ${rowCount} user(s) to ADMIN`);
    }
  }

  /**
   * Admin with an email + password from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD,
   * for signing in without Google. .env is the source of truth: the password is
   * reset to it on every start, and an account someone registered with this email
   * is taken over.
   */
  private async seedAdmin(): Promise<void> {
    const email = this.config.get<string>('SEED_ADMIN_EMAIL')?.trim();
    const password = this.config.get<string>('SEED_ADMIN_PASSWORD');
    if (!email || !password) return;

    const { rows } = await this.db.query<{ created: boolean }>(
      `INSERT INTO users (name, email, password, role, email_verified)
       VALUES ('Admin', $1, $2, 'ADMIN', TRUE)
       ON CONFLICT (email) DO UPDATE
         SET password = EXCLUDED.password,
             role = 'ADMIN',
             email_verified = TRUE,
             updated_at = NOW()
       RETURNING (xmax = 0) AS created`,
      [email.toLowerCase(), await hashPassword(password)],
    );
    if (rows[0]?.created) this.logger.log(`Created admin account ${email}`);
  }

  isAdminEmail(email: string): boolean {
    return this.adminEmails.includes(email.toLowerCase());
  }

  async findById(id: string): Promise<User | null> {
    const { rows } = await this.db.query<UserRow>(
      'SELECT * FROM users WHERE id = $1',
      [id],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  /** findById through the short-lived cache — for per-request auth checks. */
  async findByIdCached(id: string): Promise<User | null> {
    const hit = this.cache.get(id);
    if (hit && hit.expires > Date.now()) return hit.user;

    const user = await this.findById(id);
    if (user) this.remember(user);
    else this.cache.delete(id);
    return user;
  }

  private remember(user: User): void {
    if (this.cache.size >= USER_CACHE_MAX) this.cache.clear();
    this.cache.set(user.id, { user, expires: Date.now() + USER_CACHE_TTL_MS });
  }

  /** The raw row, password hash included — for checking credentials only. */
  async findRowByEmail(email: string): Promise<UserRow | null> {
    const { rows } = await this.db.query<UserRow>(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()],
    );
    return rows[0] ?? null;
  }

  /** Email sign-up. The address isn't verified, so it never grants ADMIN. */
  async createWithPassword(profile: {
    name: string;
    email: string;
    password: string;
  }): Promise<User> {
    const { rows } = await this.db.query<UserRow>(
      `INSERT INTO users (name, email, password)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING
       RETURNING *`,
      [
        profile.name,
        profile.email.toLowerCase(),
        await hashPassword(profile.password),
      ],
    );
    if (!rows[0]) {
      throw new ConflictException(
        'An account with this email already exists — sign in instead',
      );
    }
    const user = toUser(rows[0]);
    this.remember(user);
    return user;
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<User> {
    const { rows } = await this.db.query<UserRow>(
      `UPDATE users
       SET name = COALESCE($2, name),
           phone = CASE WHEN $4::boolean THEN $3 ELSE phone END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, dto.name ?? null, dto.phone || null, dto.phone !== undefined],
    );
    // deleted while the cached session was still valid
    if (!rows[0]) throw new NotFoundException('User not found');
    const user = toUser(rows[0]);
    this.remember(user);
    return user;
  }

  /**
   * Finds a user by email or creates one without a password.
   * An existing user keeps their data; only a missing avatar is filled in,
   * and emails from ADMIN_EMAILS are promoted to ADMIN. Google proves the email:
   * a password set on an unverified account (possibly by someone who registered
   * this address first) is dropped, so only the real owner can sign in.
   */
  async findOrCreateOAuthUser(profile: OAuthProfile): Promise<User> {
    const isAdmin = this.isAdminEmail(profile.email);
    const { rows } = await this.db.query<UserRow>(
      `INSERT INTO users (name, email, avatar, role, email_verified)
       VALUES ($1, $2, $3, CASE WHEN $4::boolean THEN 'ADMIN' ELSE 'USER' END, TRUE)
       ON CONFLICT (email) DO UPDATE
         SET avatar = COALESCE(users.avatar, EXCLUDED.avatar),
             role = CASE WHEN $4::boolean THEN 'ADMIN' ELSE users.role END,
             password = CASE WHEN users.email_verified THEN users.password END,
             email_verified = TRUE
       RETURNING *`,
      [profile.name, profile.email.toLowerCase(), profile.avatar, isAdmin],
    );
    const user = toUser(rows[0]);
    this.remember(user);
    return user;
  }
}
