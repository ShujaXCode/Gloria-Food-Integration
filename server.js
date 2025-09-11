const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
require('dotenv').config();

const logger = require('./utils/logger');
const gloriaFoodRoutes = require('./routes/gloriaFood');
const loyverseRoutes = require('./routes/loyverse');
const integrationRoutes = require('./routes/integration');
const dashboardRoutes = require('./routes/dashboard');
const IntegrationService = require('./services/integrationService');

const app = express();
const PORT = process.env.PORT || 8080;

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : true,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// Initialize integration service
const integrationService = new IntegrationService();

// API routes
app.use('/api/gloriafood', gloriaFoodRoutes);
app.use('/api/loyverse', loyverseRoutes);
app.use('/api/integration', integrationRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Set up event listeners for order processing
app.on('new_order', async (orderData) => {
  try {
    logger.info(`Processing new order from webhook: ${orderData.id}`);
    const result = await integrationService.processOrder(orderData);
    
    if (result.success) {
      logger.info(`Order ${orderData.id} processed successfully`);
    } else {
      logger.error(`Order ${orderData.id} processing failed:`, result.error);
    }
  } catch (error) {
    logger.error(`Error processing order ${orderData.id}:`, error.message);
  }
});

// Handle order updates
app.on('order_updated', async (orderData) => {
  try {
    logger.info(`Processing order update from webhook: ${orderData.id}`);
    const result = await integrationService.updateOrder(orderData);
    
    if (result.success) {
      logger.info(`Order ${orderData.id} updated successfully`);
    } else {
      logger.error(`Order ${orderData.id} update failed:`, result.error);
    }
  } catch (error) {
    logger.error(`Error updating order ${orderData.id}:`, error.message);
  }
});

// Handle order cancellations
app.on('order_cancelled', async (orderData) => {
  try {
    logger.info(`Processing order cancellation from webhook: ${orderData.id}`);
    const result = await integrationService.cancelOrder(orderData);
    
    if (result.success) {
      logger.info(`Order ${orderData.id} cancelled successfully`);
    } else {
      logger.error(`Order ${orderData.id} cancellation failed:`, result.error);
    }
  } catch (error) {
    logger.error(`Error cancelling order ${orderData.id}:`, error.message);
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'GloriaFood-Loyverse Integration API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      gloriafood: '/api/gloriafood',
      loyverse: '/api/loyverse',
      integration: '/api/integration',
      dashboard: '/api/dashboard'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  
  res.status(error.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
