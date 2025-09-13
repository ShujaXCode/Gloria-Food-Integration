const axios = require('axios');
const logger = require('./logger');

class GloriaFoodAPI {
  constructor() {
    this.baseURL = process.env.GLORIAFOOD_API_URL || 'https://api.gloriafood.com';
    this.apiKey = process.env.GLORIAFOOD_API_KEY;
    this.webhookSecret = process.env.GLORIAFOOD_WEBHOOK_SECRET;
    
    if (!this.apiKey) {
      logger.warn('GloriaFood API key not configured');
    }
    
    logger.info('GloriaFood API initialized with base URL:', this.baseURL);
  }

  // Get headers for API requests
  getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  // Get menu items from GloriaFood
  async getMenuItems() {
    try {
      logger.info('Retrieving menu items from GloriaFood');
      
      const response = await axios.get(`${this.baseURL}/menu`, {
        headers: this.getHeaders()
      });
      
      logger.info('Retrieved menu items from GloriaFood');
      return response.data.items || [];
    } catch (error) {
      logger.error('Failed to retrieve menu items from GloriaFood:', error.message);
      throw error;
    }
  }

  // Get order details from GloriaFood
  async getOrder(orderId) {
    try {
      logger.info(`Retrieving order ${orderId} from GloriaFood`);
      
      const response = await axios.get(`${this.baseURL}/orders/${orderId}`, {
        headers: this.getHeaders()
      });
      
      logger.info(`Retrieved order ${orderId} from GloriaFood`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to retrieve order ${orderId} from GloriaFood:`, error.message);
      throw error;
    }
  }

  // Verify webhook signature
  verifyWebhookSignature(payload, signature) {
    try {
      // Simple verification - in production, implement proper signature verification
      if (!this.webhookSecret) {
        logger.warn('Webhook secret not configured, skipping signature verification');
        return true;
      }
      
      // For now, just check if signature exists
      return !!signature;
    } catch (error) {
      logger.error('Failed to verify webhook signature:', error.message);
      return false;
    }
  }
}

module.exports = GloriaFoodAPI;
