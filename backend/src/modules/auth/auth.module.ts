import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RequireMfaGuard } from './guards/require-mfa.guard';
import { MfaService } from './mfa/mfa.service';
import { MfaController } from './mfa/mfa.controller';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES_IN') || '7d',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, MfaController],
  providers: [
    AuthService,
    MfaService,
    JwtAuthGuard,
    RequireMfaGuard,
  ],
  exports: [AuthService, MfaService, JwtModule, JwtAuthGuard, RequireMfaGuard],
})
export class AuthModule {}