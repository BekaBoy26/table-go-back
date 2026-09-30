import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Doesn't throw on failure (e.g. the user pressed "Cancel" on Google's screen):
 * req.user stays empty and the controller redirects to the frontend with an error.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    return (err ? null : user || null) as TUser;
  }
}
