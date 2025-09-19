// Dynamic API Configuration for GloriaFood-Loyverse Integration
// Update these values with your client's actual credentials

module.exports = {
  // GloriaFood API Configuration
  gloriaFood: {
    baseURL: 'https://api.gloriafood.com',
    restaurantToken: 'zP7St9GSIcnJb2LxrBcY3C7tKDtl6OF6E', // Client's token
    authenticateKey: 'BPmQbOBpZQboPp7Ho1ygvjmdSZTnQsrTq', // Client's auth key
    webhookSecret: process.env.GLORIAFOOD_WEBHOOK_SECRET || 'your_webhook_secret_here',
    endpoints: {
      orders: '/orders',
      menu: '/menu',
      webhook: '/webhook'
    }
  },

  // Loyverse API Configuration
  loyverse: {
    baseURL: 'https://api.loyverse.com',
    accessToken: process.env.LOYVERSE_ACCESS_TOKEN || 'your_loyverse_access_token_here',
    locationId: process.env.LOYVERSE_LOCATION_ID || 'your_location_id_here',
    // Try multiple possible base URLs
    possibleBaseURLs: [
      'https://api.loyverse.com',
      'https://api.loyverse.com/v1',
      'https://loyverse.com/api',
      'https://loyverse.com/api/v1'
    ],
    endpoints: {
      receipts: '/receipts',
      customers: '/customers',
      items: '/items',
      locations: '/locations'
    }
  },

  // JSONBin.io Configuration
  jsonbin: {
    baseURL: 'https://api.jsonbin.io/v3',
    apiKey: process.env.JSONBIN_API_KEY || '$2a$10$9SK02VE3u.mo2fRZooEUOu1C9nr5DGrhii3TbVIUVSnxtYFrQ4tAO',
    accessKey: process.env.JSONBIN_ACCESS_KEY || '$2a$10$.GUFxU51FFPksZX/6530h.z210kmyLi32ncHkGaoEsH2yr0FHwjR2',
    binId: process.env.JSONBIN_BIN_ID || '68cd1ce7d0ea881f4082f202',
    collectionId: process.env.JSONBIN_COLLECTION_ID || null
  },

  // Integration Settings
  integration: {
    autoCreateCustomers: true,
    syncMenuItems: true,
    retryAttempts: 3,
    retryDelay: 5000,
    orderPrefix: 'GF-', // Prefix for Loyverse receipt numbers
    webhookTimeout: 30000, // 30 seconds
    maxOrderItems: 50, // Maximum items per order
    enableLogging: true,
    enableMonitoring: true
  },

  // Server Configuration
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0',
    environment: process.env.NODE_ENV || 'development',
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true
    }
  },

  // Database Configuration (for order tracking)
  database: {
    type: 'memory', // 'memory' for simple storage, 'sqlite' for persistent
    path: process.env.DB_PATH || './data/orders.db',
    backupInterval: 24 * 60 * 60 * 1000 // 24 hours
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/app.log',
    maxSize: '10m',
    maxFiles: 5,
    enableConsole: true,
    enableFile: true
  },

  // Security Configuration
  security: {
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.'
    },
    webhookVerification: true,
    apiKeyValidation: true,
    corsProtection: true
  },

  // Monitoring Configuration
  monitoring: {
    healthCheckInterval: 60000, // 1 minute
    orderProcessingTimeout: 30000, // 30 seconds
    enableMetrics: true,
    enableAlerts: true,
    alertThresholds: {
      errorRate: 0.05, // 5% error rate
      responseTime: 5000, // 5 seconds
      orderQueueSize: 100
    }
  }
};
