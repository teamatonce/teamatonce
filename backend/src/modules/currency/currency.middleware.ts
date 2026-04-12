import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { CurrencyService } from './currency.service';
import * as jwt from 'jsonwebtoken';

/**
 * CurrencyMiddleware
 *
 * Reads the user's preferred currency from JWT/session and injects it
 * into the request context as `req.preferredCurrency`.
 *
 * Contract amounts are stored in any currency; display conversion
 * happens at read time using this middleware-provided currency preference.
 */
@Injectable()
export class CurrencyMiddleware implements NestMiddleware {
  constructor(private readonly currencyService: CurrencyService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.decode(token) as any;

        if (decoded) {
          const userId = decoded.sub || decoded.userId || decoded.id || decoded.user_id;
          if (userId) {
            const currency = await this.currencyService.getUserPreferredCurrency(userId);
            (req as any).preferredCurrency = currency;
          }
        }
      }
    } catch {
      // Silently fail -- default to USD if anything goes wrong
    }

    if (!(req as any).preferredCurrency) {
      (req as any).preferredCurrency = 'USD';
    }

    next();
  }
}
