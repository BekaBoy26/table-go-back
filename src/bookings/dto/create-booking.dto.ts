import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_GUESTS, MAX_HOURS } from '../slots.js';

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

export class CreateBookingDto {
  @IsUUID()
  restaurantId: string;

  @IsUUID()
  tableId: string;

  /** 'YYYY-MM-DD' */
  @Matches(DATE_FORMAT, { message: 'date must be YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  date: string;

  /** Start of an hour, 'HH:00' */
  @Matches(/^([01]\d|2[0-3]):00$/, { message: 'time must be HH:00' })
  time: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_HOURS)
  hours: number = 1;

  @IsInt()
  @Min(1)
  @Max(MAX_GUESTS)
  guests: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class OccupancyQueryDto {
  @IsUUID()
  restaurantId: string;

  @Matches(DATE_FORMAT, { message: 'date must be YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  date: string;
}
