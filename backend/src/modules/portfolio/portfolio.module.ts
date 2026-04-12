import { Module } from '@nestjs/common';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import { AuthModule } from '../auth/auth.module';

/**
 * Portfolio Module
 *
 * Manages developer and company portfolio showcases including:
 * - Portfolio item CRUD (projects, case studies, demos)
 * - GitHub repository import (pinned/top repos)
 * - Code snippet showcase with syntax highlighting metadata
 * - Featured items for profile cards
 * - Paginated public portfolio browsing
 *
 * Closes: GitHub issue #51
 */
@Module({
  imports: [AuthModule],
  controllers: [PortfolioController],
  providers: [PortfolioService],
  exports: [PortfolioService],
})
export class PortfolioModule {}
