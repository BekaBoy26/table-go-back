import { randomInt } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { AvailabilityGateway } from '../realtime/availability.gateway.js';
import { User } from '../users/user.entity.js';
import {
  Booking,
  BOOKING_SELECT,
  BookingRow,
  bookingSelect,
  toBooking,
} from './booking.entity.js';
import {
  CreateBookingDto,
  OccupancyQueryDto,
} from './dto/create-booking.dto.js';
import {
  BOOKING_WINDOW_DAYS,
  isInBookingWindow,
  isPastSlot,
  nowInCity,
  slotTimes,
  sqlCloseHour,
  sqlOpenHour,
  sqlOverlaps,
  toMinutes,
} from './slots.js';

export interface TableOccupancy {
  id: string;
  number: number;
  capacity: number;
  /** Switched off by the admin: takes no bookings. */
  isAvailable: boolean;
  /** Hourly slots overlapped by an active booking. */
  booked: string[];
}

/** Which table is taken at which time on a day — no guest data, safe to show publicly. */
export interface Occupancy {
  date: string;
  times: string[];
  /** Slots that can't be booked any more: already started or outside the booking window. */
  closed: string[];
  tables: TableOccupancy[];
}

// No 0/O or 1/I so codes are easy to read out over the phone.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () =>
  'TG-' +
  Array.from(
    { length: 6 },
    () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
  ).join('');

@Injectable()
export class BookingsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly realtime: AvailabilityGateway,
  ) {}

  async occupancy({
    restaurantId,
    date,
  }: OccupancyQueryDto): Promise<Occupancy> {
    // LEFT JOIN: no rows = no restaurant, one row with a null id = no tables yet
    const { rows } = await this.db.query<{
      open: number;
      close: number;
      id: string | null;
      number: number;
      capacity: number;
      is_available: boolean;
      booked: string[];
    }>(
      `SELECT h.open, h.close, t.id, t.number, t.capacity, t.is_available,
              ARRAY(
                SELECT lpad(s::text, 2, '0') || ':00'
                FROM generate_series(h.open, h.close - 1) AS s
                WHERE EXISTS (
                  SELECT 1 FROM bookings b
                  WHERE b.table_id = t.id AND b.date = $2 AND b.status <> 'CANCELLED'
                    AND ${sqlOverlaps('s * 60', '(s + 1) * 60')}
                )
              ) AS booked
       FROM restaurants r
       CROSS JOIN LATERAL (
         SELECT ${sqlOpenHour('r.work_time')} AS open, ${sqlCloseHour('r.work_time')} AS close
       ) h
       LEFT JOIN restaurant_tables t ON t.restaurant_id = r.id
       WHERE r.id = $1
       ORDER BY t.number`,
      [restaurantId, date],
    );
    if (!rows.length) {
      throw new NotFoundException(`Restaurant ${restaurantId} not found`);
    }

    const now = nowInCity();
    const open = isInBookingWindow(date, now);
    const times = slotTimes(rows[0].open, rows[0].close);
    return {
      date,
      times,
      closed: times.filter((t) => !open || isPastSlot(date, t, now)),
      tables: rows
        .filter((row): row is typeof row & { id: string } => !!row.id)
        .map((row) => ({
          id: row.id,
          number: row.number,
          capacity: row.capacity,
          isAvailable: row.is_available,
          booked: row.booked,
        })),
    };
  }

  async create(user: User, dto: CreateBookingDto): Promise<Booking> {
    const now = nowInCity();
    if (isPastSlot(dto.date, dto.time, now)) {
      throw new BadRequestException('This time has already passed');
    }
    if (!isInBookingWindow(dto.date, now)) {
      throw new BadRequestException(
        `Tables can be booked up to ${BOOKING_WINDOW_DAYS} days ahead`,
      );
    }
    const start = toMinutes(dto.time);
    const end = start + dto.hours * 60;

    const booking = await this.db.transaction(async (client) => {
      // the row lock queues concurrent bookings of the same table
      const { rows } = await client.query<{
        number: number;
        capacity: number;
        is_available: boolean;
        open: number;
        close: number;
      }>(
        `SELECT t.number, t.capacity, t.is_available,
                ${sqlOpenHour('r.work_time')} AS open, ${sqlCloseHour('r.work_time')} AS close
         FROM restaurant_tables t
         JOIN restaurants r ON r.id = t.restaurant_id
         WHERE t.id = $1 AND t.restaurant_id = $2
         FOR UPDATE OF t`,
        [dto.tableId, dto.restaurantId],
      );
      const table = rows[0];
      if (!table) throw new NotFoundException('Table not found');
      if (!table.is_available) {
        throw new BadRequestException(
          `Table #${table.number} is not taking bookings`,
        );
      }
      if (table.capacity < dto.guests) {
        throw new BadRequestException(
          `Table #${table.number} seats only ${table.capacity}`,
        );
      }
      if (start < table.open * 60 || end > table.close * 60) {
        throw new BadRequestException(
          `Bookings are taken from ${table.open}:00 to ${table.close}:00`,
        );
      }

      const { rowCount } = await client.query(
        `SELECT 1 FROM bookings b
         WHERE b.table_id = $1 AND b.date = $2 AND b.status <> 'CANCELLED'
           AND ${sqlOverlaps('$3', '$4')}`,
        [dto.tableId, dto.date, start, end],
      );
      if (rowCount) {
        throw new ConflictException(
          `Table #${table.number} is already booked for part of that time — pick another table or time`,
        );
      }

      const inserted = await client.query<BookingRow>(
        `WITH inserted AS (
           INSERT INTO bookings (user_id, restaurant_id, table_id, date, time, hours, guests, note, status, code)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'CONFIRMED', $9)
           RETURNING *
         )
         ${bookingSelect('inserted')}`,
        [
          user.id,
          dto.restaurantId,
          dto.tableId,
          dto.date,
          dto.time,
          dto.hours,
          dto.guests,
          dto.note?.trim() || null,
          newCode(),
        ],
      );
      return toBooking(inserted.rows[0]);
    });

    this.realtime.notify(dto.restaurantId, dto.date);
    return booking;
  }

  async findMine(userId: string): Promise<Booking[]> {
    const { rows } = await this.db.query<BookingRow>(
      `${BOOKING_SELECT} WHERE b.user_id = $1 ORDER BY b.date DESC, b.time DESC`,
      [userId],
    );
    return rows.map(toBooking);
  }

  async findAll(): Promise<Booking[]> {
    const { rows } = await this.db.query<BookingRow>(
      `${BOOKING_SELECT} ORDER BY b.date DESC, b.time DESC LIMIT 500`,
    );
    return rows.map(toBooking);
  }

  /** Guests cancel their own upcoming bookings; admins can cancel any. */
  async cancel(id: string, user: User): Promise<Booking> {
    const booking = await this.findOne(id);
    const isAdmin = user.role === 'ADMIN';
    // someone else's booking looks the same as a missing one
    if (!isAdmin && booking.userId !== user.id) {
      throw new NotFoundException(`Booking ${id} not found`);
    }
    if (booking.status === 'CANCELLED') return booking;
    if (!isAdmin && isPastSlot(booking.date, booking.time)) {
      throw new BadRequestException('A past booking cannot be cancelled');
    }

    const { rows } = await this.db.query<BookingRow>(
      `WITH updated AS (
         UPDATE bookings SET status = 'CANCELLED', updated_at = NOW()
         WHERE id = $1
         RETURNING *
       )
       ${bookingSelect('updated')}`,
      [id],
    );
    this.realtime.notify(booking.restaurantId, booking.date);
    return toBooking(rows[0]);
  }

  private async findOne(id: string): Promise<Booking> {
    const { rows } = await this.db.query<BookingRow>(
      `${BOOKING_SELECT} WHERE b.id = $1`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException(`Booking ${id} not found`);
    return toBooking(rows[0]);
  }
}
