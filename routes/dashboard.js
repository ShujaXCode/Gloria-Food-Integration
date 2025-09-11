const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Get system status and health information
router.get('/status', (req, res) => {
  try {
    const status = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development',
      version: process.version,
      platform: process.platform,
      integrations: {
        gloriafood: {
          configured: !!process.env.GLORIAFOOD_API_KEY,
          webhookSecret: !!process.env.GLORIAFOOD_WEBHOOK_SECRET
        },
        loyverse: {
          configured: !!process.env.LOYVERSE_ACCESS_TOKEN,
          locationId: !!process.env.LOYVERSE_LOCATION_ID
        }
      }
    };
    
    res.json({
      success: true,
      data: status
    });
    
  } catch (error) {
    logger.error('Error getting system status:', error.message);
    
    res.status(500).json({
      error: 'Failed to get system status',
      message: error.message
    });
  }
});

// Get recent logs
router.get('/logs', (req, res) => {
  try {
    const { level = 'info', limit = 100 } = req.query;
    const logsDir = path.join(__dirname, '..', 'logs');
    
    if (!fs.existsSync(logsDir)) {
      return res.json({
        success: true,
        data: [],
        message: 'No logs directory found'
      });
    }
    
    // Read the combined log file
    const logFile = path.join(logsDir, 'combined.log');
    
    if (!fs.existsSync(logFile)) {
      return res.json({
        success: true,
        data: [],
        message: 'No log files found'
      });
    }
    
    // Read last N lines from log file
    const logContent = fs.readFileSync(logFile, 'utf8');
    const logLines = logContent.split('\n').filter(line => line.trim());
    
    // Parse JSON logs and filter by level
    const logs = logLines
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      })
      .filter(log => log && (!level || log.level === level))
      .slice(-parseInt(limit));
    
    res.json({
      success: true,
      count: logs.length,
      data: logs
    });
    
  } catch (error) {
    logger.error('Error reading logs:', error.message);
    
    res.status(500).json({
      error: 'Failed to read logs',
      message: error.message
    });
  }
});

// Get error logs specifically
router.get('/logs/errors', (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const logsDir = path.join(__dirname, '..', 'logs');
    
    if (!fs.existsSync(logsDir)) {
      return res.json({
        success: true,
        data: [],
        message: 'No logs directory found'
      });
    }
    
    // Read the error log file
    const errorLogFile = path.join(logsDir, 'error.log');
    
    if (!fs.existsSync(errorLogFile)) {
      return res.json({
        success: true,
        data: [],
        message: 'No error logs found'
      });
    }
    
    // Read last N lines from error log file
    const logContent = fs.readFileSync(errorLogFile, 'utf8');
    const logLines = logContent.split('\n').filter(line => line.trim());
    
    // Parse JSON logs
    const logs = logLines
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      })
      .filter(log => log)
      .slice(-parseInt(limit));
    
    res.json({
      success: true,
      count: logs.length,
      data: logs
    });
    
  } catch (error) {
    logger.error('Error reading error logs:', error.message);
    
    res.status(500).json({
      error: 'Failed to read error logs',
      message: error.message
    });
  }
});

// Get API endpoints information
router.get('/endpoints', (req, res) => {
  try {
    const endpoints = {
      gloriafood: {
        webhook: 'POST /api/gloriafood/webhook',
        getOrder: 'GET /api/gloriafood/orders/:orderId',
        getMenu: 'GET /api/gloriafood/menu',
        testWebhook: 'POST /api/gloriafood/test-webhook'
      },
      loyverse: {
        createReceipt: 'POST /api/loyverse/receipts',
        getProducts: 'GET /api/loyverse/products',
        getLocations: 'GET /api/loyverse/locations',
        createCustomer: 'POST /api/loyverse/customers',
        findCustomer: 'GET /api/loyverse/customers/search',
        updateReceiptStatus: 'PATCH /api/loyverse/receipts/:receiptId/status',
        testConnection: 'GET /api/loyverse/test-connection'
      },
      integration: {
        processOrder: 'POST /api/integration/process-order',
        getOrderStatus: 'GET /api/integration/order-status/:orderId',
        retryOrder: 'POST /api/integration/retry-order/:orderId',
        manualSync: 'POST /api/integration/manual-sync',
        syncMenu: 'POST /api/integration/sync-menu',
        getMenuMapping: 'GET /api/integration/menu-mapping',
        getAllOrdersStatus: 'GET /api/integration/all-orders-status',
        clearCompletedOrders: 'DELETE /api/integration/clear-completed-orders'
      },
      dashboard: {
        status: 'GET /api/dashboard/status',
        logs: 'GET /api/dashboard/logs',
        errorLogs: 'GET /api/dashboard/logs/errors',
        endpoints: 'GET /api/dashboard/endpoints'
      }
    };
    
    res.json({
      success: true,
      data: endpoints
    });
    
  } catch (error) {
    logger.error('Error getting endpoints info:', error.message);
    
    res.status(500).json({
      error: 'Failed to get endpoints info',
      message: error.message
    });
  }
});

// Get configuration status
router.get('/config', (req, res) => {
  try {
    const config = {
      server: {
        port: process.env.PORT || 3000,
        environment: process.env.NODE_ENV || 'development'
      },
      gloriafood: {
        apiUrl: process.env.GLORIAFOOD_API_URL || 'Not configured',
        apiKey: process.env.GLORIAFOOD_API_KEY ? 'Configured' : 'Not configured',
        webhookSecret: process.env.GLORIAFOOD_WEBHOOK_SECRET ? 'Configured' : 'Not configured'
      },
      loyverse: {
        apiUrl: process.env.LOYVERSE_API_URL || 'Not configured',
        accessToken: process.env.LOYVERSE_ACCESS_TOKEN ? 'Configured' : 'Not configured',
        locationId: process.env.LOYVERSE_LOCATION_ID || 'Not configured'
      },
      integration: {
        autoCreateCustomers: process.env.AUTO_CREATE_CUSTOMERS === 'true',
        syncMenuItems: process.env.SYNC_MENU_ITEMS === 'true',
        retryAttempts: parseInt(process.env.RETRY_ATTEMPTS) || 3,
        retryDelay: parseInt(process.env.RETRY_DELAY) || 5000
      },
      logging: {
        level: process.env.LOG_LEVEL || 'info',
        logFile: process.env.LOG_FILE || 'logs/app.log'
      }
    };
    
    res.json({
      success: true,
      data: config
    });
    
  } catch (error) {
    logger.error('Error getting configuration:', error.message);
    
    res.status(500).json({
      error: 'Failed to get configuration',
      message: error.message
    });
  }
});

module.exports = router;
