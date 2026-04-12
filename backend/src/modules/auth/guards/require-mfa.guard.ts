import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

/**
 * Guard that blocks requests from users who have MFA enabled but
 * have NOT completed MFA verification (i.e. their JWT has mfaPending: true).
 *
 * Apply this guard AFTER JwtAuthGuard on financial/sensitive endpoints
 * (escrow release, payment withdrawal, account settings, etc.).
 *
 * Users without MFA enabled are allowed through — this guard only restricts
 * users who have MFA but haven't verified yet in this session.
 */
@Injectable()
export class RequireMfaGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (user?.mfaPending === true) {
      throw new ForbiddenException(
        'MFA verification required. Please complete two-factor authentication before accessing this resource.',
      );
    }

    return true;
  }
}
