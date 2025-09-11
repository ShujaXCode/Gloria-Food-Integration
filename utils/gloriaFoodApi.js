const axios = require('axios');
const logger = require('./logger');

class GloriaFoodAPI {
  constructor() {
    this.baseURL = process.env.GLORIAFOOD_API_URL;
    this.apiKey = process.env.GLORIAFOOD_API_KEY;
    this.webhookSecret = process.env.GLORIAFOOD_WEBHOOK_SECRET;
    
    if (!this.apiKey) {
      logger.warn('GloriaFood API key not configured');
    }
  }

  // Verify webhook signature
  verifyWebhookSignature(payload, signature) {
    if (!this.webhookSecret) {
      logger.warn('Webhook secret not configured, skipping signature verification');
      return true;
    }
    
    // This is a basic implementation - you may need to adjust based on GloriaFood's actual signature method
    const expectedSignature = require('crypto')
      .createHmac('sha256', this.webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');
    
    return signature === expectedSignature;
  }

  // Get order details from GloriaFood
  async getOrder(orderId) {
    try {
      const response = await axios.get(`${this.baseURL}/orders/${orderId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      logger.info(`Retrieved order ${orderId} from GloriaFood`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to retrieve order ${orderId} from GloriaFood:`, error.message);
      throw error;
    }
  }

  // Get menu items from GloriaFood
  async getMenuItems() {
    try {
      const response = await axios.get(`${this.baseURL}/menu`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      logger.info('Retrieved menu items from GloriaFood');
      return response.data;
    } catch (error) {
      logger.error('Failed to retrieve menu items from GloriaFood:', error.message);
      throw error;
    }
  }

  // Process incoming webhook data
  processWebhookData(webhookData) {
    try {
      logger.info('Processing webhook data with fields:', Object.keys(webhookData));
      
      // Handle both single order and orders array
      const orderData = webhookData.orders ? webhookData.orders[0] : webhookData;
      
      const order = {
        id: orderData.id || orderData.order_id || orderData.orderId,
        timestamp: orderData.accepted_at || orderData.updated_at || orderData.created_at || new Date().toISOString(),
        status: orderData.status || 'new',
        orderType: orderData.type || 'pickup', // pickup, delivery, dine_in
        customer: {
          name: `${orderData.client_first_name || ''} ${orderData.client_last_name || ''}`.trim() || 'Unknown Customer',
          phone: orderData.client_phone || orderData.client_mobile,
          email: orderData.client_email,
          address: orderData.client_address || orderData.delivery_address
        },
        items: orderData.items || [],
        subtotal: orderData.sub_total_price || orderData.subtotal || 0,
        tax: orderData.tax_value || orderData.tax || 0,
        deliveryFee: 0, // GloriaFood doesn't seem to have this field
        total: orderData.total_price || orderData.total || 0,
        notes: orderData.instructions || orderData.notes || '',
        paymentMethod: orderData.payment || orderData.payment_method || 'CASH',
        source: 'gloriafood',
        // Additional GloriaFood specific fields
        restaurantName: orderData.restaurant_name,
        currency: orderData.currency,
        forLater: orderData.for_later || false
      };

      logger.info(`Processed webhook data for order ${order.id}`);
      return order;
    } catch (error) {
      logger.error('Failed to process webhook data:', error.message);
      throw error;
    }
  }

  // Validate webhook data
  validateWebhookData(webhookData) {
    logger.info('Validating webhook data with fields:', Object.keys(webhookData));
    
    // Handle both single order and orders array
    const orderData = webhookData.orders ? webhookData.orders[0] : webhookData;
    
    // Check for order ID
    const orderId = orderData.id || orderData.order_id || orderData.orderId;
    if (!orderId) {
      throw new Error('Missing order ID (id, order_id, or orderId)');
    }
    
    // Check for customer data
    const hasCustomerData = orderData.client_first_name || orderData.client_last_name || orderData.client_phone;
    if (!hasCustomerData) {
      throw new Error('Missing customer information (client_first_name, client_last_name, client_phone)');
    }
    
    // Check for items
    const items = orderData.items || [];
    if (!items || items.length === 0) {
      throw new Error('Order must contain at least one item');
    }
    
    // Check for total
    const total = orderData.total_price || orderData.total || orderData.amount;
    if (!total) {
      throw new Error('Missing order total (total_price, total, or amount)');
    }
    
    logger.info('Webhook validation passed');
    return true;
  }
}

module.exports = GloriaFoodAPI;
