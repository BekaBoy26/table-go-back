import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { SCHEMA_SQL } from './schema.js';

// Columns are TIMESTAMP (without time zone) and NOW() stores UTC on Supabase.
// By default pg parses them as local time, which shifts dates by the server offset.
const TIMESTAMP_OID = 1114;
pg.types.setTypeParser(TIMESTAMP_OID, (value) => new Date(`${value}Z`));
// DATE has no time or zone; keep it as 'YYYY-MM-DD' instead of a local-midnight Date.
const DATE_OID = 1082;
pg.types.setTypeParser(DATE_OID, (value) => value);

export const BOOKING_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'CANCELLED',
  'COMPLETED',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

const READ_QUERY = /^\s*SELECT\b/i;

const CONNECTION_ERROR_CODES = new Set(['ECONNRESET', 'EPIPE', 'ETIMEDOUT']);

function isConnectionError(err: unknown): boolean {
  const { code, message = '' } = err as { code?: string; message?: string };
  return (
    (!!code && CONNECTION_ERROR_CODES.has(code)) ||
    /Connection terminated|socket disconnected|timeout exceeded when trying to connect/i.test(
      message,
    )
  );
}

/** Connection problems become 503 so clients see "try again" instead of a generic 500. */
function toUnavailable(err: unknown): never {
  if (isConnectionError(err)) {
    throw new ServiceUnavailableException(
      'Database is temporarily unavailable, please try again',
    );
  }
  throw err;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: pg.Pool;

  constructor(private readonly config: ConfigService) {
    const connectionString = this.config.get<string>('DATABASE_URL');
    if (!connectionString) {
      throw new Error('DATABASE_URL is not defined');
    }

    const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);

    this.pool = new pg.Pool({
      connectionString,
      // Supabase requires SSL; local Postgres usually doesn't have it.
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 10,
      // New connections to a remote Supabase region are slow and flaky, so keep
      // established ones alive and reuse them for a while.
      keepAlive: true,
      idleTimeoutMillis: 60_000,
      connectionTimeoutMillis: 15_000,
    });

    this.pool.on('error', (err) => {
      this.logger.error(`Unexpected PostgreSQL pool error: ${err.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.connectWithRetry();
    this.logger.log('Connected to PostgreSQL');

    await this.pool.query(SCHEMA_SQL);
    this.logger.log('Database tables are ready');
  }

  /** One failed handshake to a remote region shouldn't crash the app on startup. */
  private async connectWithRetry(attempts = 5): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.pool.query('SELECT NOW()');
        return;
      } catch (err) {
        if (attempt >= attempts || !isConnectionError(err)) throw err;
        this.logger.warn(
          `Database connection failed (attempt ${attempt}/${attempts}): ${(err as Error).message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async query<T extends QueryResultRow = any>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    try {
      return await this.pool.query<T>(text, params);
    } catch (err) {
      // Reads are safe to repeat on a dropped connection. Writes are not retried:
      // the first attempt may have been applied before the socket died.
      if (isConnectionError(err) && READ_QUERY.test(text)) {
        this.logger.warn(
          `Retrying read after connection error: ${(err as Error).message}`,
        );
        return this.pool.query<T>(text, params).catch(toUnavailable);
      }
      return toUnavailable(err);
    }
  }

  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect().catch(toUnavailable);
    let broken = false;
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      broken = isConnectionError(err);
      // On a dead connection ROLLBACK fails too; keep the original error.
      await client.query('ROLLBACK').catch(() => undefined);
      return toUnavailable(err);
    } finally {
      // Destroy a broken connection instead of returning it to the pool.
      client.release(broken);
    }
  }
}
