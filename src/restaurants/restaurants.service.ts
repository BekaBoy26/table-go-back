import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { AvailabilityGateway } from '../realtime/availability.gateway.js';
import { CreateRestaurantDto } from './dto/create-restaurant.dto.js';
import { QueryRestaurantsDto } from './dto/query-restaurants.dto.js';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto.js';
import {
  RESTAURANT_COLUMNS,
  RESTAURANT_SELECT,
  Restaurant,
  RestaurantRow,
  toRestaurant,
} from './restaurant.entity.js';

type RestaurantField = keyof typeof RESTAURANT_COLUMNS;

const CHECK_VIOLATION = '23514';

/** Turns the DB price_min <= price_max check (works for partial updates too) into a 400. */
function rethrowPriceError(err: { code?: string; constraint?: string }): never {
  if (
    err.code === CHECK_VIOLATION &&
    err.constraint === 'chk_restaurants_price_range'
  ) {
    throw new BadRequestException('priceMin must not be greater than priceMax');
  }
  throw err;
}

@Injectable()
export class RestaurantsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly realtime: AvailabilityGateway,
  ) {}

  async findAll(query: QueryRestaurantsDto) {
    const { search, cuisine, page, limit } = query;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(name ILIKE $${params.length} OR address ILIKE $${params.length} OR gis_address ILIKE $${params.length})`,
      );
    }
    if (cuisine) {
      params.push(cuisine);
      conditions.push(`cuisine ILIKE $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // The total rides along with the page (window count) — one round trip
    // instead of two, which matters with ~90 ms to the database.
    const { rows } = await this.db.query<RestaurantRow & { total: string }>(
      `${RESTAURANT_SELECT.replace('SELECT r.*,', 'SELECT r.*, COUNT(*) OVER () AS total,')} ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, (page - 1) * limit],
    );

    // a page past the end has no rows to carry the total, so count it separately
    const total =
      rows[0]?.total ??
      (page > 1
        ? (
            await this.db.query<{ count: string }>(
              `SELECT COUNT(*) FROM restaurants ${where}`,
              params,
            )
          ).rows[0].count
        : 0);

    return {
      data: rows.map(toRestaurant),
      total: Number(total),
      page,
      limit,
    };
  }

  async findOne(id: string): Promise<Restaurant> {
    const { rows } = await this.db.query<RestaurantRow>(
      `${RESTAURANT_SELECT} WHERE r.id = $1`,
      [id],
    );
    if (!rows[0]) {
      throw new NotFoundException(`Restaurant ${id} not found`);
    }
    return toRestaurant(rows[0]);
  }

  async create(dto: CreateRestaurantDto): Promise<Restaurant> {
    const entries = this.toColumnEntries(dto);
    const columns = entries.map(([column]) => column);
    const values = entries.map(([, value]) => value);
    const placeholders = values.map((_, i) => `$${i + 1}`);

    const { rows } = await this.db
      .query<{ id: string }>(
        `INSERT INTO restaurants (${columns.join(', ')})
         VALUES (${placeholders.join(', ')})
         RETURNING id`,
        values,
      )
      .catch(rethrowPriceError);
    return this.findOne(rows[0].id);
  }

  async update(id: string, dto: UpdateRestaurantDto): Promise<Restaurant> {
    const entries = this.toColumnEntries(dto);
    if (!entries.length) {
      return this.findOne(id);
    }

    const sets = entries.map(([column], i) => `${column} = $${i + 1}`);
    const values = entries.map(([, value]) => value);

    const { rows } = await this.db
      .query<{ id: string }>(
        `UPDATE restaurants
         SET ${sets.join(', ')}, updated_at = NOW()
         WHERE id = $${values.length + 1}
         RETURNING id`,
        [...values, id],
      )
      .catch(rethrowPriceError);
    if (!rows[0]) {
      throw new NotFoundException(`Restaurant ${id} not found`);
    }
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const { rowCount } = await this.db.query(
      'DELETE FROM restaurants WHERE id = $1',
      [id],
    );
    if (!rowCount) {
      throw new NotFoundException(`Restaurant ${id} not found`);
    }
    this.realtime.notify(id);
  }

  /** Maps DTO fields to whitelisted DB columns, skipping undefined values. */
  private toColumnEntries(
    dto: Partial<Record<RestaurantField, unknown>>,
  ): [string, unknown][] {
    return (Object.keys(RESTAURANT_COLUMNS) as RestaurantField[])
      .filter((field) => dto[field] !== undefined)
      .map((field) => [RESTAURANT_COLUMNS[field], dto[field]]);
  }
}
