import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { RateLimiter } from '../common/rate-limiter.js';
import { LoginDto, RegisterDto } from './dto/credentials.dto.js';
import { UpdateProfileDto } from '../users/dto/update-profile.dto.js';
import { User } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { GoogleAuthGuard } from './guards/google-auth.guard.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
  ) {}

  /** Slows down password guessing and mass sign-ups from one address. */
  private readonly limiter = new RateLimiter(
    10,
    60_000,
    'Too many attempts — please wait a minute',
  );

  @Post('register')
  register(@Req() req: Request, @Body() dto: RegisterDto) {
    this.limiter.hit(req.ip ?? 'unknown');
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Req() req: Request, @Body() dto: LoginDto) {
    this.limiter.hit(req.ip ?? 'unknown');
    return this.authService.login(dto);
  }

  /** Redirects to Google's consent screen (handled by the guard). */
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleLogin() {}

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const redirectUrl = new URL(
      '/auth/callback',
      this.config.getOrThrow<string>('FRONTEND_URL'),
    );

    const user = req.user as User | null;
    if (!user) {
      redirectUrl.searchParams.set('error', 'google_auth_failed');
      return res.redirect(redirectUrl.toString());
    }

    const token = await this.authService.generateToken(user);
    redirectUrl.searchParams.set('token', token);
    return res.redirect(redirectUrl.toString());
  }

  /** Returns the current user by Bearer token. */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request) {
    return req.user;
  }

  /** Updates the current user's name and phone. */
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(@Req() req: Request, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile((req.user as User).id, dto);
  }
}
