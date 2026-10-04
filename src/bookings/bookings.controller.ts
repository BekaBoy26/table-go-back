import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { User } from '../users/user.entity.js';
import { BookingsService } from './bookings.service.js';
import {
  CreateBookingDto,
  OccupancyQueryDto,
} from './dto/create-booking.dto.js';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  /** Public: every table of the restaurant with its booked slots on a day. */
  @Get('occupancy')
  occupancy(@Query() query: OccupancyQueryDto) {
    return this.bookingsService.occupancy(query);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: User, @Body() dto: CreateBookingDto) {
    return this.bookingsService.create(user, dto);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  findMine(@CurrentUser() user: User) {
    return this.bookingsService.findMine(user.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  findAll() {
    return this.bookingsService.findAll();
  }

  @Patch(':id/cancel')
  @UseGuards(JwtAuthGuard)
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.bookingsService.cancel(id, user);
  }
}
