import { Module } from '@nestjs/common';
import { ProjectTemplateController } from './project-template.controller';
import { ProjectTemplateService } from './project-template.service';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ProjectTemplateController],
  providers: [ProjectTemplateService],
  exports: [ProjectTemplateService],
})
export class ProjectTemplateModule {}
