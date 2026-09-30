/**
 * Seeds demo restaurants (the ones the frontend used as mocks) with their tables.
 * Idempotent: restaurants that already exist (by name) are skipped.
 *
 * Run: npm run seed
 * Addresses are real buildings: `address` is shown in the UI, `gisAddress` is the
 * Russian form 2GIS search understands. Coordinates are taken from 2GIS.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { DatabaseService } from './database.service.js';

const img = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=800&h=500&fit=crop&auto=format`;

const restaurants = [
  {
    name: 'Bella Italia',
    cuisine: 'Italian',
    address: 'Chuy Avenue 123',
    gisAddress: 'проспект Чуй, 123',
    image: img('1414235077428-338989a2e8c0'),
    priceMin: 1000,
    priceMax: 5000,
    tags: ['Romantic', 'Quiet', 'Wi-Fi'],
    tables: 14,
    // seats per table, repeated over the tables
    capacities: [2, 2, 4],
    workTime: 'Mon–Sun: 12:00–23:00',
    phone: '+996 312 456 789',
    email: 'hello@bellaitalia.kg',
    lat: 42.87584,
    lng: 74.624706,
    description:
      'Authentic Italian cuisine in the heart of Bishkek. Hand-made pasta, wood-fired pizza and a curated wine list in a warm, intimate setting.',
  },
  {
    name: 'Navat',
    cuisine: 'Kyrgyz',
    address: 'Manas Avenue 40',
    gisAddress: 'проспект Манаса, 40',
    image: img('1555396273-367ea4eb4db5'),
    priceMin: 500,
    priceMax: 2000,
    tags: ['Family Friendly', 'Traditional', 'Outdoor Seating'],
    tables: 20,
    // seats per table, repeated over the tables
    capacities: [4, 6, 8, 10],
    workTime: 'Mon–Sun: 10:00–00:00',
    phone: '+996 312 111 222',
    email: 'info@navat.kg',
    lat: 42.875919,
    lng: 74.587943,
    description:
      'Traditional Kyrgyz and Central Asian dishes in a cozy national interior. Great for big family dinners.',
  },
  {
    name: 'Steak House',
    cuisine: 'Steak',
    address: 'Erkindik Boulevard 35',
    gisAddress: 'бульвар Эркиндик, 35',
    image: img('1544025162-d76694265947'),
    priceMin: 3000,
    priceMax: 10000,
    tags: ['Romantic', 'Wi-Fi', 'Business'],
    tables: 10,
    // seats per table, repeated over the tables
    capacities: [2, 4, 6, 8],
    workTime: 'Mon–Sun: 13:00–23:00',
    phone: '+996 312 333 444',
    email: 'book@steakhouse.kg',
    lat: 42.872842,
    lng: 74.607149,
    description:
      'Dry-aged steaks grilled over charcoal, premium wines and a calm atmosphere for business meetings.',
  },
  {
    name: 'Ocean',
    cuisine: 'Seafood',
    address: 'Toktogul Street 125',
    gisAddress: 'улица Токтогула, 125',
    image: img('1559339352-11d035aa65de'),
    priceMin: 2000,
    priceMax: 8000,
    tags: ['Quiet', 'Romantic', 'Wi-Fi'],
    tables: 12,
    // seats per table, repeated over the tables
    capacities: [2, 4, 4],
    workTime: 'Mon–Sun: 12:00–23:00',
    phone: '+996 312 555 666',
    email: 'hello@ocean.kg',
    lat: 42.872743,
    lng: 74.598603,
    description:
      'Fresh seafood delivered daily, oysters bar and a terrace with a calm evening atmosphere.',
  },
  {
    name: 'Fuji Garden',
    cuisine: 'Asian',
    address: 'Isanov Street 55',
    gisAddress: 'улица Исанова, 55',
    image: img('1569050467447-ce54b3bbc37d'),
    priceMin: 1500,
    priceMax: 6000,
    tags: ['Quiet', 'Wi-Fi', 'Family Friendly'],
    tables: 18,
    // seats per table, repeated over the tables
    capacities: [2, 4, 4],
    workTime: 'Mon–Sun: 11:00–23:00',
    phone: '+996 312 777 888',
    email: 'info@fuji.kg',
    lat: 42.872096,
    lng: 74.592167,
    description:
      'Japanese and pan-Asian kitchen: sushi, ramen and wok in a minimal zen interior.',
  },
  {
    name: 'Samarkand',
    cuisine: 'Uzbek',
    address: 'Akhunbaev Street 120',
    gisAddress: 'улица Ахунбаева, 120',
    image: img('1504674900247-0877df9cc836'),
    priceMin: 800,
    priceMax: 3000,
    tags: ['Family Friendly', 'Traditional', 'Outdoor Seating'],
    tables: 22,
    // seats per table, repeated over the tables
    capacities: [4, 6, 8, 12],
    workTime: 'Mon–Sun: 09:00–23:00',
    phone: '+996 312 999 000',
    email: 'hello@samarkand.kg',
    lat: 42.843264,
    lng: 74.589627,
    description:
      'Uzbek plov, samsa from tandoor and shashlik. Spacious hall and summer terrace.',
  },
  {
    name: 'Verde Burger',
    cuisine: 'Fast Food',
    address: 'Dzhantoshev Street 8A',
    gisAddress: 'улица Джантошева, 8а',
    image: img('1568901346375-23c9450c58cd'),
    priceMin: 300,
    priceMax: 1500,
    tags: ['Family Friendly', 'Wi-Fi', 'Quick'],
    tables: 16,
    // seats per table, repeated over the tables
    capacities: [2, 4],
    workTime: 'Mon–Sun: 10:00–22:00',
    phone: '+996 312 123 456',
    email: 'hi@verde.kg',
    lat: 42.844305,
    lng: 74.629225,
    description: 'Craft burgers, fries and shakes. Fast, tasty and affordable.',
  },
  {
    name: 'Chaikana',
    cuisine: 'Kyrgyz',
    address: 'Frunze Street 67',
    gisAddress: 'улица Фрунзе, 67',
    image: img('1517248135467-4c7edcad34c4'),
    priceMin: 400,
    priceMax: 2000,
    tags: ['Quiet', 'Traditional', 'Outdoor Seating'],
    tables: 8,
    // seats per table, repeated over the tables
    capacities: [2, 4, 6],
    workTime: 'Mon–Sun: 08:00–22:00',
    phone: '+996 312 654 321',
    email: 'info@chaikana.kg',
    lat: 42.879169,
    lng: 74.647412,
    description:
      'Classic tea house with lagman, manty and hot bread from the oven.',
  },
];

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const db = app.get(DatabaseService);

  let created = 0;
  for (const r of restaurants) {
    await db.transaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO restaurants
           (name, cuisine, address, gis_address, image, price_min, price_max, tags,
            work_time, phone, email, latitude, longitude, description)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
         WHERE NOT EXISTS (SELECT 1 FROM restaurants WHERE name = $1)
         RETURNING id`,
        [
          r.name,
          r.cuisine,
          r.address,
          r.gisAddress,
          r.image,
          r.priceMin,
          r.priceMax,
          r.tags,
          r.workTime,
          r.phone,
          r.email,
          r.lat,
          r.lng,
          r.description,
        ],
      );
      if (!rows[0]) return;

      await client.query(
        `INSERT INTO restaurant_tables (restaurant_id, number, capacity)
         SELECT $1, n, ($2::int[])[(n - 1) % $3 + 1]
         FROM generate_series(1, $4) AS n`,
        [rows[0].id, r.capacities, r.capacities.length, r.tables],
      );
      created++;
    });
  }

  console.log(
    `Seed done: ${created} restaurant(s) created, ${restaurants.length - created} already existed`,
  );
  await app.close();
}

await seed();
