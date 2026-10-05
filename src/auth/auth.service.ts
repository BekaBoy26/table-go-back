import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User, toUser } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { LoginDto, RegisterDto } from './dto/credentials.dto.js';
import { hashPassword, verifyPassword } from './password.js';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export interface Session {
  token: string;
  user: User;
}

/** Checked when the email is unknown, so a miss takes as long as a wrong password. */
const DUMMY_HASH = hashPassword('not-a-real-password');

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  generateToken(user: User): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return this.jwtService.signAsync(payload);
  }

  async register(dto: RegisterDto): Promise<Session> {
    const user = await this.usersService.createWithPassword(dto);
    return { token: await this.generateToken(user), user };
  }

  async login({ email, password }: LoginDto): Promise<Session> {
    const row = await this.usersService.findRowByEmail(email);
    if (row && !row.password) {
      throw new UnauthorizedException(
        'This account uses Google sign-in — press "Continue with Google"',
      );
    }
    const ok = await verifyPassword(
      password,
      row?.password ?? (await DUMMY_HASH),
    );
    if (!row || !ok) {
      throw new UnauthorizedException('Wrong email or password');
    }
    const user = toUser(row);
    return { token: await this.generateToken(user), user };
  }
}
