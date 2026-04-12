import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  StartTimerDto,
  ManualTimeEntryDto,
  GetTimeEntriesQueryDto,
  TimeEntryStatus,
  TimesheetStatus,
  SubmitTimesheetDto,
  RejectTimesheetDto,
} from './dto';

@Injectable()
export class TimeTrackingService implements OnModuleInit {
  private readonly logger = new Logger(TimeTrackingService.name);

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit() {
    await this.ensureTables();
  }

  /**
   * Create time_entries and timesheets tables if they don't exist.
   */
  private async ensureTables() {
    try {
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS "time_entries" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "user_id" TEXT NOT NULL,
          "project_id" TEXT NOT NULL,
          "milestone_id" TEXT,
          "description" TEXT,
          "start_time" TIMESTAMPTZ NOT NULL,
          "end_time" TIMESTAMPTZ,
          "duration_minutes" INTEGER,
          "status" TEXT NOT NULL DEFAULT 'running',
          "is_manual" BOOLEAN NOT NULL DEFAULT false,
          "notes" TEXT,
          "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await this.db.query(`
        CREATE TABLE IF NOT EXISTS "timesheets" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "project_id" TEXT NOT NULL,
          "user_id" TEXT NOT NULL,
          "week_start" DATE NOT NULL,
          "total_minutes" INTEGER NOT NULL DEFAULT 0,
          "status" TEXT NOT NULL DEFAULT 'pending',
          "rejection_reason" TEXT,
          "submitted_at" TIMESTAMPTZ,
          "reviewed_at" TIMESTAMPTZ,
          "reviewed_by" TEXT,
          "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      this.logger.log('Time tracking tables ensured');
    } catch (error: any) {
      this.logger.error('Failed to create time tracking tables', error.message);
    }
  }

  // ============================================
  // TIMER OPERATIONS
  // ============================================

  /**
   * Start tracking time. Only one running timer allowed per user.
   */
  async startTimer(userId: string, dto: StartTimerDto) {
    // Check for existing running timer
    const running = await this.db.findOne('time_entries', {
      user_id: userId,
      status: TimeEntryStatus.RUNNING,
    });

    if (running) {
      throw new ConflictException(
        'You already have a running timer. Stop it before starting a new one.',
      );
    }

    // Verify project exists
    const project = await this.db.findOne('projects', { id: dto.projectId });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const entry = await this.db.insert('time_entries', {
      user_id: userId,
      project_id: dto.projectId,
      milestone_id: dto.milestoneId || null,
      description: dto.description || null,
      start_time: new Date().toISOString(),
      status: TimeEntryStatus.RUNNING,
      is_manual: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return entry;
  }

  /**
   * Stop a running timer and calculate duration.
   */
  async stopTimer(userId: string, entryId: string) {
    const entry = await this.db.findOne('time_entries', { id: entryId });

    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }

    if (entry.user_id !== userId) {
      throw new ForbiddenException('You can only stop your own timers');
    }

    if (entry.status !== TimeEntryStatus.RUNNING) {
      throw new BadRequestException('Timer is not running');
    }

    const endTime = new Date();
    const startTime = new Date(entry.start_time);
    const durationMinutes = Math.round(
      (endTime.getTime() - startTime.getTime()) / (1000 * 60),
    );

    const updated = await this.db.update('time_entries', entryId, {
      end_time: endTime.toISOString(),
      duration_minutes: durationMinutes,
      status: TimeEntryStatus.STOPPED,
      updated_at: new Date().toISOString(),
    });

    return updated;
  }

  /**
   * Add a manual time entry with start/end times.
   */
  async addManualEntry(userId: string, dto: ManualTimeEntryDto) {
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);

    if (endTime <= startTime) {
      throw new BadRequestException('End time must be after start time');
    }

    // Verify project exists
    const project = await this.db.findOne('projects', { id: dto.projectId });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const durationMinutes = Math.round(
      (endTime.getTime() - startTime.getTime()) / (1000 * 60),
    );

    const entry = await this.db.insert('time_entries', {
      user_id: userId,
      project_id: dto.projectId,
      milestone_id: dto.milestoneId || null,
      description: dto.description || null,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      duration_minutes: durationMinutes,
      status: TimeEntryStatus.STOPPED,
      is_manual: true,
      notes: dto.notes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return entry;
  }

  // ============================================
  // QUERIES
  // ============================================

  /**
   * List time entries for a user with optional filters.
   */
  async getEntries(userId: string, query: GetTimeEntriesQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 50;
    const offset = (page - 1) * limit;

    const conditions: string[] = ['"user_id" = $1'];
    const params: any[] = [userId];
    let paramIndex = 2;

    if (query.projectId) {
      conditions.push(`"project_id" = $${paramIndex}`);
      params.push(query.projectId);
      paramIndex++;
    }

    if (query.status) {
      conditions.push(`"status" = $${paramIndex}`);
      params.push(query.status);
      paramIndex++;
    }

    if (query.fromDate) {
      conditions.push(`"start_time" >= $${paramIndex}`);
      params.push(query.fromDate);
      paramIndex++;
    }

    if (query.toDate) {
      conditions.push(`"start_time" <= $${paramIndex}`);
      params.push(query.toDate);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const countSql = `SELECT COUNT(*) as total FROM "time_entries" WHERE ${whereClause}`;
    const dataSql = `
      SELECT * FROM "time_entries"
      WHERE ${whereClause}
      ORDER BY "start_time" DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const [countResult, dataResult] = await Promise.all([
      this.db.query(countSql, params),
      this.db.query(dataSql, [...params, limit, offset]),
    ]);

    const total = parseInt(countResult.rows[0]?.total || '0', 10);

    return {
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get project time report: total hours by user, by milestone, by day/week.
   */
  async getProjectTimeReport(projectId: string) {
    // Total hours by user
    const byUserSql = `
      SELECT
        "user_id",
        SUM("duration_minutes") as total_minutes,
        COUNT(*) as entry_count
      FROM "time_entries"
      WHERE "project_id" = $1 AND "status" != 'running'
      GROUP BY "user_id"
      ORDER BY total_minutes DESC
    `;

    // Total hours by milestone
    const byMilestoneSql = `
      SELECT
        "milestone_id",
        SUM("duration_minutes") as total_minutes,
        COUNT(*) as entry_count
      FROM "time_entries"
      WHERE "project_id" = $1 AND "status" != 'running' AND "milestone_id" IS NOT NULL
      GROUP BY "milestone_id"
      ORDER BY total_minutes DESC
    `;

    // Total hours by day (last 30 days)
    const byDaySql = `
      SELECT
        DATE("start_time") as date,
        SUM("duration_minutes") as total_minutes,
        COUNT(*) as entry_count
      FROM "time_entries"
      WHERE "project_id" = $1
        AND "status" != 'running'
        AND "start_time" >= NOW() - INTERVAL '30 days'
      GROUP BY DATE("start_time")
      ORDER BY date DESC
    `;

    // Total hours by week (last 12 weeks)
    const byWeekSql = `
      SELECT
        DATE_TRUNC('week', "start_time")::date as week_start,
        SUM("duration_minutes") as total_minutes,
        COUNT(*) as entry_count
      FROM "time_entries"
      WHERE "project_id" = $1
        AND "status" != 'running'
        AND "start_time" >= NOW() - INTERVAL '12 weeks'
      GROUP BY DATE_TRUNC('week', "start_time")
      ORDER BY week_start DESC
    `;

    // Overall totals
    const totalSql = `
      SELECT
        SUM("duration_minutes") as total_minutes,
        COUNT(*) as total_entries
      FROM "time_entries"
      WHERE "project_id" = $1 AND "status" != 'running'
    `;

    const [byUser, byMilestone, byDay, byWeek, totals] = await Promise.all([
      this.db.query(byUserSql, [projectId]),
      this.db.query(byMilestoneSql, [projectId]),
      this.db.query(byDaySql, [projectId]),
      this.db.query(byWeekSql, [projectId]),
      this.db.query(totalSql, [projectId]),
    ]);

    const totalMinutes = parseInt(totals.rows[0]?.total_minutes || '0', 10);

    return {
      projectId,
      totalMinutes,
      totalHours: parseFloat((totalMinutes / 60).toFixed(2)),
      totalEntries: parseInt(totals.rows[0]?.total_entries || '0', 10),
      byUser: byUser.rows.map((r: any) => ({
        userId: r.user_id,
        totalMinutes: parseInt(r.total_minutes, 10),
        totalHours: parseFloat((parseInt(r.total_minutes, 10) / 60).toFixed(2)),
        entryCount: parseInt(r.entry_count, 10),
      })),
      byMilestone: byMilestone.rows.map((r: any) => ({
        milestoneId: r.milestone_id,
        totalMinutes: parseInt(r.total_minutes, 10),
        totalHours: parseFloat((parseInt(r.total_minutes, 10) / 60).toFixed(2)),
        entryCount: parseInt(r.entry_count, 10),
      })),
      byDay: byDay.rows.map((r: any) => ({
        date: r.date,
        totalMinutes: parseInt(r.total_minutes, 10),
        entryCount: parseInt(r.entry_count, 10),
      })),
      byWeek: byWeek.rows.map((r: any) => ({
        weekStart: r.week_start,
        totalMinutes: parseInt(r.total_minutes, 10),
        entryCount: parseInt(r.entry_count, 10),
      })),
    };
  }

  // ============================================
  // TIMESHEETS
  // ============================================

  /**
   * Get timesheet for client approval (creates one if it doesn't exist).
   */
  async getTimesheetForApproval(projectId: string, weekStart: string) {
    // Find existing timesheet
    let timesheet = await this.db.findOne('timesheets', {
      project_id: projectId,
      week_start: weekStart,
    });

    if (!timesheet) {
      throw new NotFoundException('No timesheet found for this week');
    }

    // Get associated time entries
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const entriesSql = `
      SELECT * FROM "time_entries"
      WHERE "project_id" = $1
        AND "start_time" >= $2
        AND "start_time" < $3
        AND "status" != 'running'
      ORDER BY "start_time" ASC
    `;

    const entries = await this.db.query(entriesSql, [
      projectId,
      weekStart,
      weekEnd.toISOString(),
    ]);

    return {
      ...timesheet,
      entries: entries.rows,
    };
  }

  /**
   * Submit a weekly timesheet for approval.
   */
  async submitTimesheet(userId: string, projectId: string, dto: SubmitTimesheetDto) {
    const weekStart = dto.weekStart;

    // Calculate total minutes for this week
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const totalSql = `
      SELECT COALESCE(SUM("duration_minutes"), 0) as total_minutes
      FROM "time_entries"
      WHERE "user_id" = $1
        AND "project_id" = $2
        AND "start_time" >= $3
        AND "start_time" < $4
        AND "status" != 'running'
    `;

    const totalResult = await this.db.query(totalSql, [
      userId,
      projectId,
      weekStart,
      weekEnd.toISOString(),
    ]);

    const totalMinutes = parseInt(totalResult.rows[0]?.total_minutes || '0', 10);

    if (totalMinutes === 0) {
      throw new BadRequestException('No tracked time for this week');
    }

    // Check if a timesheet already exists
    const existing = await this.db.findOne('timesheets', {
      project_id: projectId,
      user_id: userId,
      week_start: weekStart,
    });

    if (existing) {
      if (existing.status === TimesheetStatus.APPROVED) {
        throw new BadRequestException('Timesheet already approved');
      }

      // Re-submit (update existing)
      const updated = await this.db.update('timesheets', existing.id, {
        total_minutes: totalMinutes,
        status: TimesheetStatus.PENDING,
        rejection_reason: null,
        submitted_at: new Date().toISOString(),
        reviewed_at: null,
        reviewed_by: null,
        updated_at: new Date().toISOString(),
      });

      return updated;
    }

    // Create new timesheet
    const timesheet = await this.db.insert('timesheets', {
      project_id: projectId,
      user_id: userId,
      week_start: weekStart,
      total_minutes: totalMinutes,
      status: TimesheetStatus.PENDING,
      submitted_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return timesheet;
  }

  /**
   * Client approves a weekly timesheet.
   */
  async approveTimesheet(clientId: string, timesheetId: string) {
    const timesheet = await this.db.findOne('timesheets', { id: timesheetId });

    if (!timesheet) {
      throw new NotFoundException('Timesheet not found');
    }

    if (timesheet.status === TimesheetStatus.APPROVED) {
      throw new BadRequestException('Timesheet is already approved');
    }

    const updated = await this.db.update('timesheets', timesheetId, {
      status: TimesheetStatus.APPROVED,
      reviewed_at: new Date().toISOString(),
      reviewed_by: clientId,
      updated_at: new Date().toISOString(),
    });

    // Also mark all time entries for this period as approved
    const weekEnd = new Date(timesheet.week_start);
    weekEnd.setDate(weekEnd.getDate() + 7);

    await this.db.query(
      `UPDATE "time_entries"
       SET "status" = $1, "updated_at" = $2
       WHERE "user_id" = $3
         AND "project_id" = $4
         AND "start_time" >= $5
         AND "start_time" < $6
         AND "status" = $7`,
      [
        TimeEntryStatus.APPROVED,
        new Date().toISOString(),
        timesheet.user_id,
        timesheet.project_id,
        timesheet.week_start,
        weekEnd.toISOString(),
        TimeEntryStatus.STOPPED,
      ],
    );

    return updated;
  }

  /**
   * Client rejects a weekly timesheet with reason.
   */
  async rejectTimesheet(clientId: string, timesheetId: string, reason: string) {
    const timesheet = await this.db.findOne('timesheets', { id: timesheetId });

    if (!timesheet) {
      throw new NotFoundException('Timesheet not found');
    }

    if (timesheet.status === TimesheetStatus.APPROVED) {
      throw new BadRequestException('Cannot reject an approved timesheet');
    }

    const updated = await this.db.update('timesheets', timesheetId, {
      status: TimesheetStatus.REJECTED,
      rejection_reason: reason,
      reviewed_at: new Date().toISOString(),
      reviewed_by: clientId,
      updated_at: new Date().toISOString(),
    });

    // Also mark time entries as rejected
    const weekEnd = new Date(timesheet.week_start);
    weekEnd.setDate(weekEnd.getDate() + 7);

    await this.db.query(
      `UPDATE "time_entries"
       SET "status" = $1, "updated_at" = $2
       WHERE "user_id" = $3
         AND "project_id" = $4
         AND "start_time" >= $5
         AND "start_time" < $6
         AND "status" = $7`,
      [
        TimeEntryStatus.REJECTED,
        new Date().toISOString(),
        timesheet.user_id,
        timesheet.project_id,
        timesheet.week_start,
        weekEnd.toISOString(),
        TimeEntryStatus.STOPPED,
      ],
    );

    return updated;
  }
}
