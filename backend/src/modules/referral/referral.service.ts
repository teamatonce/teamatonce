import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { v4 as uuidv4 } from 'uuid';

export interface ReferralStats {
  referralCode: string;
  totalClicks: number;
  totalSignups: number;
  totalConversions: number;
  totalEarnings: number;
  referrals: any[];
}

export interface ConfigureRewardsDto {
  referrerReward: number;
  referredReward: number;
}

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  // Default reward amounts (in USD)
  private static DEFAULT_REFERRER_REWARD = 50;
  private static DEFAULT_REFERRED_REWARD = 25;

  constructor(private readonly db: DatabaseService) {}

  /**
   * Generate a unique referral code for a user (format: REF-XXXXX)
   */
  async generateReferralCode(userId: string): Promise<{ code: string }> {
    // Check if user already has a referral code
    const existing = await this.db.findOne('referral_codes', { user_id: userId });
    if (existing) {
      return { code: existing.code };
    }

    // Generate a unique code
    let code: string;
    let isUnique = false;
    let attempts = 0;

    do {
      const random = uuidv4().replace(/-/g, '').substring(0, 5).toUpperCase();
      code = `REF-${random}`;
      const existingCode = await this.db.findOne('referral_codes', { code });
      isUnique = !existingCode;
      attempts++;
    } while (!isUnique && attempts < 10);

    if (!isUnique) {
      throw new BadRequestException('Failed to generate a unique referral code. Please try again.');
    }

    await this.db.insert('referral_codes', {
      id: uuidv4(),
      user_id: userId,
      code,
      created_at: new Date().toISOString(),
    });

    this.logger.log(`Generated referral code ${code} for user ${userId}`);
    return { code };
  }

  /**
   * Get the referral code for a user
   */
  async getReferralCode(userId: string): Promise<{ code: string } | null> {
    const record = await this.db.findOne('referral_codes', { user_id: userId });
    if (!record) {
      return null;
    }
    return { code: record.code };
  }

  /**
   * Track when someone clicks a referral link
   */
  async trackClick(code: string, ip: string, userAgent: string): Promise<void> {
    // Validate the code exists
    const codeRecord = await this.db.findOne('referral_codes', { code });
    if (!codeRecord) {
      throw new NotFoundException('Invalid referral code');
    }

    await this.db.insert('referral_clicks', {
      id: uuidv4(),
      code,
      ip: ip || 'unknown',
      user_agent: userAgent || 'unknown',
      created_at: new Date().toISOString(),
    });

    this.logger.log(`Tracked click for referral code ${code}`);
  }

  /**
   * When a new user registers with a referral code, link them to the referrer
   */
  async trackSignup(code: string, newUserId: string): Promise<{ referralId: string }> {
    // Validate the code exists
    const codeRecord = await this.db.findOne('referral_codes', { code });
    if (!codeRecord) {
      throw new NotFoundException('Invalid referral code');
    }

    // Prevent self-referral
    if (codeRecord.user_id === newUserId) {
      throw new BadRequestException('Cannot use your own referral code');
    }

    // Check if this user was already referred
    const existingReferral = await this.db.findOne('referrals', { referred_id: newUserId });
    if (existingReferral) {
      throw new BadRequestException('User has already been referred');
    }

    // Get current reward configuration
    const rewards = await this.getRewardConfig();

    const referralId = uuidv4();
    await this.db.insert('referrals', {
      id: referralId,
      referrer_id: codeRecord.user_id,
      referred_id: newUserId,
      referral_code: code,
      status: 'signed_up',
      referrer_reward: rewards.referrerReward,
      referred_reward: rewards.referredReward,
      converted_at: null,
      created_at: new Date().toISOString(),
    });

    this.logger.log(`Tracked signup for referral code ${code}, new user ${newUserId}`);
    return { referralId };
  }

  /**
   * When the referred user completes their first project, trigger the reward
   */
  async trackConversion(referralId: string, type: string): Promise<void> {
    const referral = await this.db.findOne('referrals', { id: referralId });
    if (!referral) {
      throw new NotFoundException('Referral not found');
    }

    if (referral.status === 'converted') {
      this.logger.warn(`Referral ${referralId} has already been converted`);
      return;
    }

    await this.db.update('referrals', referralId, {
      status: 'converted',
      converted_at: new Date().toISOString(),
    });

    this.logger.log(`Referral ${referralId} converted (type: ${type}). Referrer: ${referral.referrer_id}, Referred: ${referral.referred_id}. Rewards: $${referral.referrer_reward} / $${referral.referred_reward}`);
  }

  /**
   * Dashboard stats -- clicks, signups, conversions, total earnings
   */
  async getReferralStats(userId: string): Promise<ReferralStats> {
    // Get the user's referral code
    const codeRecord = await this.db.findOne('referral_codes', { user_id: userId });
    if (!codeRecord) {
      return {
        referralCode: '',
        totalClicks: 0,
        totalSignups: 0,
        totalConversions: 0,
        totalEarnings: 0,
        referrals: [],
      };
    }

    const code = codeRecord.code;

    // Count clicks
    const clicksResult = await this.db.query(
      'SELECT COUNT(*) as count FROM referral_clicks WHERE code = $1',
      [code],
    );
    const totalClicks = parseInt(clicksResult.rows[0]?.count || '0', 10);

    // Get all referrals for this user as referrer
    const referrals = await this.db.findMany('referrals', { referrer_id: userId });

    const totalSignups = referrals.length;
    const totalConversions = referrals.filter((r: any) => r.status === 'converted').length;
    const totalEarnings = referrals
      .filter((r: any) => r.status === 'converted')
      .reduce((sum: number, r: any) => sum + parseFloat(r.referrer_reward || 0), 0);

    return {
      referralCode: code,
      totalClicks,
      totalSignups,
      totalConversions,
      totalEarnings,
      referrals: referrals.map((r: any) => ({
        id: r.id,
        referredId: r.referred_id,
        status: r.status,
        referrerReward: r.referrer_reward,
        referredReward: r.referred_reward,
        convertedAt: r.converted_at,
        createdAt: r.created_at,
      })),
    };
  }

  /**
   * Admin endpoint to set reward amounts
   */
  async configureRewards(dto: ConfigureRewardsDto): Promise<ConfigureRewardsDto> {
    // Store in a config table row
    const existing = await this.db.findOne('referral_config', { key: 'rewards' });

    const configData = {
      referrer_reward: dto.referrerReward,
      referred_reward: dto.referredReward,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      await this.db.update('referral_config', existing.id, configData);
    } else {
      await this.db.insert('referral_config', {
        id: uuidv4(),
        key: 'rewards',
        ...configData,
        created_at: new Date().toISOString(),
      });
    }

    this.logger.log(`Updated referral rewards: referrer=$${dto.referrerReward}, referred=$${dto.referredReward}`);
    return dto;
  }

  /**
   * Get current reward configuration
   */
  private async getRewardConfig(): Promise<ConfigureRewardsDto> {
    try {
      const config = await this.db.findOne('referral_config', { key: 'rewards' });
      if (config) {
        return {
          referrerReward: parseFloat(config.referrer_reward),
          referredReward: parseFloat(config.referred_reward),
        };
      }
    } catch {
      // Table may not exist yet, use defaults
    }
    return {
      referrerReward: ReferralService.DEFAULT_REFERRER_REWARD,
      referredReward: ReferralService.DEFAULT_REFERRED_REWARD,
    };
  }
}
