import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TeamAtOnceGateway } from './teamatonce.gateway';
import { WsAuthGuard } from './guards/ws-auth.guard';
import type { StringValue } from 'ms';

/**
 * WebSocket Module for Team@Once Platform
 *
 * This module provides real-time communication capabilities:
 * - Multi-tenant project rooms
 * - Whiteboard collaboration
 * - Member status tracking
 * - Real-time messaging
 * - Redis adapter for horizontal scaling
 */
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '7d') as StringValue,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    TeamAtOnceGateway,
    WsAuthGuard,
  ],
  exports: [
    TeamAtOnceGateway,
  ],
})
export class TeamAtOnceWebSocketModule {}
