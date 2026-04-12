import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as OTPAuth from 'otpauth';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);
  private readonly encryptionKey: Buffer;
  private readonly issuer = 'Team@Once';

  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
  ) {
    // Derive a 32-byte key from the MFA_ENCRYPTION_KEY env var (or fall back to JWT_SECRET)
    const rawKey = this.configService.get<string>('MFA_ENCRYPTION_KEY')
      || this.configService.get<string>('JWT_SECRET')
      || 'default-mfa-key-change-me';
    this.encryptionKey = crypto.scryptSync(rawKey, 'teamatonce-mfa-salt', 32);
  }

  // ============================================
  // Enable MFA — generate secret + QR + recovery codes
  // ============================================

  async enableMfa(userId: string): Promise<{
    secret: string;
    qrCodeUrl: string;
    recoveryCodes: string[];
  }> {
    // Check if MFA is already active
    const existing = await this.db.findOne('user_mfa', { user_id: userId });
    if (existing?.is_active) {
      throw new BadRequestException('MFA is already enabled for this account');
    }

    // Generate TOTP secret
    const totp = new OTPAuth.TOTP({
      issuer: this.issuer,
      label: await this.getUserEmail(userId),
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: new OTPAuth.Secret({ size: 20 }),
    });

    const secret = totp.secret.base32;
    const otpauthUri = totp.toString();

    // Generate QR code data URL
    const qrCodeUrl = await QRCode.toDataURL(otpauthUri);

    // Generate recovery codes
    const recoveryCodes = this.generateRecoveryCodes(10);

    // Hash recovery codes for storage
    const recoveryCodesHashed = await Promise.all(
      recoveryCodes.map(async (code) => ({
        code_hash: await bcrypt.hash(code, 10),
        used_at: null,
      })),
    );

    // Encrypt the TOTP secret
    const secretEncrypted = this.encrypt(secret);

    // Upsert into user_mfa table
    if (existing) {
      await this.db.update('user_mfa', { user_id: userId }, {
        secret_encrypted: secretEncrypted,
        is_active: false, // Not active until verify-setup
        recovery_codes: JSON.stringify(recoveryCodesHashed),
        updated_at: new Date(),
      });
    } else {
      await this.db.insert('user_mfa', {
        user_id: userId,
        secret_encrypted: secretEncrypted,
        is_active: false,
        recovery_codes: JSON.stringify(recoveryCodesHashed),
      });
    }

    this.logger.log(`MFA setup initiated for user ${userId}`);

    return {
      secret,
      qrCodeUrl,
      recoveryCodes,
    };
  }

  // ============================================
  // Verify Setup — user confirms they scanned the QR
  // ============================================

  async verifyAndActivateMfa(userId: string, token: string): Promise<{ success: boolean }> {
    const mfaRecord = await this.db.findOne('user_mfa', { user_id: userId });
    if (!mfaRecord) {
      throw new BadRequestException('MFA has not been set up. Call /auth/mfa/enable first.');
    }
    if (mfaRecord.is_active) {
      throw new BadRequestException('MFA is already active');
    }

    const secret = this.decrypt(mfaRecord.secret_encrypted);
    const isValid = this.validateToken(secret, token);

    if (!isValid) {
      throw new BadRequestException('Invalid TOTP token. Please try again with a fresh code from your authenticator app.');
    }

    // Activate MFA
    await this.db.update('user_mfa', { user_id: userId }, {
      is_active: true,
      updated_at: new Date(),
    });

    this.logger.log(`MFA activated for user ${userId}`);

    return { success: true };
  }

  // ============================================
  // Verify Token — during login
  // ============================================

  async verifyMfaToken(userId: string, token: string): Promise<boolean> {
    const mfaRecord = await this.db.findOne('user_mfa', { user_id: userId });
    if (!mfaRecord || !mfaRecord.is_active) {
      throw new BadRequestException('MFA is not enabled for this account');
    }

    const secret = this.decrypt(mfaRecord.secret_encrypted);
    return this.validateToken(secret, token);
  }

  // ============================================
  // Disable MFA — requires a valid token
  // ============================================

  async disableMfa(userId: string, token: string): Promise<{ success: boolean }> {
    const mfaRecord = await this.db.findOne('user_mfa', { user_id: userId });
    if (!mfaRecord || !mfaRecord.is_active) {
      throw new BadRequestException('MFA is not currently enabled');
    }

    const secret = this.decrypt(mfaRecord.secret_encrypted);
    const isValid = this.validateToken(secret, token);

    if (!isValid) {
      throw new BadRequestException('Invalid TOTP token. Cannot disable MFA without a valid token.');
    }

    // Remove MFA record entirely
    await this.db.delete('user_mfa', mfaRecord.id);

    this.logger.log(`MFA disabled for user ${userId}`);

    return { success: true };
  }

  // ============================================
  // Recovery Codes
  // ============================================

  async useRecoveryCode(userId: string, code: string): Promise<boolean> {
    const mfaRecord = await this.db.findOne('user_mfa', { user_id: userId });
    if (!mfaRecord || !mfaRecord.is_active) {
      throw new BadRequestException('MFA is not enabled for this account');
    }

    const recoveryCodes: Array<{ code_hash: string; used_at: string | null }> =
      typeof mfaRecord.recovery_codes === 'string'
        ? JSON.parse(mfaRecord.recovery_codes)
        : mfaRecord.recovery_codes;

    // Find a matching unused code
    for (let i = 0; i < recoveryCodes.length; i++) {
      const entry = recoveryCodes[i];
      if (entry.used_at) continue; // Already used

      const matches = await bcrypt.compare(code, entry.code_hash);
      if (matches) {
        // Mark as used
        recoveryCodes[i].used_at = new Date().toISOString();

        await this.db.update('user_mfa', { user_id: userId }, {
          recovery_codes: JSON.stringify(recoveryCodes),
          updated_at: new Date(),
        });

        this.logger.log(`Recovery code used for user ${userId}`);
        return true;
      }
    }

    return false;
  }

  // ============================================
  // Check if MFA is active for a user
  // ============================================

  async isMfaActive(userId: string): Promise<boolean> {
    const mfaRecord = await this.db.findOne('user_mfa', { user_id: userId });
    return mfaRecord?.is_active === true;
  }

  // ============================================
  // Private helpers
  // ============================================

  private validateToken(secret: string, token: string): boolean {
    const totp = new OTPAuth.TOTP({
      issuer: this.issuer,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });

    // delta returns null if invalid, or the time step difference
    const delta = totp.validate({ token, window: 1 });
    return delta !== null;
  }

  private generateRecoveryCodes(count: number): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      // Format: XXXX-XXXX-XXXX (12 hex chars with dashes)
      const raw = crypto.randomBytes(6).toString('hex').toUpperCase();
      const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
      codes.push(formatted);
    }
    return codes;
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  private decrypt(encryptedText: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  private async getUserEmail(userId: string): Promise<string> {
    const user = await this.db.getUserById(userId);
    return user?.email || 'user@teamatonce.com';
  }
}
