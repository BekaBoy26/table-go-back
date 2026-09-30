import { SQL_SLOT_TIMES, SQL_TODAY, SQL_NOW_TIME } from '../bookings/slots.js';

export interface RestaurantRow {
  id: string;
  name: string;
  description: string | null;
  address: string;
  gis_address: string | null;
  image: string | null;
  images: string[] | null;
  cuisine: string | null;
  price_min: number | null;
  price_max: number | null;
  tags: string[];
  work_time: string | null;
  phone: string | null;
  email: string | null;
  gis_link: string | null;
  latitude: number | null;
  longitude: number | null;
  available_today: boolean;
  max_seats: number | null;
  tables_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface Restaurant {
  id: string;
  name: string;
  description: string | null;
  address: string;
  gisAddress: string | null;
  image: string | null;
  images: string[];
  cuisine: string | null;
  priceMin: number | null;
  priceMax: number | null;
  tags: string[];
  workTime: string | null;
  phone: string | null;
  email: string | null;
  gisLink: string | null;
  latitude: number | null;
  longitude: number | null;
  /** A table for two is still free at some slot later today. */
  availableToday: boolean;
  /** Seats at the biggest table in use; 0 when there are none. */
  maxSeats: number;
  tablesCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** DTO field (camelCase) -> DB column (snake_case). Also acts as a whitelist for writes. */
export const RESTAURANT_COLUMNS = {
  name: 'name',
  description: 'description',
  address: 'address',
  gisAddress: 'gis_address',
  image: 'image',
  images: 'images',
  cuisine: 'cuisine',
  priceMin: 'price_min',
  priceMax: 'price_max',
  tags: 'tags',
  workTime: 'work_time',
  phone: 'phone',
  email: 'email',
  gisLink: 'gis_link',
  latitude: 'latitude',
  longitude: 'longitude',
} as const;

/** Restaurant columns plus the number of its tables and whether it has room today. */
export const RESTAURANT_SELECT = `
  SELECT r.*,
         (SELECT COUNT(*)::int FROM restaurant_tables t WHERE t.restaurant_id = r.id) AS tables_count,
         (SELECT MAX(capacity) FROM restaurant_tables t
          WHERE t.restaurant_id = r.id AND t.is_available) AS max_seats,
         EXISTS (
           SELECT 1
           FROM unnest(${SQL_SLOT_TIMES}) AS slot
           JOIN restaurant_tables t ON t.restaurant_id = r.id AND t.is_available AND t.capacity >= 2
           WHERE slot > ${SQL_NOW_TIME}
             AND NOT EXISTS (
               SELECT 1 FROM bookings b
               WHERE b.table_id = t.id AND b.date = ${SQL_TODAY} AND b.time = slot
                 AND b.status <> 'CANCELLED'
             )
         ) AS available_today
  FROM restaurants r`;

export function toRestaurant(row: RestaurantRow): Restaurant {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    address: row.address,
    gisAddress: row.gis_address,
    image: row.image,
    images: row.images ?? [],
    cuisine: row.cuisine,
    priceMin: row.price_min,
    priceMax: row.price_max,
    tags: row.tags ?? [],
    workTime: row.work_time,
    phone: row.phone,
    email: row.email,
    gisLink: row.gis_link,
    latitude: row.latitude,
    longitude: row.longitude,
    availableToday: row.available_today,
    maxSeats: row.max_seats ?? 0,
    tablesCount: row.tables_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
