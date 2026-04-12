import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TimeTrackingService } from './time-tracking.service';
import {
  StartTimerDto,
  ManualTimeEntryDto,
  GetTimeEntriesQueryDto,
  SubmitTimesheetDto,
  RejectTimesheetDto,
} from './dto';

@ApiTags('Time Tracking')
@Controller('time-tracking')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TimeTrackingController {
  constructor(private readonly timeTrackingService: TimeTrackingService) {}

  // ============================================
  // TIMER ENDPOINTS
  // ============================================

  @Post('start')
  @ApiOperation({ summary: 'Start a timer' })
  @ApiResponse({ status: 201, description: 'Timer started' })
  @ApiResponse({ status: 409, description: 'Timer already running' })
  async startTimer(@Request() req: any, @Body() dto: StartTimerDto) {
    const userId = req.user.sub || req.user.userId;
    return this.timeTrackingService.startTimer(userId, dto);
  }

  @Post('stop/:entryId')
  @ApiOperation({ summary: 'Stop a running timer' })
  @ApiResponse({ status: 200, description: 'Timer stopped' })
  @ApiResponse({ status: 404, description: 'Entry not found' })
  @ApiResponse({ status: 400, description: 'Timer is not running' })
  @ApiParam({ name: 'entryId', description: 'Time entry ID' })
  async stopTimer(
    @Request() req: any,
    @Param('entryId') entryId: string,
  ) {
    const userId = req.user.sub || req.user.userId;
    return this.timeTrackingService.stopTimer(userId, entryId);
  }

  @Post('manual')
  @ApiOperation({ summary: 'Add a manual time entry' })
  @ApiResponse({ status: 201, description: 'Manual entry created' })
  @ApiResponse({ status: 400, description: 'Invalid time range' })
  async addManualEntry(
    @Request() req: any,
    @Body() dto: ManualTimeEntryDto,
  ) {
    const userId = req.user.sub || req.user.userId;
    return this.timeTrackingService.addManualEntry(userId, dto);
  }

  // ============================================
  // QUERY ENDPOINTS
  // ============================================

  @Get('entries')
  @ApiOperation({ summary: 'Get my time entries with filters' })
  @ApiResponse({ status: 200, description: 'Time entries returned' })
  async getEntries(
    @Request() req: any,
    @Query() query: GetTimeEntriesQueryDto,
  ) {
    const userId = req.user.sub || req.user.userId;
    return this.timeTrackingService.getEntries(userId, query);
  }

  @Get('projects/:projectId/report')
  @ApiOperation({ summary: 'Get project time report' })
  @ApiResponse({ status: 200, description: 'Project report returned' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  async getProjectReport(@Param('projectId') projectId: string) {
    return this.timeTrackingService.getProjectTimeReport(projectId);
  }

  // ============================================
  // TIMESHEET ENDPOINTS
  // ============================================

  @Post('timesheets/:projectId/submit')
  @ApiOperation({ summary: 'Submit weekly timesheet for approval' })
  @ApiResponse({ status: 201, description: 'Timesheet submitted' })
  @ApiResponse({ status: 400, description: 'No tracked time or already approved' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  async submitTimesheet(
    @Request() req: any,
    @Param('projectId') projectId: string,
    @Body() dto: SubmitTimesheetDto,
  ) {
    const userId = req.user.sub || req.user.userId;
    return this.timeTrackingService.submitTimesheet(userId, projectId, dto);
  }

  @Patch('timesheets/:id/approve')
  @ApiOperation({ summary: 'Approve a timesheet (client)' })
  @ApiResponse({ status: 200, description: 'Timesheet approved' })
  @ApiResponse({ status: 404, description: 'Timesheet not found' })
  @ApiParam({ name: 'id', description: 'Timesheet ID' })
  async approveTimesheet(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    const clientId = req.user.sub || req.user.userId;
    return this.timeTrackingService.approveTimesheet(clientId, id);
  }

  @Patch('timesheets/:id/reject')
  @ApiOperation({ summary: 'Reject a timesheet with reason (client)' })
  @ApiResponse({ status: 200, description: 'Timesheet rejected' })
  @ApiResponse({ status: 404, description: 'Timesheet not found' })
  @ApiParam({ name: 'id', description: 'Timesheet ID' })
  async rejectTimesheet(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: RejectTimesheetDto,
  ) {
    const clientId = req.user.sub || req.user.userId;
    return this.timeTrackingService.rejectTimesheet(clientId, id, dto.reason);
  }
}
