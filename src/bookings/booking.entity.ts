import { BookingStatus } from '../database/database.service.js';

export interface BookingRow {
  id: string;
  code: string | null;
  user_id: string;
  restaurant_id: string;
  table_id: string;
  date: string;
  time: string;
  hours: number;
  guests: number;
  note: string | null;
  status: BookingStatus;
  created_at: Date;
  table_number: number;
  restaurant_name: string;
  restaurant_image: string | null;
  user_name: string;
  user_email: string;
}

export interface Booking {
  id: string;
  code: string;
  userId: string;
  restaurantId: string;
  restaurantName: string;
  restaurantImage: string | null;
  tableNumber: number;
  date: string;
  time: string;
  /** How many hours the table is held from `time`. */
  hours: number;
  guests: number;
  note: string | null;
  status: BookingStatus;
  createdAt: Date;
  user: { name: string; email: string };
}

/**
 * Booking with its table number, restaurant and guest. `source` is the bookings
 * table or a CTE with its rows (e.g. from INSERT/UPDATE ... RETURNING *), so a
 * write and the read-back fit in one round trip.
 */
export const bookingSelect = (source = 'bookings') => `
  SELECT b.*,
         t.number AS table_number,
         r.name AS restaurant_name,
         r.image AS restaurant_image,
         u.name AS user_name,
         u.email AS user_email
  FROM ${source} b
  JOIN restaurant_tables t ON t.id = b.table_id
  JOIN restaurants r ON r.id = b.restaurant_id
  JOIN users u ON u.id = b.user_id`;

export const BOOKING_SELECT = bookingSelect();

export function toBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    // bookings made before codes existed
    code: row.code ?? row.id.slice(0, 8).toUpperCase(),
    userId: row.user_id,
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant_name,
    restaurantImage: row.restaurant_image,
    tableNumber: row.table_number,
    date: row.date,
    time: row.time,
    hours: row.hours,
    guests: row.guests,
    note: row.note,
    status: row.status,
    createdAt: row.created_at,
    user: { name: row.user_name, email: row.user_email },
  };
}
