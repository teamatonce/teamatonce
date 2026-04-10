import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, QueryResult } from 'pg';
import { QueryBuilder } from './query-builder';
import {
  AuthConfig,
  getAuthConfig,
  registerUser,
  loginUser,
  refreshSessionFn,
  requestPasswordResetFn,
  resetPasswordFn,
  changePasswordFn,
  verifyEmailFn,
  updateUserFn,
  deleteUserFn,
  banUserFn,
  unbanUserFn,
} from './auth-helpers';
import {
  StorageConfig,
  getStorageConfig,
  uploadFileFn,
  downloadFileFn,
  deleteFileFn,
  getPublicUrlFn,
  createSignedUrlFn,
} from './storage-helpers';
import { EmailConfig, getEmailConfig, sendEmailFn } from './email-helpers';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool;
  private authConfig!: AuthConfig;
  private storageConfig!: StorageConfig;
  private emailConfig!: EmailConfig;

  constructor(private configService: ConfigService) {}

  private cfg = (key: string, fallback?: any): any => this.configService.get(key, fallback);

  async onModuleInit() {
    this.pool = new Pool({
      host: this.configService.get('DATABASE_HOST', 'localhost'),
      port: this.configService.get<number>('DATABASE_PORT', 5432),
      database: this.configService.get('DATABASE_NAME', 'teamatonce_dev'),
      user: this.configService.get('DATABASE_USER', 'postgres'),
      password: this.configService.get('DATABASE_PASSWORD', 'postgres'),
      min: this.configService.get<number>('DATABASE_POOL_MIN', 2),
      max: this.configService.get<number>('DATABASE_POOL_MAX', 10),
    });

    // Test connection
    try {
      const client = await this.pool.connect();
      client.release();
      this.logger.log('PostgreSQL connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to PostgreSQL', error.message);
      throw error;
    }

    // Initialize service configs (auth, storage, email)
    this.authConfig = getAuthConfig(this.cfg);
    this.storageConfig = getStorageConfig(this.cfg);
    this.emailConfig = getEmailConfig(this.cfg);
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }

  // ============================================
  // Core Query Method
  // ============================================

  // Hybrid: db.query(sql, params) runs raw SQL; db.query() returns a chainable
  // shim with .from(table) for the legacy SDK pattern: db.query().from('t').select(...)
  query(sql?: any, params?: any[]): any {
    if (typeof sql === 'string') {
      return this.pool.query(sql, params);
    }
    return {
      from: (tableName: string) => this.table(tableName),
    };
  }

  // ============================================
  // Query Builder (replaces databaseService.table())
  // ============================================

  table(tableName: string): QueryBuilder {
    return new QueryBuilder(this.pool, tableName);
  }

  /**
   * Wrap a row array as an Array-like result that also exposes `.data`
   * (self-reference) and `.count`. Lets callers use both Array methods
   * (.filter/.map/.length) and the {data, count} destructuring shape.
   */
  private wrapResult(rows: any[], count?: number): any {
    const arr: any = rows.slice();
    arr.data = arr;
    arr.count = count ?? rows.length;
    return arr;
  }

  // Alias for backward compatibility with database.raw() / database.execute()
  async raw(sql: string, params?: any[]): Promise<QueryResult> {
    return this.query(sql, params);
  }

  async execute(sql: string, params?: any[]): Promise<QueryResult> {
    return this.query(sql, params);
  }

  // ============================================
  // CRUD Helper Methods
  // (Drop-in replacements for DatabaseService methods)
  // ============================================

  async findOne(tableName: string, conditions: Record<string, any>): Promise<any | null> {
    const { whereClause, values } = this.buildWhereClause(conditions);
    const sql = `SELECT * FROM ${this.escapeIdentifier(tableName)} ${whereClause} LIMIT 1`;
    const { rows } = await this.query(sql, values);
    return rows[0] || null;
  }

  async findMany(
    tableName: string,
    conditions: Record<string, any> = {},
    options: { orderBy?: string; order?: 'asc' | 'desc'; limit?: number; offset?: number } = {},
  ): Promise<any> {
    const { whereClause, values } = this.buildWhereClause(conditions);
    let sql = `SELECT * FROM ${this.escapeIdentifier(tableName)} ${whereClause}`;
    const params = [...values];

    if (options.orderBy) {
      sql += ` ORDER BY ${this.escapeIdentifier(options.orderBy)} ${options.order === 'desc' ? 'DESC' : 'ASC'}`;
    }
    if (options.limit) {
      params.push(options.limit);
      sql += ` LIMIT $${params.length}`;
    }
    if (options.offset) {
      params.push(options.offset);
      sql += ` OFFSET $${params.length}`;
    }

    const { rows } = await this.query(sql, params);
    return this.wrapResult(rows);
  }

  // Alias matching DatabaseService.find() which also returns count
  async find(
    tableName: string,
    conditions: Record<string, any> = {},
    options: { orderBy?: string; order?: 'asc' | 'desc'; limit?: number; offset?: number } = {},
  ): Promise<any> {
    const result: any[] = await this.findMany(tableName, conditions, options);

    // Get total count
    const { whereClause, values } = this.buildWhereClause(conditions);
    const countSql = `SELECT COUNT(*) as count FROM ${this.escapeIdentifier(tableName)} ${whereClause}`;
    const { rows: countRows } = await this.query(countSql, values);

    return this.wrapResult(result, parseInt(countRows[0]?.count || '0', 10));
  }

  async select(tableName: string, options: any = {}): Promise<any> {
    return this.findMany(tableName, options.where || {}, {
      orderBy: options.orderBy,
      order: options.order,
      limit: options.limit,
      offset: options.offset,
    });
  }

  async insert(tableName: string, data: Record<string, any>): Promise<any> {
    const keys = Object.keys(data).filter((k) => data[k] !== undefined);
    const values = keys.map((k) => data[k]);
    const placeholders = keys.map((_, i) => `$${i + 1}`);
    const columns = keys.map((k) => this.escapeIdentifier(k));

    const sql = `INSERT INTO ${this.escapeIdentifier(tableName)} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
    const { rows } = await this.query(sql, values);
    return rows[0];
  }

  async insertMany(tableName: string, dataArray: Record<string, any>[]): Promise<any[]> {
    if (dataArray.length === 0) return [];

    const keys = Object.keys(dataArray[0]).filter((k) => dataArray[0][k] !== undefined);
    const columns = keys.map((k) => this.escapeIdentifier(k));
    const allValues: any[] = [];
    const rowPlaceholders: string[] = [];

    dataArray.forEach((data, rowIdx) => {
      const placeholders = keys.map((k, colIdx) => {
        allValues.push(data[k]);
        return `$${rowIdx * keys.length + colIdx + 1}`;
      });
      rowPlaceholders.push(`(${placeholders.join(', ')})`);
    });

    const sql = `INSERT INTO ${this.escapeIdentifier(tableName)} (${columns.join(', ')}) VALUES ${rowPlaceholders.join(', ')} RETURNING *`;
    const { rows } = await this.query(sql, allValues);
    return rows;
  }

  async update(tableName: string, conditions: string | Record<string, any>, data: Record<string, any>): Promise<any> {
    const updateKeys = Object.keys(data).filter((k) => data[k] !== undefined);
    const updateValues = updateKeys.map((k) => data[k]);
    const setClauses = updateKeys.map((k, i) => `${this.escapeIdentifier(k)} = $${i + 1}`);

    let whereStr: string;
    let whereValues: any[];

    if (typeof conditions === 'string') {
      // conditions is an ID string
      whereStr = `WHERE id = $${updateValues.length + 1}`;
      whereValues = [conditions];
    } else {
      const built = this.buildWhereClause(conditions, updateValues.length);
      whereStr = built.whereClause;
      whereValues = built.values;
    }

    const sql = `UPDATE ${this.escapeIdentifier(tableName)} SET ${setClauses.join(', ')} ${whereStr} RETURNING *`;
    const { rows } = await this.query(sql, [...updateValues, ...whereValues]);
    return rows[0] || null;
  }

  async updateMany(tableName: string, conditions: Record<string, any>, data: Record<string, any>): Promise<any[]> {
    const updateKeys = Object.keys(data).filter((k) => data[k] !== undefined);
    const updateValues = updateKeys.map((k) => data[k]);
    const setClauses = updateKeys.map((k, i) => `${this.escapeIdentifier(k)} = $${i + 1}`);

    const { whereClause, values: whereValues } = this.buildWhereClause(conditions, updateValues.length);

    const sql = `UPDATE ${this.escapeIdentifier(tableName)} SET ${setClauses.join(', ')} ${whereClause} RETURNING *`;
    const { rows } = await this.query(sql, [...updateValues, ...whereValues]);
    return rows;
  }

  async delete(tableName: string, id: string): Promise<void> {
    await this.query(`DELETE FROM ${this.escapeIdentifier(tableName)} WHERE id = $1`, [id]);
  }

  async deleteMany(tableName: string, conditions: Record<string, any>): Promise<void> {
    const { whereClause, values } = this.buildWhereClause(conditions);
    await this.query(`DELETE FROM ${this.escapeIdentifier(tableName)} ${whereClause}`, values);
  }

  // ============================================
  // User Helper Methods (replaces auth service SDK)
  // ============================================

  async getUserById(userId: string): Promise<any | null> {
    const { rows } = await this.query('SELECT * FROM "users" WHERE "id" = $1 LIMIT 1', [userId]);
    return rows[0] || null;
  }

  async listUsers(options?: { limit?: number; offset?: number }): Promise<any> {
    let sql = 'SELECT * FROM "users"';
    const params: any[] = [];
    if (options?.limit) {
      params.push(options.limit);
      sql += ` LIMIT $${params.length}`;
    }
    if (options?.offset) {
      params.push(options.offset);
      sql += ` OFFSET $${params.length}`;
    }
    const { rows } = await this.query(sql, params);
    return this.wrapResult(rows);
  }

  async searchUsers(queryStr: string, options?: { limit?: number }): Promise<any> {
    const limit = options?.limit || 20;
    const { rows } = await this.query(
      `SELECT * FROM "users" WHERE "email" ILIKE $1 OR "name" ILIKE $1 LIMIT $2`,
      [`%${queryStr}%`, limit],
    );
    return this.wrapResult(rows);
  }

  // ============================================
  // Compatibility Stubs (TODO: migrate to dedicated services)
  // These are no-op stubs that log warnings but don't throw,
  // so existing services that call this.db.uploadFile() etc.
  // can be migrated incrementally without breaking compilation.
  // ============================================

  // ============================================
  // Storage (S3-compatible: AWS S3, Cloudflare R2, MinIO, etc.)
  // ============================================
  async uploadFile(bucket: string, fileBuffer: Buffer, path: string, options?: any): Promise<any> {
    return uploadFileFn(this.storageConfig, bucket, fileBuffer, path, options);
  }

  async downloadFile(bucket: string, path: string): Promise<Buffer> {
    return downloadFileFn(this.storageConfig, bucket, path);
  }

  async deleteFileFromStorage(bucket: string, path: string): Promise<void> {
    return deleteFileFn(this.storageConfig, bucket, path);
  }

  getPublicUrl(bucket: string, path: string): any {
    const url = getPublicUrlFn(this.storageConfig, bucket, path);
    return Object.assign(new String(url), { publicUrl: url, url });
  }

  async createSignedUrl(bucket: string, path: string, expiresIn?: number): Promise<string> {
    return createSignedUrlFn(this.storageConfig, bucket, path, expiresIn);
  }

  async createSignedUrlByKey(key: string, expiresIn?: number): Promise<string> {
    return createSignedUrlFn(this.storageConfig, '', key, expiresIn);
  }

  async deleteByKey(key: string): Promise<void> {
    return deleteFileFn(this.storageConfig, '', key);
  }

  async generateImage(...args: any[]): Promise<any> {
    this.logger.warn('generateImage called - implement AIService');
    return { url: '', imageUrl: '' };
  }

  async unsubscribe(...args: any[]): Promise<void> {
    this.logger.warn('unsubscribe called - implement RealtimeService');
  }

  async sendEmail(to: string | string[], subject: string, html: string, text?: string, options?: any): Promise<any> {
    return sendEmailFn(this.emailConfig, to, subject, html, text, options);
  }

  async sendPushNotification(to: string, title: string, body: string, data?: any): Promise<any> {
    this.logger.warn(`sendPushNotification called - migrate to FirebaseService`);
    return { success: false };
  }

  async publishToChannel(channel: string, data: any): Promise<void> {
    this.logger.warn(`publishToChannel called - migrate to Socket.io directly. channel=${channel}`);
  }

  // ============================================
  // Auth (real Postgres + bcryptjs + JWT - see auth-helpers.ts)
  // ============================================
  async signUp(emailOrData: any, password?: string, name?: string, metadata?: any, role?: string): Promise<any> {
    const data = typeof emailOrData === 'object'
      ? emailOrData
      : { email: emailOrData, password, name, metadata: { ...(metadata || {}), ...(role ? { role } : {}) } };
    return registerUser(this.pool, this.authConfig, data);
  }

  async signIn(emailOrData: any, password?: string): Promise<any> {
    const email = typeof emailOrData === 'object' ? emailOrData.email : emailOrData;
    const pwd = typeof emailOrData === 'object' ? emailOrData.password : password;
    return loginUser(this.pool, this.authConfig, email, pwd!);
  }

  async refreshSession(refreshToken: string): Promise<any> {
    return refreshSessionFn(this.pool, this.authConfig, refreshToken);
  }

  async resetPasswordForEmail(email: string, _frontendUrl?: string): Promise<any> {
    const result = await requestPasswordResetFn(this.pool, email);
    return { success: true, ...result };
  }

  async resetPassword(tokenOrData: string | { token: string; newPassword?: string; password?: string }, newPassword?: string): Promise<any> {
    // Support both: resetPassword(token, newPassword) and resetPassword({token, newPassword})
    if (typeof tokenOrData === 'object') {
      return resetPasswordFn(this.pool, this.authConfig, tokenOrData.token, (tokenOrData.newPassword || tokenOrData.password)!);
    }
    return resetPasswordFn(this.pool, this.authConfig, tokenOrData, newPassword!);
  }

  async updateUser(userId: string, updates: Record<string, any>): Promise<any> {
    return updateUserFn(this.pool, userId, updates);
  }

  async updateUserMetadata(userId: string, metadata: Record<string, any>): Promise<any> {
    return updateUserFn(this.pool, userId, { metadata, user_metadata: metadata });
  }

  async changeUserPassword(userId: string, currentPassword: string, newPassword: string): Promise<any> {
    return changePasswordFn(this.pool, this.authConfig, userId, currentPassword, newPassword);
  }

  async banUser(userId: string, reason?: string): Promise<any> {
    return banUserFn(this.pool, userId, reason);
  }

  async unbanUser(userId: string): Promise<any> {
    return unbanUserFn(this.pool, userId);
  }

  async deleteUser(userId: string): Promise<any> {
    return deleteUserFn(this.pool, userId);
  }
  getAI(...args: any[]): any { this.logger.warn('getAI called - implement AIService'); return { generateText: async () => ({ text: '' }) }; }
  async generateText(...args: any[]): Promise<any> { this.logger.warn('generateText called - implement AIService'); return { text: '' }; }
  async hybridSearch(...args: any[]): Promise<any> { this.logger.warn('hybridSearch called'); return this.wrapResult([]); }
  async unifiedSearch(...args: any[]): Promise<any> { this.logger.warn('unifiedSearch called'); return this.wrapResult([]); }
  get users(): any { this.logger.warn('db.users called - implement UserService'); return { list: async () => this.wrapResult([]), get: async () => null }; }
  get dbVideoService(): any { this.logger.warn('db.dbVideoService called'); return { createRoom: async () => null, getRoom: async () => null, deleteRoom: async () => null }; }

  // Legacy SDK shape: db.auth.{register,signIn,...}. Delegates to the real
  // Postgres-backed implementations defined above.
  get auth(): any {
    return {
      register: (data: any) => this.signUp(data),
      signIn: (data: any) => this.signIn(data),
      refreshToken: (token: string) => this.refreshSession(token),
      verifyEmail: (token: string) => verifyEmailFn(this.pool, token),
      requestPasswordReset: (email: string, _url?: string) => this.resetPasswordForEmail(email),
      resetPassword: (data: any) => this.resetPassword(data.token, data.password || data.newPassword),
      changePassword: (data: any) => this.changeUserPassword(data.userId, data.currentPassword, data.newPassword),
      resendEmailVerification: async (email: string) => {
        const r = await this.pool.query(
          `UPDATE "users" SET "email_verification_token" = encode(gen_random_bytes(32), 'hex')
           WHERE "email" = $1 AND "email_verified" = false RETURNING email_verification_token`,
          [email.toLowerCase()],
        );
        return { success: r.rowCount! > 0, token: r.rows[0]?.email_verification_token };
      },
      getOAuthUrl: async (provider: string, _redirect: string) => {
        this.logger.warn(`db.auth.getOAuthUrl(${provider}) - OAuth providers not configured. See MIGRATION.md.`);
        return { url: '' };
      },
      deleteUser: (userId: string) => this.deleteUser(userId),
    };
  }

  get authClient(): any {
    return { auth: this.auth };
  }

  getClient(): any {
    return this.client;
  }

  get client(): any {
    const log = (path: string) => this.logger.warn(`db.client.${path} called - migrate to dedicated service`);
    // `query` is a callable AND chainable shim: db.client.query.from('t')...
    const queryShim: any = (...args: any[]) => { log('query'); return Promise.resolve(this.wrapResult([])); };
    queryShim.from = (tableName: string) => this.table(tableName);
    return {
      query: queryShim,
      auth: this.auth,
      email: {
        send: (to: any, subject: string, html: string, text?: string, opts?: any) =>
          this.sendEmail(to, subject, html, text, opts),
      },
      storage: {
        upload: (bucket: string, buf: Buffer, path: string, opts?: any) =>
          this.uploadFile(bucket, buf, path, opts),
        download: (bucket: string, path: string) => this.downloadFile(bucket, path),
        delete: (bucket: string, path: string) => this.deleteFileFromStorage(bucket, path),
      },
      ai: {
        transcribeAudio: async (...args: any[]) => { log('ai.transcribeAudio'); return { text: '' }; },
        translateText: async (...args: any[]) => { log('ai.translateText'); return { text: '' }; },
        summarizeText: async (...args: any[]) => { log('ai.summarizeText'); return { text: '' }; },
        generateText: async (...args: any[]) => { log('ai.generateText'); return { text: '' }; },
      },
      videoConferencing: {
        createRoom: async (...args: any[]) => { log('videoConferencing.createRoom'); return null; },
        getRoom: async (...args: any[]) => { log('videoConferencing.getRoom'); return null; },
        listRooms: async (...args: any[]) => { log('videoConferencing.listRooms'); return []; },
        updateRoom: async (...args: any[]) => { log('videoConferencing.updateRoom'); return null; },
        deleteRoom: async (...args: any[]) => { log('videoConferencing.deleteRoom'); },
        generateToken: async (...args: any[]) => { log('videoConferencing.generateToken'); return ''; },
        listParticipants: async (...args: any[]) => { log('videoConferencing.listParticipants'); return []; },
        getParticipant: async (...args: any[]) => { log('videoConferencing.getParticipant'); return null; },
        removeParticipant: async (...args: any[]) => { log('videoConferencing.removeParticipant'); },
        startRecording: async (...args: any[]) => { log('videoConferencing.startRecording'); return null; },
        stopRecording: async (...args: any[]) => { log('videoConferencing.stopRecording'); },
        listRecordings: async (...args: any[]) => { log('videoConferencing.listRecordings'); return []; },
        getRecording: async (...args: any[]) => { log('videoConferencing.getRecording'); return null; },
        startEgress: async (...args: any[]) => { log('videoConferencing.startEgress'); return null; },
        stopEgress: async (...args: any[]) => { log('videoConferencing.stopEgress'); },
        getSessionStats: async (...args: any[]) => { log('videoConferencing.getSessionStats'); return null; },
      },
    };
  }

  // ============================================
  // Transaction Support
  // ============================================

  async transaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // Internal Helpers
  // ============================================

  private buildWhereClause(
    conditions: Record<string, any>,
    paramOffset: number = 0,
  ): { whereClause: string; values: any[] } {
    const entries = Object.entries(conditions).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return { whereClause: '', values: [] };

    const clauses: string[] = [];
    const values: any[] = [];

    entries.forEach(([key, value]) => {
      if (value === null) {
        clauses.push(`${this.escapeIdentifier(key)} IS NULL`);
      } else if (Array.isArray(value)) {
        const placeholders = value.map((_, i) => `$${paramOffset + values.length + i + 1}`);
        clauses.push(`${this.escapeIdentifier(key)} IN (${placeholders.join(', ')})`);
        values.push(...value);
      } else {
        values.push(value);
        clauses.push(`${this.escapeIdentifier(key)} = $${paramOffset + values.length}`);
      }
    });

    return { whereClause: `WHERE ${clauses.join(' AND ')}`, values };
  }

  private escapeIdentifier(identifier: string): string {
    // Simple identifier escaping - only allow alphanumeric and underscores
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
      return `"${identifier}"`;
    }
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }
}
