/**
 * Real Postgres-backed auth helpers.
 *
 * Replaces the fluxez-SDK auth stubs with concrete implementations using:
 *   - bcrypt for password hashing
 *   - jsonwebtoken (via JWT_SECRET) for access/refresh tokens
 *   - the `users` and `auth_refresh_tokens` tables created by
 *     migrations/002_auth_users.sql
 *
 * Designed to be a drop-in for code that previously called
 * `db.auth.register(...)`, `db.signIn(...)`, etc. The shapes returned
 * intentionally match the legacy SDK responses so existing AuthService
 * code keeps compiling and behaving the same.
 */
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string; // e.g. '7d'
  refreshExpiresInDays: number; // e.g. 30
  bcryptRounds: number; // e.g. 10
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  phone: string | null;
  role: string;
  emailVerified: boolean;
  email_confirmed_at: string | null;
  metadata: Record<string, any>;
  user_metadata: Record<string, any>;
  created_at: string;
  // Legacy SDK shape that some callers expect
  app_metadata?: Record<string, any>;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  token?: string; // legacy alias for accessToken
}

const SALT_ROUNDS_DEFAULT = 10;

export function getAuthConfig(getConfig: (key: string, fallback?: any) => any): AuthConfig {
  return {
    jwtSecret: getConfig('JWT_SECRET') || getConfig('AUTH_JWT_SECRET') || 'change-me-in-production',
    jwtExpiresIn: getConfig('JWT_EXPIRES_IN', '7d'),
    refreshExpiresInDays: parseInt(getConfig('REFRESH_TOKEN_EXPIRES_DAYS', '30'), 10),
    bcryptRounds: parseInt(getConfig('BCRYPT_ROUNDS', String(SALT_ROUNDS_DEFAULT)), 10),
  };
}

function rowToUser(row: any): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    full_name: row.full_name || row.name,
    username: row.username,
    avatar_url: row.avatar_url,
    phone: row.phone,
    role: row.role || 'user',
    emailVerified: !!row.email_verified,
    email_confirmed_at: row.email_confirmed_at,
    metadata: row.metadata || {},
    user_metadata: row.user_metadata || {},
    app_metadata: { role: row.role || 'user' },
    created_at: row.created_at,
  };
}

function signAccessToken(user: AuthUser, cfg: AuthConfig): string {
  return jwt.sign(
    {
      sub: user.id,
      userId: user.id, // legacy alias used by some guards
      email: user.email,
      emailVerified: user.emailVerified,
      role: user.role,
    },
    cfg.jwtSecret,
    { expiresIn: cfg.jwtExpiresIn } as jwt.SignOptions,
  );
}

async function issueRefreshToken(
  pool: Pool,
  userId: string,
  cfg: AuthConfig,
  ctx?: { ip?: string; userAgent?: string },
): Promise<string> {
  const raw = crypto.randomBytes(48).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + cfg.refreshExpiresInDays * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO "auth_refresh_tokens" ("user_id", "token_hash", "expires_at", "user_agent", "ip_address")
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, hash, expiresAt.toISOString(), ctx?.userAgent || null, ctx?.ip || null],
  );
  return raw;
}

export async function registerUser(
  pool: Pool,
  cfg: AuthConfig,
  data: { email: string; password: string; name?: string; metadata?: Record<string, any>; frontendUrl?: string },
): Promise<AuthSession & { requiresVerification: boolean }> {
  const email = data.email.toLowerCase().trim();
  if (!email || !data.password) {
    throw new Error('Email and password are required');
  }

  // Check if email already exists
  const existing = await pool.query('SELECT id FROM "users" WHERE "email" = $1 LIMIT 1', [email]);
  if (existing.rows.length > 0) {
    const err: any = new Error('Email already registered');
    err.status = 409;
    err.code = 'HTTP_409';
    throw err;
  }

  const hash = await bcrypt.hash(data.password, cfg.bcryptRounds);
  const verificationToken = crypto.randomBytes(32).toString('hex');

  // Pull role / username out of metadata so they get their own columns
  const md = { ...(data.metadata || {}) };
  const role = md.role || 'user';
  const username = md.username || null;
  delete md.role;

  const insert = await pool.query(
    `INSERT INTO "users" ("email", "password_hash", "name", "full_name", "username", "role",
                          "email_verified", "email_verification_token", "metadata", "user_metadata")
     VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8, $9)
     RETURNING *`,
    [
      email,
      hash,
      data.name || null,
      data.name || null,
      username,
      role,
      verificationToken,
      md,
      md,
    ],
  );

  const user = rowToUser(insert.rows[0]);
  const accessToken = signAccessToken(user, cfg);
  const refreshToken = await issueRefreshToken(pool, user.id, cfg);

  return {
    user,
    accessToken,
    token: accessToken,
    refreshToken,
    requiresVerification: !user.emailVerified,
  };
}

export async function loginUser(
  pool: Pool,
  cfg: AuthConfig,
  email: string,
  password: string,
  ctx?: { ip?: string; userAgent?: string },
): Promise<AuthSession> {
  const lowered = email.toLowerCase().trim();
  const result = await pool.query('SELECT * FROM "users" WHERE "email" = $1 LIMIT 1', [lowered]);
  if (result.rows.length === 0) {
    const err: any = new Error('Invalid credentials');
    err.status = 401;
    err.code = 'HTTP_401';
    throw err;
  }
  const row = result.rows[0];
  if (row.is_banned) {
    const err: any = new Error(row.banned_reason || 'Account suspended');
    err.status = 403;
    throw err;
  }
  if (!row.password_hash) {
    // OAuth-only account
    const err: any = new Error('Use OAuth to sign in to this account');
    err.status = 401;
    throw err;
  }
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) {
    const err: any = new Error('Invalid credentials');
    err.status = 401;
    err.code = 'HTTP_401';
    throw err;
  }

  await pool.query(
    'UPDATE "users" SET "last_login_at" = now(), "last_sign_in_at" = now() WHERE "id" = $1',
    [row.id],
  );

  const user = rowToUser(row);
  const accessToken = signAccessToken(user, cfg);
  const refreshToken = await issueRefreshToken(pool, user.id, cfg, ctx);

  return { user, accessToken, token: accessToken, refreshToken };
}

export async function refreshSessionFn(
  pool: Pool,
  cfg: AuthConfig,
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const result = await pool.query(
    `SELECT t.*, u.* FROM "auth_refresh_tokens" t
     JOIN "users" u ON u.id = t.user_id
     WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND t.expires_at > now()
     LIMIT 1`,
    [hash],
  );
  if (result.rows.length === 0) {
    const err: any = new Error('Invalid or expired refresh token');
    err.status = 401;
    throw err;
  }
  // Rotate: revoke old, issue new
  await pool.query('UPDATE "auth_refresh_tokens" SET "revoked_at" = now() WHERE "token_hash" = $1', [hash]);
  const row = result.rows[0];
  const user = rowToUser(row);
  const accessToken = signAccessToken(user, cfg);
  const newRefresh = await issueRefreshToken(pool, user.id, cfg);
  return { accessToken, refreshToken: newRefresh };
}

export async function requestPasswordResetFn(
  pool: Pool,
  email: string,
): Promise<{ token: string | null; userId: string | null }> {
  const lowered = email.toLowerCase().trim();
  const result = await pool.query('SELECT id FROM "users" WHERE "email" = $1 LIMIT 1', [lowered]);
  if (result.rows.length === 0) {
    // Don't leak whether the email exists
    return { token: null, userId: null };
  }
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await pool.query(
    'UPDATE "users" SET "password_reset_token" = $1, "password_reset_expires_at" = $2 WHERE "id" = $3',
    [token, expires.toISOString(), result.rows[0].id],
  );
  return { token, userId: result.rows[0].id };
}

export async function resetPasswordFn(
  pool: Pool,
  cfg: AuthConfig,
  token: string,
  newPassword: string,
): Promise<{ success: boolean }> {
  const result = await pool.query(
    `SELECT id FROM "users" WHERE "password_reset_token" = $1 AND "password_reset_expires_at" > now() LIMIT 1`,
    [token],
  );
  if (result.rows.length === 0) {
    const err: any = new Error('Invalid or expired reset token');
    err.status = 400;
    throw err;
  }
  const hash = await bcrypt.hash(newPassword, cfg.bcryptRounds);
  await pool.query(
    `UPDATE "users" SET "password_hash" = $1, "password_reset_token" = NULL, "password_reset_expires_at" = NULL WHERE "id" = $2`,
    [hash, result.rows[0].id],
  );
  // Revoke all existing refresh tokens for safety
  await pool.query('UPDATE "auth_refresh_tokens" SET "revoked_at" = now() WHERE "user_id" = $1', [result.rows[0].id]);
  return { success: true };
}

export async function changePasswordFn(
  pool: Pool,
  cfg: AuthConfig,
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean }> {
  const result = await pool.query('SELECT password_hash FROM "users" WHERE "id" = $1 LIMIT 1', [userId]);
  if (result.rows.length === 0) {
    throw new Error('User not found');
  }
  const ok = await bcrypt.compare(currentPassword, result.rows[0].password_hash || '');
  if (!ok) {
    const err: any = new Error('Current password is incorrect');
    err.status = 401;
    throw err;
  }
  const hash = await bcrypt.hash(newPassword, cfg.bcryptRounds);
  await pool.query('UPDATE "users" SET "password_hash" = $1 WHERE "id" = $2', [hash, userId]);
  return { success: true };
}

export async function verifyEmailFn(
  pool: Pool,
  token: string,
): Promise<{ success: boolean }> {
  const result = await pool.query(
    `UPDATE "users"
     SET "email_verified" = true,
         "email_confirmed_at" = now(),
         "email_verification_token" = NULL
     WHERE "email_verification_token" = $1
     RETURNING id`,
    [token],
  );
  return { success: result.rowCount! > 0 };
}

export async function updateUserFn(
  pool: Pool,
  userId: string,
  updates: Record<string, any>,
): Promise<AuthUser> {
  // Allow only known columns. Metadata is jsonb-merged so callers can patch.
  const allowed = ['name', 'full_name', 'username', 'avatar_url', 'phone', 'role', 'email'];
  const cols: string[] = [];
  const vals: any[] = [];
  for (const key of Object.keys(updates)) {
    if (allowed.includes(key)) {
      cols.push(`"${key}" = $${vals.length + 1}`);
      vals.push(updates[key]);
    }
  }
  // Handle metadata patches: jsonb-merge instead of replace, so callers
  // can add a key without nuking the rest of the object.
  if (updates.metadata !== undefined) {
    cols.push(`"metadata" = COALESCE("metadata", '{}'::jsonb) || $${vals.length + 1}::jsonb`);
    vals.push(updates.metadata);
  }
  if (updates.user_metadata !== undefined) {
    cols.push(`"user_metadata" = COALESCE("user_metadata", '{}'::jsonb) || $${vals.length + 1}::jsonb`);
    vals.push(updates.user_metadata);
  }
  if (cols.length === 0) {
    const r = await pool.query('SELECT * FROM "users" WHERE "id" = $1 LIMIT 1', [userId]);
    return rowToUser(r.rows[0]);
  }
  vals.push(userId);
  const result = await pool.query(
    `UPDATE "users" SET ${cols.join(', ')}, "updated_at" = now() WHERE "id" = $${vals.length} RETURNING *`,
    vals,
  );
  return rowToUser(result.rows[0]);
}

export async function deleteUserFn(pool: Pool, userId: string): Promise<{ success: boolean }> {
  await pool.query('DELETE FROM "users" WHERE "id" = $1', [userId]);
  return { success: true };
}

export async function banUserFn(pool: Pool, userId: string, reason?: string): Promise<{ success: boolean }> {
  await pool.query(
    'UPDATE "users" SET "is_banned" = true, "banned_reason" = $1 WHERE "id" = $2',
    [reason || null, userId],
  );
  await pool.query('UPDATE "auth_refresh_tokens" SET "revoked_at" = now() WHERE "user_id" = $1', [userId]);
  return { success: true };
}

export async function unbanUserFn(pool: Pool, userId: string): Promise<{ success: boolean }> {
  await pool.query('UPDATE "users" SET "is_banned" = false, "banned_reason" = NULL WHERE "id" = $1', [userId]);
  return { success: true };
}
