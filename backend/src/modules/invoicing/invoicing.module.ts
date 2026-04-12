import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InvoicingService } from './invoicing.service';
import { InvoicingController } from './invoicing.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
  ],
  controllers: [InvoicingController],
  providers: [InvoicingService],
  exports: [InvoicingService],
})
export class InvoicingModule {}
