import { PickType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsIn,
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
import { MAX_GUESTS, SLOT_TIMES } from '../slots.js';

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

export class CreateBookingDto {
  @IsUUID()
  restaurantId: string;

  /** 'YYYY-MM-DD' */
  @Matches(DATE_FORMAT, { message: 'date must be YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  date: string;

  @IsIn(SLOT_TIMES)
  time: string;

  @IsInt()
  @Min(1)
  @Max(MAX_GUESTS)
  guests: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AvailabilityQueryDto {
  @IsUUID()
  restaurantId: string;

  @Matches(DATE_FORMAT, { message: 'date must be YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  date: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_GUESTS)
  guests: number = 2;
}

export class OccupancyQueryDto extends PickType(AvailabilityQueryDto, [
  'restaurantId',
  'date',
]) {}
