import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { MAX_GUESTS, nowInCity } from '../bookings/slots.js';
import { DatabaseService } from '../database/database.service.js';
import { AvailabilityGateway } from '../realtime/availability.gateway.js';

class CreateTableDto {
  @IsInt()
  @Min(1)
  @Max(MAX_GUESTS)
  capacity: number;

  /** Switched off tables are skipped when seating new bookings. */
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

class UpdateTableDto extends PartialType(CreateTableDto) {}

interface TableRow {
  id: string;
  number: number;
  capacity: number;
  is_available: boolean;
  upcoming_bookings: number;
}

const toTable = (row: TableRow) => ({
  id: row.id,
  number: row.number,
  capacity: row.capacity,
  isAvailable: row.is_available,
  upcomingBookings: row.upcoming_bookings,
});

const TABLE_SELECT = `
  SELECT t.id, t.number, t.capacity, t.is_available,
         (SELECT COUNT(*)::int FROM bookings b
          WHERE b.table_id = t.id AND b.status <> 'CANCELLED' AND b.date >= $2) AS upcoming_bookings
  FROM restaurant_tables t`;

@Controller('restaurants/:restaurantId/tables')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class TablesController {
  constructor(
    private readonly db: DatabaseService,
    private readonly realtime: AvailabilityGateway,
  ) {}

  @Get()
  async findAll(@Param('restaurantId', ParseUUIDPipe) restaurantId: string) {
    const { rows } = await this.db.query<TableRow>(
      `${TABLE_SELECT} WHERE t.restaurant_id = $1 ORDER BY t.number`,
      [restaurantId, nowInCity().date],
    );
    return rows.map(toTable);
  }

  /** Adds a table with the next free number. */
  @Post()
  async create(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Body() dto: CreateTableDto,
  ) {
    const id = await this.db.transaction(async (client) => {
      // lock the restaurant so two admins can't take the same number
      const { rowCount } = await client.query(
        'SELECT 1 FROM restaurants WHERE id = $1 FOR UPDATE',
        [restaurantId],
      );
      if (!rowCount) {
        throw new NotFoundException(`Restaurant ${restaurantId} not found`);
      }
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO restaurant_tables (restaurant_id, number, capacity, is_available)
         SELECT $1, COALESCE(MAX(number), 0) + 1, $2, $3
         FROM restaurant_tables WHERE restaurant_id = $1
         RETURNING id`,
        [restaurantId, dto.capacity, dto.isAvailable ?? true],
      );
      return rows[0].id;
    });
    this.realtime.notify(restaurantId);
    return this.findOne(restaurantId, id);
  }

  @Patch(':id')
  async update(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTableDto,
  ) {
    const { rowCount } = await this.db.query(
      `UPDATE restaurant_tables
       SET capacity = COALESCE($3, capacity),
           is_available = COALESCE($4, is_available),
           updated_at = NOW()
       WHERE id = $1 AND restaurant_id = $2`,
      [id, restaurantId, dto.capacity ?? null, dto.isAvailable ?? null],
    );
    if (!rowCount) throw new NotFoundException(`Table ${id} not found`);
    this.realtime.notify(restaurantId);
    return this.findOne(restaurantId, id);
  }

  /** Deleting would also delete the table's bookings, so it's refused while any exist. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const { rows } = await this.db.query<{ bookings: number }>(
      `SELECT (SELECT COUNT(*)::int FROM bookings b WHERE b.table_id = t.id) AS bookings
       FROM restaurant_tables t WHERE t.id = $1 AND t.restaurant_id = $2`,
      [id, restaurantId],
    );
    if (!rows[0]) throw new NotFoundException(`Table ${id} not found`);
    if (rows[0].bookings > 0) {
      throw new ConflictException(
        'This table has bookings — switch it off instead of deleting',
      );
    }
    await this.db.query('DELETE FROM restaurant_tables WHERE id = $1', [id]);
    this.realtime.notify(restaurantId);
  }

  private async findOne(restaurantId: string, id: string) {
    const { rows } = await this.db.query<TableRow>(
      `${TABLE_SELECT} WHERE t.restaurant_id = $1 AND t.id = $3`,
      [restaurantId, nowInCity().date, id],
    );
    return toTable(rows[0]);
  }
}
