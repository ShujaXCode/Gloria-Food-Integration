const axios = require('axios');
const crypto = require('crypto');
const config = require('../config/apiConfig');
const logger = require('../utils/logger');

class GloriaFoodService {
  constructor() {
    this.config = config.gloriaFood;
    this.baseURL = this.config.baseURL;
    this.restaurantToken = this.config.restaurantToken;
    this.authenticateKey = this.config.authenticateKey;
    this.webhookSecret = this.config.webhookSecret;
    
    // Initialize axios instance with default config
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: config.integration.webhookTimeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'GloriaFood-Loyverse-Integration/1.0.0'
      }
    });

    logger.info('GloriaFood service initialized with restaurant token:', this.restaurantToken);
  }

  // Get authentication headers for API requests
  getAuthHeaders() {
    return {
      'Authorization': `Bearer ${this.restaurantToken}`,
      'X-Authenticate-Key': this.authenticateKey,
      'Content-Type': 'application/json'
    };
  }

  // Verify webhook signature
  verifyWebhookSignature(payload, signature) {
    if (!this.webhookSecret || this.webhookSecret === 'your_webhook_secret_here') {
      logger.warn('Webhook secret not configured, skipping signature verification');
      return true;
    }
    
    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(JSON.stringify(payload))
        .digest('hex');
      
      const isValid = signature === expectedSignature;
      
      if (!isValid) {
        logger.warn('Invalid webhook signature received');
      }
      
      return isValid;
    } catch (error) {
      logger.error('Error verifying webhook signature:', error.message);
      return false;
    }
  }

  // Get order details from GloriaFood
  async getOrder(orderId) {
    try {
      logger.info(`Fetching order ${orderId} from GloriaFood`);
      
      const response = await this.api.get(`/orders/${orderId}`, {
        headers: this.getAuthHeaders()
      });
      
      logger.info(`Successfully retrieved order ${orderId} from GloriaFood`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to retrieve order ${orderId} from GloriaFood:`, error.message);
      
      if (error.response?.status === 404) {
        throw new Error(`Order ${orderId} not found in GloriaFood`);
      }
      
      throw new Error(`GloriaFood API error: ${error.message}`);
    }
  }

  // Get menu items from GloriaFood
  async getMenuItems() {
    try {
      logger.info('Fetching menu items from GloriaFood');
      
      const response = await this.api.get('/menu', {
        headers: this.getAuthHeaders()
      });
      
      logger.info(`Successfully retrieved ${response.data?.length || 0} menu items from GloriaFood`);
      return response.data || [];
    } catch (error) {
      logger.error('Failed to retrieve menu items from GloriaFood:', error.message);
      throw new Error(`GloriaFood menu API error: ${error.message}`);
    }
  }

  // Get customers from GloriaFood (through orders)
  async getCustomers() {
    try {
      logger.info('Fetching customers from GloriaFood through orders');
      
      // Get recent orders to extract customer data
      const response = await this.api.get('/orders', {
        headers: this.getAuthHeaders(),
        params: {
          limit: 100, // Get last 100 orders
          status: 'accepted'
        }
      });
      
      const orders = response.data?.orders || response.data || [];
      const customers = new Map();
      
      // Extract unique customers from orders
      orders.forEach(order => {
        if (order.client_id && (order.client_phone || order.client_email)) {
          const customerKey = order.client_phone || order.client_email;
          
          if (!customers.has(customerKey)) {
            customers.set(customerKey, {
              id: order.client_id,
              name: `${order.client_first_name || ''} ${order.client_last_name || ''}`.trim(),
              phone: order.client_phone,
              email: order.client_email,
              address: order.client_address,
              total_orders: 1,
              last_order_date: order.updated_at || order.accepted_at,
              restaurant_id: order.restaurant_id
            });
          } else {
            // Update existing customer
            const existingCustomer = customers.get(customerKey);
            existingCustomer.total_orders += 1;
            if (order.updated_at > existingCustomer.last_order_date) {
              existingCustomer.last_order_date = order.updated_at || order.accepted_at;
            }
          }
        }
      });
      
      const customerList = Array.from(customers.values());
      logger.info(`Successfully retrieved ${customerList.length} unique customers from GloriaFood`);
      
      return customerList;
    } catch (error) {
      logger.error('Failed to retrieve customers from GloriaFood:', error.message);
      throw new Error(`GloriaFood customers API error: ${error.message}`);
    }
  }

  // Get specific customer by ID from GloriaFood
  async getCustomer(customerId) {
    try {
      logger.info(`Fetching customer ${customerId} from GloriaFood`);
      
      // Get orders for this specific customer
      const response = await this.api.get('/orders', {
        headers: this.getAuthHeaders(),
        params: {
          client_id: customerId,
          limit: 50
        }
      });
      
      const orders = response.data?.orders || response.data || [];
      
      if (orders.length === 0) {
        throw new Error(`Customer ${customerId} not found in GloriaFood`);
      }
      
      // Get customer data from the first order
      const firstOrder = orders[0];
      const customer = {
        id: firstOrder.client_id,
        name: `${firstOrder.client_first_name || ''} ${firstOrder.client_last_name || ''}`.trim(),
        phone: firstOrder.client_phone,
        email: firstOrder.client_email,
        address: firstOrder.client_address,
        total_orders: orders.length,
        first_order_date: orders[orders.length - 1]?.accepted_at,
        last_order_date: firstOrder.accepted_at,
        restaurant_id: firstOrder.restaurant_id,
        orders: orders.map(order => ({
          id: order.id,
          total: order.total_price,
          date: order.accepted_at,
          status: order.status,
          type: order.type
        }))
      };
      
      logger.info(`Successfully retrieved customer ${customerId} from GloriaFood`);
      return customer;
    } catch (error) {
      logger.error(`Failed to retrieve customer ${customerId} from GloriaFood:`, error.message);
      throw new Error(`GloriaFood customer API error: ${error.message}`);
    }
  }

  // Get customer orders from GloriaFood
  async getCustomerOrders(customerId, limit = 20) {
    try {
      logger.info(`Fetching orders for customer ${customerId} from GloriaFood`);
      
      const response = await this.api.get('/orders', {
        headers: this.getAuthHeaders(),
        params: {
          client_id: customerId,
          limit: limit
        }
      });
      
      const orders = response.data?.orders || response.data || [];
      logger.info(`Successfully retrieved ${orders.length} orders for customer ${customerId} from GloriaFood`);
      
      return orders;
    } catch (error) {
      logger.error(`Failed to retrieve orders for customer ${customerId} from GloriaFood:`, error.message);
      throw new Error(`GloriaFood customer orders API error: ${error.message}`);
    }
  }

  // Search customer in GloriaFood by email or phone
  async searchCustomerByEmailOrPhone(email, phone) {
    try {
      logger.info(`Searching customer in GloriaFood by email: ${email} or phone: ${phone}`);
      
      // Get recent orders to search for customer
      const response = await this.api.get('/orders', {
        headers: this.getAuthHeaders(),
        params: {
          limit: 100, // Get last 100 orders
          status: 'accepted'
        }
      });
      
      const orders = response.data?.orders || response.data || [];
      
      // Search for customer by email or phone
      const customerOrder = orders.find(order => {
        const emailMatch = email && order.client_email === email;
        const phoneMatch = phone && order.client_phone === phone;
        return emailMatch || phoneMatch;
      });
      
      if (customerOrder) {
        const customer = {
          id: customerOrder.client_id,
          name: `${customerOrder.client_first_name || ''} ${customerOrder.client_last_name || ''}`.trim(),
          phone: customerOrder.client_phone,
          email: customerOrder.client_email,
          address: customerOrder.client_address,
          restaurant_id: customerOrder.restaurant_id,
          found_in_gloriafood: true
        };
        
        logger.info(`Found customer in GloriaFood: ${customer.name} (ID: ${customer.id})`);
        return customer;
      } else {
        logger.info(`Customer not found in GloriaFood with email: ${email} or phone: ${phone}`);
        return null;
      }
    } catch (error) {
      logger.error(`Failed to search customer in GloriaFood:`, error.message);
      throw new Error(`GloriaFood customer search error: ${error.message}`);
    }
  }

  // Find or create customer in GloriaFood and sync to Loyverse
  async findOrCreateCustomerInGloriaFoodAndLoyverse(customerData) {
    try {
      logger.info('Finding or creating customer in GloriaFood and Loyverse:', customerData);
      
      // First, search in GloriaFood
      const gloriaFoodCustomer = await this.searchCustomerByEmailOrPhone(
        customerData.email, 
        customerData.phone
      );
      
      let finalCustomerData = customerData;
      
      if (gloriaFoodCustomer) {
        // Use GloriaFood customer data if found
        finalCustomerData = {
          ...customerData,
          id: gloriaFoodCustomer.id,
          name: gloriaFoodCustomer.name || customerData.name,
          phone: gloriaFoodCustomer.phone || customerData.phone,
          email: gloriaFoodCustomer.email || customerData.email,
          address: gloriaFoodCustomer.address || customerData.address,
          found_in_gloriafood: true
        };
        logger.info('Using customer data from GloriaFood');
      } else {
        logger.info('Customer not found in GloriaFood, using provided data');
      }
      
      // Now create/find in Loyverse
      const LoyverseAPI = require('../utils/loyverseApi');
      const loyverseAPI = new LoyverseAPI();
      
      const loyverseCustomer = await loyverseAPI.findOrCreateCustomer(finalCustomerData);
      
      if (loyverseCustomer) {
        logger.info(`Customer processed successfully in Loyverse: ${loyverseCustomer.name} (ID: ${loyverseCustomer.id})`);
        return {
          ...loyverseCustomer,
          found_in_gloriafood: gloriaFoodCustomer ? true : false,
          gloriafood_id: gloriaFoodCustomer?.id || null
        };
      } else {
        throw new Error('Failed to create customer in Loyverse');
      }
      
    } catch (error) {
      logger.error('Error finding/creating customer:', error.message);
      throw error;
    }
  }

  // Process incoming webhook data
  processWebhookData(webhookData) {
    try {
      logger.info('Processing webhook data from GloriaFood:', {
        orderId: webhookData.order_id || webhookData.id,
        eventType: webhookData.event_type || 'new_order'
      });

      // Validate required fields
      if (!webhookData.order_id && !webhookData.id) {
        throw new Error('Order ID is missing from webhook data');
      }

      if (!webhookData.items || webhookData.items.length === 0) {
        throw new Error('Order items are missing from webhook data');
      }

      // Process and normalize the order data
      const processedOrder = {
        id: webhookData.order_id || webhookData.id,
        timestamp: webhookData.timestamp || new Date().toISOString(),
        eventType: webhookData.event_type || 'new_order',
        status: webhookData.status || 'new',
        orderType: webhookData.order_type || 'delivery', // delivery, pickup, dine_in
        customer: this.processCustomerData(webhookData.customer || webhookData),
        items: this.processOrderItems(webhookData.items || []),
        pricing: this.processPricingData(webhookData),
        notes: webhookData.notes || webhookData.customer_notes || '',
        paymentMethod: webhookData.payment_method || 'unknown',
        source: 'gloriafood',
        rawData: webhookData // Keep original data for reference
      };

      logger.info(`Successfully processed webhook data for order ${processedOrder.id}`);
      return processedOrder;
    } catch (error) {
      logger.error('Failed to process webhook data:', error.message);
      throw error;
    }
  }

  // Process customer data
  processCustomerData(customerData) {
    if (!customerData) return null;

    return {
      name: customerData.name || customerData.customer_name || 'Unknown Customer',
      phone: customerData.phone || customerData.mobile || customerData.phone_number,
      email: customerData.email || customerData.customer_email,
      address: customerData.address || customerData.delivery_address || customerData.shipping_address,
      notes: customerData.notes || customerData.customer_notes || ''
    };
  }

  // Process order items
  processOrderItems(items) {
    if (!Array.isArray(items)) return [];

    return items.map(item => ({
      id: item.id || item.item_id,
      name: item.name || item.item_name,
      quantity: parseInt(item.quantity) || 1,
      unitPrice: parseFloat(item.unit_price) || 0,
      totalPrice: parseFloat(item.total_price) || 0,
      modifiers: item.modifiers || item.options || [],
      notes: item.notes || item.item_notes || '',
      category: item.category || item.item_category,
      sku: item.sku || item.item_sku
    }));
  }

  // Process pricing data
  processPricingData(webhookData) {
    return {
      subtotal: parseFloat(webhookData.subtotal) || 0,
      tax: parseFloat(webhookData.tax) || 0,
      deliveryFee: parseFloat(webhookData.delivery_fee) || 0,
      discount: parseFloat(webhookData.discount) || 0,
      total: parseFloat(webhookData.total) || 0,
      currency: webhookData.currency || 'USD'
    };
  }

  // Validate webhook data
  validateWebhookData(webhookData) {
    const requiredFields = ['order_id', 'items', 'total'];
    const missingFields = requiredFields.filter(field => !webhookData[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }
    
    if (!webhookData.items || webhookData.items.length === 0) {
      throw new Error('Order must contain at least one item');
    }
    
    if (parseFloat(webhookData.total) <= 0) {
      throw new Error('Order total must be greater than 0');
    }
    
    return true;
  }

  // Test API connection
  async testConnection() {
    try {
      logger.info('Testing GloriaFood API connection...');
      
      // Try to get menu items as a connection test
      const menuItems = await this.getMenuItems();
      
      return {
        success: true,
        message: 'GloriaFood API connection successful',
        restaurantToken: this.restaurantToken,
        menuItemCount: menuItems.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('GloriaFood API connection test failed:', error.message);
      
      return {
        success: false,
        message: 'GloriaFood API connection failed',
        error: error.message,
        restaurantToken: this.restaurantToken,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Get API status and configuration
  getStatus() {
    return {
      baseURL: this.baseURL,
      restaurantToken: this.restaurantToken ? 'Configured' : 'Not configured',
      authenticateKey: this.authenticateKey ? 'Configured' : 'Not configured',
      webhookSecret: this.webhookSecret && this.webhookSecret !== 'your_webhook_secret_here' ? 'Configured' : 'Not configured',
      endpoints: this.config.endpoints,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = GloriaFoodService;
