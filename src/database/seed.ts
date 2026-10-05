/**
 * Seeds real Bishkek restaurants and cafes with their tables.
 * Idempotent: restaurants that already exist (by name) are skipped.
 *
 * Run: npm run seed
 * Name, address, coordinates, hours and average check come from the places' 2GIS
 * cards (`gisLink`); phones from their listings. `address` is shown in the UI,
 * `gisAddress` is the Russian form 2GIS search understands. Photos are stock
 * pictures of the cuisine, and the table layout is made up.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { DatabaseService } from './database.service.js';

const img = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=800&h=500&fit=crop&auto=format`;
const gis = (id: string) => `https://2gis.kg/bishkek/firm/${id}`;

const restaurants = [
  {
    name: 'Navat',
    cuisine: 'Kyrgyz',
    address: 'Togolok Moldo Street 114/1',
    gisAddress: 'улица Тоголок Молдо, 114/1',
    image: img('1555396273-367ea4eb4db5'),
    priceMin: 400,
    priceMax: 1500,
    tags: [
      'Traditional',
      'Family Friendly',
      'Live Music',
      'Kids Area',
      'Terrace',
      'Breakfast',
    ],
    tables: 24,
    // seats per table, repeated over the tables
    capacities: [4, 4, 6, 8, 10],
    workTime: 'Mon–Sun: 10:00–00:00',
    phone: '+996 551 531 111',
    lat: 42.874219,
    lng: 74.596182,
    gisLink: gis('70000001019343216'),
    description:
      'Popular chaikhana with Kyrgyz and Eastern cuisine: lagman, manty, plov and shashlyk. A national-style interior, private booths, a summer terrace and live music.',
  },
  {
    name: 'Supara',
    cuisine: 'Kyrgyz',
    address: 'Kurmanzhan Datka Street 2, Kok-Jar',
    gisAddress: 'улица Курманжан датка, 2',
    image: img('1504674900247-0877df9cc836'),
    priceMin: 800,
    priceMax: 4000,
    tags: [
      'Traditional',
      'Large Groups',
      'Private Rooms',
      'Outdoor Seating',
      'Wi-Fi',
      'Parking',
    ],
    tables: 20,
    // seats per table, repeated over the tables
    capacities: [4, 6, 8, 12],
    workTime: 'Mon–Sun: 11:00–00:00',
    phone: '+996 555 465 051',
    lat: 42.797165,
    lng: 74.649655,
    gisLink: gis('70000001022776484'),
    description:
      'Ethno-complex on the southern edge of the city: felt yurts and stone houses built from natural materials, traditional Kyrgyz dishes and views of the mountains.',
  },
  {
    name: 'Barashek',
    cuisine: 'European',
    address: 'Aaly Tokombaev Avenue 78B',
    gisAddress: 'проспект Аалы Токомбаева, 78Б',
    image: img('1544025162-d76694265947'),
    priceMin: 1200,
    priceMax: 5000,
    tags: [
      'Family Friendly',
      'Kids Area',
      'Live Music',
      'Terrace',
      'Wi-Fi',
      'Delivery',
    ],
    tables: 16,
    // seats per table, repeated over the tables
    capacities: [2, 4, 6, 8],
    workTime: 'Tue–Sun: 10:00–23:00, Mon: 13:00–23:00',
    phone: '+996 312 52 04 04',
    lat: 42.818305,
    lng: 74.624252,
    gisLink: gis('70000001020104205'),
    description:
      'Family restaurant with European and Eastern cuisine: shashlyk, steaks and khachapuri from the grill. Spacious hall with a view of the south of the city, a kids room and a terrace.',
  },
  {
    name: 'Frunze',
    cuisine: 'European',
    address: 'Abdumomunov Street 220A',
    gisAddress: 'улица Абдумомунова, 220а',
    image: img('1414235077428-338989a2e8c0'),
    priceMin: 1500,
    priceMax: 7000,
    tags: [
      'Business',
      'Romantic',
      'Live Music',
      'Terrace',
      'Private Rooms',
      'Breakfast',
    ],
    tables: 18,
    // seats per table, repeated over the tables
    capacities: [2, 4, 4, 6],
    workTime: 'Mon–Sun: 10:00–00:00',
    phone: '+996 551 66 44 66',
    lat: 42.878886,
    lng: 74.606941,
    gisLink: gis('70000001022883897'),
    description:
      'National and European dishes in the city center, a terrace with a fountain and live music in the evenings. Business lunches on weekdays.',
  },
  {
    name: 'Faiza',
    cuisine: 'Uyghur',
    address: 'Zhibek Zholu Avenue 1143',
    gisAddress: 'проспект Жибек-Жолу, 1143-1145',
    image: img('1569050467447-ce54b3bbc37d'),
    priceMin: 400,
    priceMax: 1500,
    tags: ['Traditional', 'Family Friendly', 'Quick', 'Delivery'],
    tables: 20,
    // seats per table, repeated over the tables
    capacities: [4, 4, 6, 8],
    workTime: 'Mon–Sat: 09:00–21:00, Sun: 10:00–21:00',
    phone: '+996 312 65 23 78',
    lat: 42.88418,
    lng: 74.586919,
    gisLink: gis('70000001019339201'),
    description:
      'A Bishkek classic since 1998: Uyghur and Kyrgyz cuisine, famous for its lagman, manty and ashlan-fu. Generous portions at low prices.',
  },
  {
    name: 'Zerno',
    cuisine: 'European',
    address: 'Turusbekov Street 31',
    gisAddress: 'улица Турусбекова, 31',
    image: img('1600891964092-4316c288032e'),
    priceMin: 1200,
    priceMax: 5000,
    tags: [
      'Halal',
      'Romantic',
      'Business',
      'Live Music',
      'Private Rooms',
      'Wi-Fi',
    ],
    tables: 16,
    // seats per table, repeated over the tables
    capacities: [2, 4, 4, 6],
    workTime: 'Mon–Sun: 11:00–23:00',
    phone: '+996 773 53 33 33',
    lat: 42.869685,
    lng: 74.584377,
    gisLink: gis('70000001057692093'),
    description:
      'Halal restaurant built around natural seasonal produce, with its own oven, cheese dairy and smokehouse. Steaks, business lunches and live music.',
  },
  {
    name: 'Gandhi',
    cuisine: 'Indian',
    address: 'Isanov Street 41',
    gisAddress: 'улица Насирдина Исанова, 41',
    image: img('1585937421612-70a008356fbe'),
    priceMin: 500,
    priceMax: 3000,
    tags: ['Vegetarian Options', 'Quiet', 'Terrace', 'Wi-Fi', 'Delivery'],
    tables: 12,
    // seats per table, repeated over the tables
    capacities: [2, 4, 4, 6],
    workTime: 'Mon–Sun: 11:00–23:00',
    phone: '+996 770 00 31 85',
    lat: 42.871865,
    lng: 74.591448,
    gisLink: gis('70000001038379967'),
    description:
      'A little India in Bishkek: curries, tandoor dishes and plenty of vegetarian options. Lunch set from 11:00 to 15:00 and a summer terrace.',
  },
  {
    name: 'Cyclone',
    cuisine: 'Italian',
    address: 'Chuy Avenue 136',
    gisAddress: 'проспект Чуй, 136',
    image: img('1513104890138-7c749659a591'),
    priceMin: 700,
    priceMax: 3000,
    tags: ['Romantic', 'Quiet', 'Outdoor Seating', 'Wi-Fi'],
    tables: 8,
    // seats per table, repeated over the tables
    capacities: [2, 2, 4],
    workTime: 'Mon–Sun: 11:00–23:00',
    phone: '+996 312 66 11 40',
    lat: 42.875913,
    lng: 74.595542,
    gisLink: gis('70000001035157143'),
    description:
      'One of the oldest Italian restaurants in the city: pasta, pizza, risotto and a wine list. A small cozy hall and tables outside on Chuy Avenue.',
  },
  {
    name: 'Sierra',
    cuisine: 'Coffee & Desserts',
    address: 'Manas Avenue 57/1',
    gisAddress: 'проспект Манаса, 57/1',
    image: img('1495474472287-4d71bcdd2085'),
    priceMin: 400,
    priceMax: 1500,
    tags: ['Breakfast', 'Wi-Fi', 'Terrace', 'Quiet', 'Business'],
    tables: 14,
    // seats per table, repeated over the tables
    capacities: [2, 2, 4, 6],
    workTime: 'Mon–Sun: 07:30–23:00',
    phone: '+996 770 96 96 64',
    lat: 42.874551,
    lng: 74.588582,
    gisLink: gis('70000001019350197'),
    description:
      'Coffee shop with its own roastery: all-day breakfasts, pancakes, bowls and burgers. A good place to work with a laptop, plus a summer terrace.',
  },
  {
    name: 'Bublik',
    cuisine: 'Coffee & Desserts',
    address: 'Togolok Moldo Street 5/1',
    gisAddress: 'улица Тоголок Молдо, 5/1',
    image: img('1509042239860-f550ce710b93'),
    priceMin: 300,
    priceMax: 1000,
    tags: ['Breakfast', 'Wi-Fi', 'Outdoor Seating', 'Quick', 'Delivery'],
    tables: 12,
    // seats per table, repeated over the tables
    capacities: [2, 2, 4],
    workTime: 'Mon–Sat: 08:00–00:00, Sun: 10:00–00:00',
    phone: '+996 551 155 555',
    lat: 42.873571,
    lng: 74.596017,
    gisLink: gis('70000001020095176'),
    description:
      'Cozy coffee shop in the center: specialty coffee, hummus with pita, bowls and desserts. Tables outside in the warm season.',
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
            work_time, phone, gis_link, latitude, longitude, description)
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
          r.gisLink,
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
