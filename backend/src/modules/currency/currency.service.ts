import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import axios from 'axios';

export interface SupportedCurrency {
  code: string;
  name: string;
  symbol: string;
  decimalDigits: number;
}

export interface ExchangeRates {
  base: string;
  timestamp: number;
  rates: Record<string, number>;
}

export interface ConvertResult {
  from: string;
  to: string;
  amount: number;
  convertedAmount: number;
  rate: number;
  timestamp: number;
}

/**
 * Top 15 supported currencies
 */
const SUPPORTED_CURRENCIES: SupportedCurrency[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', decimalDigits: 2 },
  { code: 'EUR', name: 'Euro', symbol: '\u20AC', decimalDigits: 2 },
  { code: 'GBP', name: 'British Pound', symbol: '\u00A3', decimalDigits: 2 },
  { code: 'JPY', name: 'Japanese Yen', symbol: '\u00A5', decimalDigits: 0 },
  { code: 'BDT', name: 'Bangladeshi Taka', symbol: '\u09F3', decimalDigits: 2 },
  { code: 'INR', name: 'Indian Rupee', symbol: '\u20B9', decimalDigits: 2 },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', decimalDigits: 2 },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimalDigits: 2 },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', decimalDigits: 2 },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '\u00A5', decimalDigits: 2 },
  { code: 'KRW', name: 'South Korean Won', symbol: '\u20A9', decimalDigits: 0 },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', decimalDigits: 2 },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimalDigits: 2 },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', decimalDigits: 2 },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', decimalDigits: 2 },
];

/**
 * Fallback hardcoded rates (USD base) for top currencies
 * Used when the exchange rate API is unavailable
 */
const FALLBACK_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 154.5,
  BDT: 121.5,
  INR: 83.5,
  CAD: 1.37,
  AUD: 1.55,
  CHF: 0.88,
  CNY: 7.24,
  KRW: 1345.0,
  BRL: 5.05,
  SGD: 1.35,
  HKD: 7.82,
  NZD: 1.68,
};

/**
 * Locale mappings for currency formatting
 */
const CURRENCY_LOCALES: Record<string, string> = {
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
  JPY: 'ja-JP',
  BDT: 'bn-BD',
  INR: 'en-IN',
  CAD: 'en-CA',
  AUD: 'en-AU',
  CHF: 'de-CH',
  CNY: 'zh-CN',
  KRW: 'ko-KR',
  BRL: 'pt-BR',
  SGD: 'en-SG',
  HKD: 'zh-HK',
  NZD: 'en-NZ',
};

@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);

  // In-memory cache for exchange rates (1 hour TTL)
  private ratesCache: { data: ExchangeRates; expiresAt: number } | null = null;
  private static readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  constructor(
    private readonly configService: ConfigService,
    private readonly db: DatabaseService,
  ) {}

  /**
   * Return list of supported currencies with symbols
   */
  getSupportedCurrencies(): SupportedCurrency[] {
    return SUPPORTED_CURRENCIES;
  }

  /**
   * Validate that a currency code is supported
   */
  private validateCurrency(code: string): void {
    if (!SUPPORTED_CURRENCIES.find((c) => c.code === code)) {
      throw new BadRequestException(
        `Unsupported currency: ${code}. Supported: ${SUPPORTED_CURRENCIES.map((c) => c.code).join(', ')}`,
      );
    }
  }

  /**
   * Get current exchange rates (cached for 1 hour)
   * Uses Open Exchange Rates API with fallback to hardcoded rates
   */
  async getExchangeRates(base: string = 'USD'): Promise<ExchangeRates> {
    this.validateCurrency(base);

    // Check cache
    if (this.ratesCache && Date.now() < this.ratesCache.expiresAt) {
      // If requested base is USD, return cached directly
      if (base === 'USD') {
        return this.ratesCache.data;
      }
      // Otherwise rebase from cached USD rates
      return this.rebaseRates(this.ratesCache.data, base);
    }

    // Fetch fresh rates (always in USD base)
    const rates = await this.fetchRates();
    this.ratesCache = {
      data: rates,
      expiresAt: Date.now() + CurrencyService.CACHE_TTL_MS,
    };

    if (base === 'USD') {
      return rates;
    }
    return this.rebaseRates(rates, base);
  }

  /**
   * Fetch exchange rates from API, fall back to hardcoded rates
   */
  private async fetchRates(): Promise<ExchangeRates> {
    const apiKey = this.configService.get<string>('OPEN_EXCHANGE_RATES_APP_ID');
    const apiUrl = 'https://openexchangerates.org/api/latest.json';

    if (apiKey) {
      try {
        const response = await axios.get(apiUrl, {
          params: { app_id: apiKey },
          timeout: 5000,
        });

        const data = response.data;
        // Filter to only supported currencies
        const supportedCodes = SUPPORTED_CURRENCIES.map((c) => c.code);
        const filteredRates: Record<string, number> = {};
        for (const code of supportedCodes) {
          if (data.rates[code] !== undefined) {
            filteredRates[code] = data.rates[code];
          }
        }

        this.logger.log('Fetched exchange rates from Open Exchange Rates API');
        return {
          base: 'USD',
          timestamp: data.timestamp || Math.floor(Date.now() / 1000),
          rates: filteredRates,
        };
      } catch (error) {
        this.logger.warn(
          `Failed to fetch exchange rates from API: ${error.message}. Using fallback rates.`,
        );
      }
    } else {
      this.logger.warn(
        'OPEN_EXCHANGE_RATES_APP_ID not configured. Using fallback hardcoded rates.',
      );
    }

    // Fallback to hardcoded rates
    return {
      base: 'USD',
      timestamp: Math.floor(Date.now() / 1000),
      rates: { ...FALLBACK_RATES },
    };
  }

  /**
   * Rebase exchange rates from USD to another base currency
   */
  private rebaseRates(usdRates: ExchangeRates, newBase: string): ExchangeRates {
    const baseRate = usdRates.rates[newBase];
    if (!baseRate) {
      throw new BadRequestException(`No rate available for base currency: ${newBase}`);
    }

    const rebasedRates: Record<string, number> = {};
    for (const [code, rate] of Object.entries(usdRates.rates)) {
      rebasedRates[code] = rate / baseRate;
    }

    return {
      base: newBase,
      timestamp: usdRates.timestamp,
      rates: rebasedRates,
    };
  }

  /**
   * Convert between currencies using cached rates
   */
  async convert(amount: number, from: string, to: string): Promise<ConvertResult> {
    this.validateCurrency(from);
    this.validateCurrency(to);

    if (amount < 0) {
      throw new BadRequestException('Amount must be non-negative');
    }

    if (from === to) {
      return {
        from,
        to,
        amount,
        convertedAmount: amount,
        rate: 1,
        timestamp: Math.floor(Date.now() / 1000),
      };
    }

    // Get rates with USD as base
    const rates = await this.getExchangeRates('USD');

    const fromRate = rates.rates[from];
    const toRate = rates.rates[to];

    if (!fromRate || !toRate) {
      throw new BadRequestException(`Exchange rate not available for ${from} -> ${to}`);
    }

    // Convert: amount in "from" -> USD -> "to"
    const rate = toRate / fromRate;
    const convertedAmount = amount * rate;

    // Round based on target currency decimal digits
    const targetCurrency = SUPPORTED_CURRENCIES.find((c) => c.code === to);
    const decimals = targetCurrency?.decimalDigits ?? 2;
    const rounded = Math.round(convertedAmount * Math.pow(10, decimals)) / Math.pow(10, decimals);

    return {
      from,
      to,
      amount,
      convertedAmount: rounded,
      rate: Math.round(rate * 1000000) / 1000000,
      timestamp: rates.timestamp,
    };
  }

  /**
   * Format for display (e.g., $1,234.56, JPY 1,234, EUR 1.234,56)
   */
  formatCurrency(amount: number, currency: string): string {
    this.validateCurrency(currency);

    const locale = CURRENCY_LOCALES[currency] || 'en-US';
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
      }).format(amount);
    } catch {
      // Fallback: basic formatting
      const curr = SUPPORTED_CURRENCIES.find((c) => c.code === currency);
      return `${curr?.symbol || currency} ${amount.toFixed(curr?.decimalDigits ?? 2)}`;
    }
  }

  /**
   * Read preferred currency from user preferences
   */
  async getUserPreferredCurrency(userId: string): Promise<string> {
    try {
      const user = await this.db.findOne('users', { id: userId });
      return user?.preferred_currency || 'USD';
    } catch {
      return 'USD';
    }
  }

  /**
   * Store preferred currency in user preferences
   */
  async setUserPreferredCurrency(userId: string, currency: string): Promise<{ preferredCurrency: string }> {
    this.validateCurrency(currency);

    await this.db.update('users', userId, {
      preferred_currency: currency,
      updated_at: new Date().toISOString(),
    });

    this.logger.log(`Set preferred currency for user ${userId} to ${currency}`);
    return { preferredCurrency: currency };
  }
}
