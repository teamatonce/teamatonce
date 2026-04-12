import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CurrencyService } from './currency.service';
import { CurrencyController } from './currency.controller';
import { CurrencyMiddleware } from './currency.middleware';
import { AuthModule } from '../auth/auth.module';

/**
 * Multi-Currency Support Module
 *
 * Provides exchange rate fetching (with 1-hour cache), currency conversion,
 * locale-aware formatting, user preference storage, and middleware that
 * injects preferred currency into request context.
 *
 * Closes: GitHub issue #55
 */
@Module({
  imports: [ConfigModule, AuthModule],
  providers: [CurrencyService],
  controllers: [CurrencyController],
  exports: [CurrencyService],
})
export class CurrencyModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CurrencyMiddleware).forRoutes('*');
  }
}
