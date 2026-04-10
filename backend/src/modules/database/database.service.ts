import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, QueryResult } from 'pg';
import { QueryBuilder } from './query-builder';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool;

  constructor(private configService: ConfigService) {}

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

  async uploadFile(bucket: string, fileBuffer: Buffer, path: string, options?: any): Promise<any> {
    this.logger.warn(`uploadFile called - migrate to StorageService. bucket=${bucket} path=${path}`);
    return { path, url: `/${bucket}/${path}` };
  }

  async downloadFile(bucket: string, path: string): Promise<Buffer> {
    this.logger.warn(`downloadFile called - migrate to StorageService. bucket=${bucket} path=${path}`);
    return Buffer.from('');
  }

  async deleteFileFromStorage(bucket: string, path: string): Promise<void> {
    this.logger.warn(`deleteFileFromStorage called - migrate to StorageService. bucket=${bucket} path=${path}`);
  }

  getPublicUrl(bucket: string, path: string): any {
    this.logger.warn(`getPublicUrl called - migrate to StorageService. bucket=${bucket} path=${path}`);
    const url = `/${bucket}/${path}`;
    return Object.assign(new String(url), { publicUrl: url, url });
  }

  async createSignedUrl(bucket: string, path: string, expiresIn?: number): Promise<string> {
    this.logger.warn(`createSignedUrl called - migrate to StorageService. bucket=${bucket} path=${path}`);
    return `/${bucket}/${path}`;
  }

  async createSignedUrlByKey(key: string, expiresIn?: number): Promise<string> {
    this.logger.warn(`createSignedUrlByKey called - migrate to StorageService. key=${key}`);
    return `/${key}`;
  }

  async deleteByKey(key: string): Promise<void> {
    this.logger.warn(`deleteByKey called - migrate to StorageService. key=${key}`);
  }

  async generateImage(...args: any[]): Promise<any> {
    this.logger.warn('generateImage called - implement AIService');
    return { url: '', imageUrl: '' };
  }

  async unsubscribe(...args: any[]): Promise<void> {
    this.logger.warn('unsubscribe called - implement RealtimeService');
  }

  async sendEmail(to: string | string[], subject: string, html: string, text?: string, options?: any): Promise<any> {
    this.logger.warn(`sendEmail called - migrate to EmailService. to=${to} subject=${subject}`);
    return { success: false, message: 'Email service not configured - implement EmailService' };
  }

  async sendPushNotification(to: string, title: string, body: string, data?: any): Promise<any> {
    this.logger.warn(`sendPushNotification called - migrate to FirebaseService`);
    return { success: false };
  }

  async publishToChannel(channel: string, data: any): Promise<void> {
    this.logger.warn(`publishToChannel called - migrate to Socket.io directly. channel=${channel}`);
  }

  // ============================================
  // Auth/AI/Search stubs (TODO: migrate to dedicated services)
  // ============================================
  async signUp(...args: any[]): Promise<any> { this.logger.warn('signUp called - implement AuthService'); return { user: null, accessToken: null, refreshToken: null }; }
  async signIn(...args: any[]): Promise<any> { this.logger.warn('signIn called - implement AuthService'); return { user: null, accessToken: null, refreshToken: null }; }
  async refreshSession(...args: any[]): Promise<any> { this.logger.warn('refreshSession called - implement AuthService'); return { accessToken: null, refreshToken: null }; }
  async resetPasswordForEmail(...args: any[]): Promise<any> { this.logger.warn('resetPasswordForEmail called'); return { success: false }; }
  async resetPassword(...args: any[]): Promise<any> { this.logger.warn('resetPassword called'); return { success: false }; }
  async updateUser(...args: any[]): Promise<any> { this.logger.warn('updateUser called - implement AuthService'); return null; }
  async updateUserMetadata(...args: any[]): Promise<any> { this.logger.warn('updateUserMetadata called'); return null; }
  async changeUserPassword(...args: any[]): Promise<any> { this.logger.warn('changeUserPassword called'); return { success: false }; }
  async banUser(...args: any[]): Promise<any> { this.logger.warn('banUser called'); return { success: false }; }
  async unbanUser(...args: any[]): Promise<any> { this.logger.warn('unbanUser called'); return { success: false }; }
  async deleteUser(...args: any[]): Promise<any> { this.logger.warn('deleteUser called'); return { success: false }; }
  getAI(...args: any[]): any { this.logger.warn('getAI called - implement AIService'); return { generateText: async () => ({ text: '' }) }; }
  async generateText(...args: any[]): Promise<any> { this.logger.warn('generateText called - implement AIService'); return { text: '' }; }
  async hybridSearch(...args: any[]): Promise<any> { this.logger.warn('hybridSearch called'); return this.wrapResult([]); }
  async unifiedSearch(...args: any[]): Promise<any> { this.logger.warn('unifiedSearch called'); return this.wrapResult([]); }
  get users(): any { this.logger.warn('db.users called - implement UserService'); return { list: async () => this.wrapResult([]), get: async () => null }; }
  get dbVideoService(): any { this.logger.warn('db.dbVideoService called'); return { createRoom: async () => null, getRoom: async () => null, deleteRoom: async () => null }; }

  // Compatibility stubs for old fluxez SDK methods - all log warnings, none throw
  // These let the codebase compile while individual services are migrated.
  // Return type is `any` so legacy call patterns typecheck without enumerating shapes.
  get auth(): any {
    const log = (method: string) => this.logger.warn(`db.auth.${method} called - implement custom AuthService`);
    return {
      register: async (data: any) => { log('register'); return { user: null, accessToken: null, refreshToken: null }; },
      refreshToken: async (token: string) => { log('refreshToken'); return { accessToken: null, refreshToken: null }; },
      verifyEmail: async (token: string) => { log('verifyEmail'); return { success: false }; },
      requestPasswordReset: async (email: string, url: string) => { log('requestPasswordReset'); return { success: false }; },
      resetPassword: async (data: any) => { log('resetPassword'); return { success: false }; },
      changePassword: async (data: any) => { log('changePassword'); return { success: false }; },
      resendEmailVerification: async (email: string) => { log('resendEmailVerification'); return { success: false }; },
      getOAuthUrl: async (provider: string, redirect: string) => { log('getOAuthUrl'); return { url: '' }; },
      deleteUser: async (userId: string) => { log('deleteUser'); return { success: false }; },
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
        send: async (...args: any[]) => { log('email.send'); return { success: false }; },
      },
      storage: {
        upload: async (...args: any[]) => { log('storage.upload'); return { path: '', url: '' }; },
        download: async (...args: any[]) => { log('storage.download'); return Buffer.from(''); },
        delete: async (...args: any[]) => { log('storage.delete'); },
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
