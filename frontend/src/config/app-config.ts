/**
 * Team@Once Application Configuration
 *
 * Centralized configuration management for the application.
 * All environment variables are accessed through this module with proper defaults and type safety.
 *
 * Usage:
 *   import { appConfig } from '@/config/app-config'
 *   const apiUrl = appConfig.api.baseUrl
 */

// Helper function to parse boolean environment variables
const parseBoolean = (value: string | undefined, defaultValue = false): boolean => {
  if (!value) return defaultValue
  return value.toLowerCase() === 'true' || value === '1'
}

// Helper function to parse number environment variables
const parseNumber = (value: string | undefined, defaultValue: number): number => {
  if (!value) return defaultValue
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? defaultValue : parsed
}

// Helper function to parse array environment variables
const parseArray = (value: string | undefined, defaultValue: string[] = []): string[] => {
  if (!value) return defaultValue
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

/**
 * Application Configuration Object
 */
export const appConfig = {
  /**
   * API Configuration
   */
  api: {
    // Base URL for REST API calls
    baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1',

    // Request timeout in milliseconds
    timeout: parseNumber(import.meta.env.VITE_API_TIMEOUT, 30000),

    // Enable request/response logging
    enableLogging: parseBoolean(import.meta.env.VITE_LOG_API_REQUESTS, true),
  },

  /**
   * WebSocket Configuration
   */
  websocket: {
    // WebSocket server URL for real-time features
    url: import.meta.env.VITE_WS_URL || 'http://localhost:3003',

    // Auto-reconnect on connection loss
    autoReconnect: true,

    // Reconnection delay in milliseconds
    reconnectionDelay: 3000,

    // Maximum reconnection attempts
    maxReconnectionAttempts: 5,
  },

  /**
   * Application Environment Configuration
   */
  app: {
    // Current environment
    env: (import.meta.env.VITE_APP_ENV || 'development') as 'development' | 'staging' | 'production',

    // Application base URL
    url: import.meta.env.VITE_APP_URL || 'http://localhost:5176',

    // Application name
    name: 'Team@Once',

    // Application version (from package.json)
    version: '1.0.0',
  },

  /**
   * Feature Flags
   */
  features: {
    // Enable Google Analytics
    analytics: parseBoolean(import.meta.env.VITE_ENABLE_ANALYTICS, false),

    // Enable Sentry error tracking
    errorTracking: parseBoolean(import.meta.env.VITE_ENABLE_ERROR_TRACKING, false),

    // Enable debug mode with detailed console logs
    debugMode: parseBoolean(import.meta.env.VITE_ENABLE_DEBUG_MODE, false),
  },

  /**
   * Authentication Configuration
   */
  auth: {
    // GitHub OAuth
    github: {
      clientId: import.meta.env.VITE_GITHUB_CLIENT_ID || '',
      enabled: !!import.meta.env.VITE_GITHUB_CLIENT_ID,
    },

    // Google OAuth
    google: {
      clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
      enabled: !!import.meta.env.VITE_GOOGLE_CLIENT_ID,
    },

    // NextAuth/Auth.js
    nextAuth: {
      url: import.meta.env.VITE_NEXTAUTH_URL || 'http://localhost:5176',
      secret: import.meta.env.VITE_NEXTAUTH_SECRET || '',
    },
  },

  /**
   * Payment Configuration
   */
  payment: {
    stripe: {
      publishableKey: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '',
      enabled: !!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY,
    },
  },

  /**
   * AI/ML Configuration
   */
  ai: {
    openai: {
      apiKey: import.meta.env.VITE_OPENAI_API_KEY || '',
      enabled: !!import.meta.env.VITE_OPENAI_API_KEY,
    },
  },

  /**
   * Storage Configuration
   */
  storage: {
    aws: {
      region: import.meta.env.VITE_AWS_REGION || '',
      bucket: import.meta.env.VITE_AWS_BUCKET || '',
      enabled: !!import.meta.env.VITE_AWS_BUCKET,
    },
    gcs: {
      bucket: import.meta.env.VITE_GCS_BUCKET || '',
      enabled: !!import.meta.env.VITE_GCS_BUCKET,
    },
    maxFileSize: parseNumber(import.meta.env.VITE_MAX_FILE_SIZE, 10) * 1024 * 1024, // Convert MB to bytes
  },

  /**
   * Analytics & Monitoring Configuration
   */
  analytics: {
    googleAnalytics: {
      trackingId: import.meta.env.VITE_GA_TRACKING_ID || '',
      enabled: !!import.meta.env.VITE_GA_TRACKING_ID,
    },
    sentry: {
      dsn: import.meta.env.VITE_SENTRY_DSN || '',
      enabled: !!import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.VITE_APP_ENV || 'development',
    },
  },

  /**
   * Internationalization Configuration
   */
  i18n: {
    defaultLocale: import.meta.env.VITE_DEFAULT_LOCALE || 'en',
    supportedLocales: parseArray(
      import.meta.env.VITE_SUPPORTED_LOCALES,
      ['en', 'de', 'it', 'fr', 'zh', 'es', 'ja', 'ko', 'pt', 'ru', 'ar']
    ),
  },
} as const

/**
 * Type-safe configuration getter
 */
export type AppConfig = typeof appConfig

/**
 * Development mode helper
 */
export const isDevelopment = appConfig.app.env === 'development'

/**
 * Production mode helper
 */
export const isProduction = appConfig.app.env === 'production'

/**
 * Staging mode helper
 */
export const isStaging = appConfig.app.env === 'staging'

/**
 * Debug logger that only logs in development or when debug mode is enabled
 */
export const debugLog = (..._args: any[]) => {
  if (isDevelopment || appConfig.features.debugMode) {
    //console.log('[Team@Once Debug]', ..._args)
  }
}

/**
 * Validate required configuration
 * Call this early in the application lifecycle to ensure all required env vars are set
 */
export const validateConfig = (): { valid: boolean; errors: string[] } => {
  const errors: string[] = []

  // Check required API configuration
  if (!appConfig.api.baseUrl) {
    errors.push('VITE_API_URL is required')
  }

  if (!appConfig.websocket.url) {
    errors.push('VITE_WS_URL is required')
  }

  // Check required authentication configuration (if auth is used)
  if (!appConfig.auth.nextAuth.url && isProduction) {
    errors.push('VITE_NEXTAUTH_URL is required in production')
  }

  // Check payment configuration (if payments are used)
  if (isProduction && !appConfig.payment.stripe.publishableKey) {
    // Stripe key not set in production - payments will be disabled
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validate configuration on application start (in development)
 */
if (isDevelopment) {
  const validation = validateConfig()
  if (!validation.valid) {
    console.error('Configuration Errors:')
    validation.errors.forEach(error => console.error(`  - ${error}`))
  }
}

// Export default for convenience
export default appConfig
