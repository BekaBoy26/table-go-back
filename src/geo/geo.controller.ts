import {
  Controller,
  Get,
  Logger,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';

class GeoSearchDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  q: string;
}

export interface Place {
  id: string;
  type: string;
  name: string;
  /** Street and number as 2GIS writes them, e.g. "проспект Чуй, 123". */
  address: string | null;
  lat: number;
  lng: number;
  /** Link to the place's card in 2GIS, for organizations. */
  gisLink: string | null;
}

interface DgisItem {
  id: string;
  type: string;
  name: string;
  address_name?: string;
  full_address_name?: string;
  point?: { lat: number; lon: number };
}

/** Results are ranked around the city center. */
const BISHKEK = '74.59,42.87';
const TIMEOUT_MS = 8_000;

/**
 * Address and place search for the admin map, via the 2GIS Places API. The key
 * stays on the server; admins only, since the key's request quota is limited.
 */
@Controller('geo')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class GeoController {
  private readonly logger = new Logger(GeoController.name);
  private readonly key: string | undefined;

  constructor(config: ConfigService) {
    this.key = config.get<string>('DGIS_API_KEY');
  }

  @Get('search')
  async search(@Query() { q }: GeoSearchDto): Promise<Place[]> {
    if (!this.key) {
      throw new ServiceUnavailableException('Map search is not configured');
    }

    const url = new URL('https://catalog.api.2gis.com/3.0/items');
    url.search = new URLSearchParams({
      q,
      key: this.key,
      fields: 'items.point,items.full_address_name',
      location: BISHKEK,
      sort_point: BISHKEK,
      page_size: '8',
    }).toString();

    let body: { meta?: { code: number }; result?: { items?: DgisItem[] } };
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      body = (await res.json()) as typeof body;
    } catch (err) {
      this.logger.warn(`2GIS search failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'Map search is unavailable, please try again',
      );
    }
    // 404 in meta means "nothing found", not an error
    if (body.meta?.code !== 200) return [];

    return (body.result?.items ?? [])
      .filter(
        (i): i is DgisItem & { point: { lat: number; lon: number } } =>
          !!i.point &&
          // same street names exist in other towns of the region
          (!i.full_address_name || i.full_address_name.startsWith('Бишкек')),
      )
      .map((i) => ({
        id: i.id,
        type: i.type,
        name: i.name,
        // a building's name is its address
        address: i.address_name ?? (i.type === 'building' ? i.name : null),
        lat: i.point.lat,
        lng: i.point.lon,
        gisLink:
          i.type === 'branch'
            ? `https://2gis.kg/bishkek/firm/${i.id.split('_')[0]}`
            : null,
      }));
  }
}
