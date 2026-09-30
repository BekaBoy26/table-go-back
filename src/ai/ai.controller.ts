import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RateLimiter } from '../common/rate-limiter.js';
import { AiService } from './ai.service.js';
import { AiSearchDto } from './dto/ai-search.dto.js';

@Controller('ai')
export class AiController {
  /** Each call costs money, so one visitor gets a handful of searches per minute. */
  private readonly limiter = new RateLimiter(
    10,
    60_000,
    'Too many AI searches — please wait a minute',
  );

  constructor(private readonly aiService: AiService) {}

  @Post('search')
  @HttpCode(HttpStatus.OK)
  search(@Req() req: Request, @Body() dto: AiSearchDto) {
    this.limiter.hit(req.ip ?? 'unknown');
    return this.aiService.search(dto);
  }
}
