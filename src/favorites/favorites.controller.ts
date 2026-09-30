import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { DatabaseService } from '../database/database.service.js';
import type { User } from '../users/user.entity.js';

const FOREIGN_KEY_VIOLATION = '23503';

/** The current user's favorite restaurants, as a list of restaurant ids. */
@Controller('favorites')
@UseGuards(JwtAuthGuard)
export class FavoritesController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async findAll(@CurrentUser() user: User): Promise<string[]> {
    const { rows } = await this.db.query<{ restaurant_id: string }>(
      'SELECT restaurant_id FROM favorites WHERE user_id = $1 ORDER BY created_at DESC',
      [user.id],
    );
    return rows.map((r) => r.restaurant_id);
  }

  @Put(':restaurantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async add(
    @CurrentUser() user: User,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
  ): Promise<void> {
    await this.db
      .query(
        `INSERT INTO favorites (user_id, restaurant_id) VALUES ($1, $2)
         ON CONFLICT (user_id, restaurant_id) DO NOTHING`,
        [user.id, restaurantId],
      )
      .catch((err: { code?: string }) => {
        if (err.code === FOREIGN_KEY_VIOLATION) {
          throw new NotFoundException(`Restaurant ${restaurantId} not found`);
        }
        throw err;
      });
  }

  @Delete(':restaurantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: User,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
  ): Promise<void> {
    await this.db.query(
      'DELETE FROM favorites WHERE user_id = $1 AND restaurant_id = $2',
      [user.id, restaurantId],
    );
  }
}
