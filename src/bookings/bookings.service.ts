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
  AvailabilityQueryDto,
  CreateBookingDto,
  OccupancyQueryDto,
} from './dto/create-booking.dto.js';
import {
  BOOKING_WINDOW_DAYS,
  SLOT_TIMES,
  isInBookingWindow,
  isPastSlot,
  nowInCity,
} from './slots.js';

export interface Slot {
  time: string;
  available: boolean;
}

export interface TableOccupancy {
  id: string;
  number: number;
  capacity: number;
  /** Switched off by the admin: takes no bookings. */
  isAvailable: boolean;
  /** Slot times with an active booking. */
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

const UNIQUE_VIOLATION = '23505';
/** Two guests racing for the last table: the loser picks again. */
const CREATE_ATTEMPTS = 3;

/** A table that fits the party and has no active booking in the slot. */
const FREE_TABLE = `
  FROM restaurant_tables t
  WHERE t.restaurant_id = $1
    AND t.is_available
    AND t.capacity >= $2
    AND NOT EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.table_id = t.id AND b.date = $3 AND b.time = slot
        AND b.status <> 'CANCELLED'
    )`;

/**
 * Picks the smallest free table that fits (big tables stay free for big groups),
 * inserts the booking and reads it back — all in one statement. Double booking is
 * prevented by the unique index on active (table, date, time).
 */
const CREATE_BOOKING = `
  WITH pick AS (
    SELECT t.id
    FROM (SELECT $4::text AS slot) s,
         LATERAL (SELECT t.id, t.capacity, t.number ${FREE_TABLE}) t
    ORDER BY t.capacity, t.number
    LIMIT 1
  ), inserted AS (
    INSERT INTO bookings (user_id, restaurant_id, table_id, date, time, guests, note, status, code)
    SELECT $5, $1, pick.id, $3, $4, $2, $6, 'CONFIRMED', $7 FROM pick
    RETURNING *
  )
  ${bookingSelect('inserted')}`;

@Injectable()
export class BookingsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly realtime: AvailabilityGateway,
  ) {}

  /** Every slot of the day with whether a table for `guests` is still free. */
  async availability({
    restaurantId,
    date,
    guests,
  }: AvailabilityQueryDto): Promise<Slot[]> {
    const now = nowInCity();
    // one query: no rows means the restaurant doesn't exist
    const { rows } = await this.db.query<{ slot: string; free: boolean }>(
      `SELECT slot, EXISTS (SELECT 1 ${FREE_TABLE}) AS free
       FROM restaurants r, unnest($4::text[]) WITH ORDINALITY AS s(slot, n)
       WHERE r.id = $1
       ORDER BY n`,
      [restaurantId, guests, date, SLOT_TIMES],
    );
    if (!rows.length) {
      throw new NotFoundException(`Restaurant ${restaurantId} not found`);
    }
    const open = isInBookingWindow(date, now);
    return rows.map(({ slot, free }) => ({
      time: slot,
      available: open && free && !isPastSlot(date, slot, now),
    }));
  }

  async occupancy({
    restaurantId,
    date,
  }: OccupancyQueryDto): Promise<Occupancy> {
    // LEFT JOIN: no rows = no restaurant, one row with a null id = no tables yet
    const { rows } = await this.db.query<{
      id: string | null;
      number: number;
      capacity: number;
      is_available: boolean;
      booked: string[];
    }>(
      `SELECT t.id, t.number, t.capacity, t.is_available,
              ARRAY(
                SELECT b.time FROM bookings b
                WHERE b.table_id = t.id AND b.date = $2 AND b.status <> 'CANCELLED'
              ) AS booked
       FROM restaurants r
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
    return {
      date,
      times: SLOT_TIMES,
      closed: SLOT_TIMES.filter((t) => !open || isPastSlot(date, t, now)),
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

    for (let attempt = 1; ; attempt++) {
      try {
        const { rows } = await this.db.query<BookingRow>(CREATE_BOOKING, [
          dto.restaurantId,
          dto.guests,
          dto.date,
          dto.time,
          user.id,
          dto.note?.trim() || null,
          newCode(),
        ]);
        if (rows[0]) {
          this.realtime.notify(dto.restaurantId, dto.date);
          return toBooking(rows[0]);
        }
        break;
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code !== UNIQUE_VIOLATION || attempt >= CREATE_ATTEMPTS) throw err;
      }
    }

    // Nothing inserted: find out why (only on this failure path).
    const { rowCount } = await this.db.query(
      'SELECT 1 FROM restaurants WHERE id = $1',
      [dto.restaurantId],
    );
    if (!rowCount) {
      throw new NotFoundException(`Restaurant ${dto.restaurantId} not found`);
    }
    throw new ConflictException(
      `No free tables for ${dto.guests} at ${dto.time} — please pick another time`,
    );
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
