import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import * as Stripe from 'stripe';

/**
 * Stripe Connect Service
 *
 * Handles Stripe Connect account creation and management for developers
 * Allows developers to receive payments through the platform's escrow system
 *
 * @see ESCROW_PAYMENT_SYSTEM_DESIGN.md Phase 2: any Connect Setup
 */
@Injectable()
export class StripeConnectService {
  private readonly logger = new Logger(StripeConnectService.name);
  private stripe: any;

  constructor(
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
  ) {
    const stripeSecretKey = this.config.get('STRIPE_SECRET_KEY');

    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }

    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-09-30.clover' as any,
      typescript: true,
    });

    this.logger.log('StripeConnectService initialized');
  }

  /**
   * Create Stripe Connect Express account for developer
   *
   * Creates a new Stripe Connect account for a developer to receive payments.
   * The account is of type 'express' for easier onboarding.
   *
   * @param userId - Platform user ID
   * @param email - Developer's email address
   * @param country - Country code (ISO 3166-1 alpha-2), defaults to 'US'
   * @param businessType - Type of business ('individual' or 'company')
   * @returns Created Stripe account object and database record
   *
   * @example
   * const account = await stripeConnectService.createConnectAccount(
   *   'user_123',
   *   'dev@example.com',
   *   'US',
   *   'individual'
   * );
   */
  async createConnectAccount(
    userId: string,
    emailOrDto: string | { email: string; country?: string; businessType?: 'individual' | 'company' },
    country: string = 'US',
    businessType: 'individual' | 'company' = 'individual'
  ): Promise<any> {
    // Support both old signature (email, country, businessType) and new (dto)
    const email = typeof emailOrDto === 'string' ? emailOrDto : emailOrDto.email;
    const finalCountry = typeof emailOrDto === 'object' && emailOrDto.country ? emailOrDto.country : country;
    const finalBusinessType = typeof emailOrDto === 'object' && emailOrDto.businessType ? emailOrDto.businessType : businessType;
    try {
      this.logger.log(`Creating Stripe Connect account for user ${userId}`);

      // Check if user already has a Connect account
      const existingAccount = await this.getDeveloperConnectAccount(userId);
      if (existingAccount) {
        throw new BadRequestException('User already has a Stripe Connect account');
      }

      // Create Stripe Connect account
      const account = await this.stripe.accounts.create({
        type: 'express', // Easier onboarding for developers
        country: finalCountry,
        email: email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: finalBusinessType,
        metadata: {
          user_id: userId,
          platform: 'teamatonce',
          created_at: new Date().toISOString(),
        },
      });

      // Store account in database
      const dbRecord = await this.db.insert('stripe_connect_accounts', {
        user_id: userId,
        stripe_account_id: account.id,
        email: email,
        country: finalCountry,
        business_type: finalBusinessType,
        charges_enabled: account.charges_enabled || false,
        payouts_enabled: account.payouts_enabled || false,
        is_onboarded: false,
        details_submitted: account.details_submitted || false,
        metadata: JSON.stringify({
          capabilities: account.capabilities,
          requirements: account.requirements,
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      this.logger.log(`Created Stripe Connect account ${account.id} for user ${userId}`);

      return {
        account,
        dbRecord,
        accountId: account.id,
        email: account.email,
        country: account.country,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        isOnboarded: account.charges_enabled && account.payouts_enabled && account.details_submitted,
      };
    } catch (error) {
      this.logger.error(`Error creating Connect account for user ${userId}:`, error);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to create Stripe Connect account: ${error.message}`
      );
    }
  }

  /**
   * Get or create Connect account for developer
   *
   * Retrieves existing Connect account if available, otherwise creates a new one.
   * Useful for ensuring a developer has an account before processing payments.
   *
   * @param userId - Platform user ID
   * @param email - Developer's email address
   * @param country - Country code (optional)
   * @returns Stripe Connect account ID
   *
   * @example
   * const accountId = await stripeConnectService.getOrCreateConnectAccount(
   *   'user_123',
   *   'dev@example.com'
   * );
   */
  async getOrCreateConnectAccount(
    userId: string,
    email: string,
    country: string = 'US'
  ): Promise<string> {
    try {
      // Check if account already exists
      const existingAccountId = await this.getDeveloperConnectAccount(userId);

      if (existingAccountId) {
        this.logger.log(`Found existing Connect account ${existingAccountId} for user ${userId}`);
        return existingAccountId;
      }

      // Create new account
      this.logger.log(`No existing account found, creating new Connect account for user ${userId}`);
      const result = await this.createConnectAccount(userId, email, country);

      return result.accountId;
    } catch (error) {
      this.logger.error(`Error getting/creating Connect account for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Create account onboarding link
   *
   * Generates a Stripe-hosted onboarding URL for the developer to complete
   * their account setup (identity verification, bank account, etc.)
   *
   * @param accountId - Stripe Connect account ID
   * @param refreshUrl - URL to redirect if link expires
   * @param returnUrl - URL to redirect after completion
   * @param type - Type of account link ('account_onboarding' or 'account_update')
   * @returns Onboarding URL
   *
   * @example
   * const url = await stripeConnectService.createAccountLink(
   *   'acct_123',
   *   'https://platform.com/refresh',
   *   'https://platform.com/complete'
   * );
   */
  async createAccountLink(
    accountId: string,
    refreshUrl: string,
    returnUrl: string,
    type: 'account_onboarding' | 'account_update' = 'account_onboarding'
  ): Promise<string> {
    try {
      this.logger.log(`Creating account link for account ${accountId}`);

      // Verify account exists in Stripe
      const account = await this.stripe.accounts.retrieve(accountId);

      if (!account) {
        throw new NotFoundException(`Stripe account ${accountId} not found`);
      }

      // Create account link
      const accountLink = await this.stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: type,
      });

      this.logger.log(`Created account link for ${accountId}: ${accountLink.url}`);

      return accountLink.url;
    } catch (error) {
      this.logger.error(`Error creating account link for ${accountId}:`, error);

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to create onboarding link: ${error.message}`
      );
    }
  }

  /**
   * Check if account is fully onboarded
   *
   * Verifies that the developer has completed all required onboarding steps
   * and can receive payments (both charges and payouts enabled)
   *
   * @param accountId - Stripe Connect account ID
   * @returns True if fully onboarded, false otherwise
   *
   * @example
   * const isReady = await stripeConnectService.isAccountOnboarded('acct_123');
   * if (!isReady) {
   *   // Redirect to onboarding
   * }
   */
  async isAccountOnboarded(accountId: string): Promise<boolean> {
    try {
      const account = await this.stripe.accounts.retrieve(accountId);

      const isOnboarded =
        account.charges_enabled &&
        account.payouts_enabled &&
        account.details_submitted;

      this.logger.log(
        `Account ${accountId} onboarding status: ${isOnboarded} ` +
        `(charges: ${account.charges_enabled}, payouts: ${account.payouts_enabled}, details: ${account.details_submitted})`
      );

      return isOnboarded;
    } catch (error) {
      this.logger.error(`Error checking onboarding status for ${accountId}:`, error);
      return false;
    }
  }

  /**
   * Get account status and requirements
   *
   * Retrieves detailed status information about the Connect account,
   * including what requirements are still needed for full onboarding.
   *
   * @param userId - Platform user ID
   * @returns Detailed account status including requirements
   *
   * @example
   * const status = await stripeConnectService.getAccountStatus('user_123');
   * console.log('Currently due:', status.currentlyDue);
   * console.log('Is onboarded:', status.isOnboarded);
   */
  async getAccountStatus(userId: string): Promise<any> {
    try {
      // Get account ID from database
      const accountId = await this.getDeveloperConnectAccount(userId);

      if (!accountId) {
        throw new NotFoundException(`No Connect account found for user ${userId}`);
      }

      // Retrieve account from Stripe
      const account = await this.stripe.accounts.retrieve(accountId);

      const status = {
        accountId: account.id,
        isOnboarded: account.charges_enabled && account.payouts_enabled && account.details_submitted,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
        currentlyDue: account.requirements?.currently_due || [],
        eventuallyDue: account.requirements?.eventually_due || [],
        pastDue: account.requirements?.past_due || [],
        pendingVerification: account.requirements?.pending_verification || [],
        disabledReason: account.requirements?.disabled_reason || null,
        email: account.email,
        country: account.country,
        defaultCurrency: account.default_currency,
        created: account.created,
      };

      this.logger.log(`Retrieved status for account ${accountId}`);

      return status;
    } catch (error) {
      this.logger.error(`Error getting account status for user ${userId}:`, error);

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to retrieve account status: ${error.message}`
      );
    }
  }

  /**
   * Update account from Stripe webhook
   *
   * Updates the database record when Stripe sends account.updated webhook events.
   * Keeps local data in sync with Stripe's account state.
   *
   * @param stripeAccountId - Stripe Connect account ID from webhook
   * @returns Updated database record
   *
   * @example
   * // In webhook handler:
   * if (event.type === 'account.updated') {
   *   await stripeConnectService.updateAccountFromWebhook(event.data.object.id);
   * }
   */
  async updateAccountFromWebhook(stripeAccountId: string): Promise<any> {
    try {
      this.logger.log(`Updating account ${stripeAccountId} from webhook`);

      // Retrieve latest account data from Stripe
      const account = await this.stripe.accounts.retrieve(stripeAccountId);

      // Find existing record in database
      const existing = await this.db.findOne('stripe_connect_accounts', {
        stripe_account_id: stripeAccountId,
      });

      if (!existing) {
        this.logger.warn(`No database record found for Stripe account ${stripeAccountId}`);
        return null;
      }

      // Calculate onboarded status
      const isOnboarded =
        account.charges_enabled &&
        account.payouts_enabled &&
        account.details_submitted;

      // Update database record
      const updateData = {
        charges_enabled: account.charges_enabled || false,
        payouts_enabled: account.payouts_enabled || false,
        details_submitted: account.details_submitted || false,
        is_onboarded: isOnboarded,
        email: account.email || existing.email,
        country: account.country || existing.country,
        metadata: JSON.stringify({
          capabilities: account.capabilities,
          requirements: account.requirements,
          business_profile: account.business_profile,
          settings: account.settings,
        }),
        updated_at: new Date().toISOString(),
      };

      await this.db.update('stripe_connect_accounts', existing.id, updateData);

      this.logger.log(
        `Updated account ${stripeAccountId} in database (onboarded: ${isOnboarded})`
      );

      return {
        ...existing,
        ...updateData,
      };
    } catch (error) {
      this.logger.error(`Error updating account ${stripeAccountId} from webhook:`, error);
      throw error;
    }
  }

  /**
   * Get developer's Connect account ID from database
   *
   * Internal helper to retrieve the Stripe account ID associated with a user.
   * Returns null if no account exists.
   *
   * @param userId - Platform user ID
   * @returns Stripe Connect account ID or null
   *
   * @private
   */
  async getDeveloperConnectAccount(userId: string): Promise<string | null> {
    try {
      const account = await this.db.findOne('stripe_connect_accounts', {
        user_id: userId,
      });

      return account?.stripe_account_id || null;
    } catch (error) {
      this.logger.error(`Error getting Connect account for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Delete Connect account (soft delete in database)
   *
   * Marks the account as deleted in the database. Does NOT delete from Stripe.
   * Use with caution - account should be closed in Stripe separately if needed.
   *
   * @param userId - Platform user ID
   * @returns Success status
   */
  async deleteConnectAccount(userId: string): Promise<boolean> {
    try {
      const account = await this.db.findOne('stripe_connect_accounts', {
        user_id: userId,
      });

      if (!account) {
        throw new NotFoundException(`No Connect account found for user ${userId}`);
      }

      await this.db.update('stripe_connect_accounts', account.id, {
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      this.logger.log(`Soft deleted Connect account for user ${userId}`);

      return true;
    } catch (error) {
      this.logger.error(`Error deleting Connect account for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Verify account can receive payments
   *
   * Comprehensive check to ensure account is ready for escrow payments.
   * Checks onboarding status, capabilities, and requirements.
   *
   * @param userId - Platform user ID
   * @returns Verification result with details
   *
   * @example
   * const verification = await stripeConnectService.verifyAccountCanReceivePayments('user_123');
   * if (!verification.canReceivePayments) {
   *   console.log('Blocking reasons:', verification.blockingReasons);
   * }
   */
  async verifyAccountCanReceivePayments(userId: string): Promise<{
    canReceivePayments: boolean;
    accountId: string | null;
    blockingReasons: string[];
  }> {
    try {
      const accountId = await this.getDeveloperConnectAccount(userId);

      if (!accountId) {
        return {
          canReceivePayments: false,
          accountId: null,
          blockingReasons: ['No Stripe Connect account found'],
        };
      }

      const account = await this.stripe.accounts.retrieve(accountId);
      const blockingReasons: string[] = [];

      if (!account.charges_enabled) {
        blockingReasons.push('Charges not enabled');
      }

      if (!account.payouts_enabled) {
        blockingReasons.push('Payouts not enabled');
      }

      if (!account.details_submitted) {
        blockingReasons.push('Account details not submitted');
      }

      if (account.requirements?.currently_due && account.requirements.currently_due.length > 0) {
        blockingReasons.push(`Missing requirements: ${account.requirements.currently_due.join(', ')}`);
      }

      if (account.requirements?.past_due && account.requirements.past_due.length > 0) {
        blockingReasons.push(`Past due requirements: ${account.requirements.past_due.join(', ')}`);
      }

      const canReceivePayments = blockingReasons.length === 0;

      this.logger.log(
        `Payment verification for user ${userId}: ${canReceivePayments ? 'PASS' : 'FAIL'} ` +
        `(${blockingReasons.length} blocking reasons)`
      );

      return {
        canReceivePayments,
        accountId,
        blockingReasons,
      };
    } catch (error) {
      this.logger.error(`Error verifying payment capability for user ${userId}:`, error);
      return {
        canReceivePayments: false,
        accountId: null,
        blockingReasons: [`Error checking account: ${error.message}`],
      };
    }
  }

  /**
   * Get account balance from Stripe
   *
   * Retrieves the current balance for a Connect account.
   * Shows pending and available amounts.
   *
   * @param userId - Platform user ID
   * @returns Balance information
   */
  async getAccountBalance(userId: string): Promise<any> {
    try {
      const accountId = await this.getDeveloperConnectAccount(userId);

      if (!accountId) {
        throw new NotFoundException(`No Connect account found for user ${userId}`);
      }

      const balance = await this.stripe.balance.retrieve({
        stripeAccount: accountId,
      });

      this.logger.log(`Retrieved balance for account ${accountId}`);

      return {
        accountId,
        available: balance.available,
        pending: balance.pending,
        currency: balance.available[0]?.currency || 'usd',
      };
    } catch (error) {
      this.logger.error(`Error getting balance for user ${userId}:`, error);
      throw new BadRequestException(`Failed to retrieve balance: ${error.message}`);
    }
  }

  /**
   * List all Connect accounts (admin function)
   *
   * Retrieves all Connect accounts from the database with optional filtering.
   *
   * @param filters - Optional filters (isOnboarded, etc.)
   * @returns List of Connect accounts
   */
  async listConnectAccounts(filters?: {
    isOnboarded?: boolean;
    chargesEnabled?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    try {
      const conditions: any = {};

      if (filters?.isOnboarded !== undefined) {
        conditions.is_onboarded = filters.isOnboarded;
      }

      if (filters?.chargesEnabled !== undefined) {
        conditions.charges_enabled = filters.chargesEnabled;
      }

      const options: any = {};

      if (filters?.limit) {
        options.limit = filters.limit;
      }

      if (filters?.offset) {
        options.offset = filters.offset;
      }

      const accounts = await this.db.findMany('stripe_connect_accounts', conditions, options);

      this.logger.log(`Retrieved ${accounts.length} Connect accounts`);

      return accounts;
    } catch (error) {
      this.logger.error('Error listing Connect accounts:', error);
      throw error;
    }
  }

  /**
   * Get account onboarding link (wrapper for createAccountLink)
   */
  async getAccountLink(userId: string) {
    try {
      // Get user's Connect account
      const accountId = await this.getDeveloperConnectAccount(userId);

      if (!accountId) {
        throw new NotFoundException('No Stripe Connect account found. Please create one first.');
      }

      // Generate onboarding URLs (use frontend URLs from environment or fallback)
      const baseUrl = this.config.get('FRONTEND_URL', 'http://localhost:3000');
      const refreshUrl = `${baseUrl}/connect/refresh`;
      const returnUrl = `${baseUrl}/connect/complete`;

      const url = await this.createAccountLink(accountId, refreshUrl, returnUrl);

      return {
        url,
        accountId,
      };
    } catch (error) {
      this.logger.error(`Error getting account link for user ${userId}:`, error);

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new BadRequestException(`Failed to get account link: ${error.message}`);
    }
  }

  /**
   * Get Stripe Express dashboard link for developer
   */
  async getDashboardLink(userId: string) {
    try {
      const account = await this.getDeveloperConnectAccount(userId);
      if (!account) {
        throw new NotFoundException('No Stripe Connect account found for this user');
      }

      // Check if account is onboarded
      const isOnboarded = await this.isAccountOnboarded(account);
      if (!isOnboarded) {
        throw new BadRequestException('Account must complete onboarding before accessing dashboard');
      }

      // Create login link for Express dashboard
      const loginLink = await this.stripe.accounts.createLoginLink(account);

      this.logger.log(`Created dashboard link for account ${account}`);

      return {
        url: loginLink.url,
        created: loginLink.created,
      };
    } catch (error) {
      this.logger.error(`Error creating dashboard link for user ${userId}:`, error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException('Failed to generate dashboard link');
    }
  }

  /**
   * Get Stripe Connect account balance (alias for getAccountBalance)
   */
  async getBalance(userId: string) {
    return this.getAccountBalance(userId);
  }
}
