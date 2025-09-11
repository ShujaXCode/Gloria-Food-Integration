const express = require('express');
const router = express.Router();
const GloriaFoodAPI = require('../utils/gloriaFoodApi');
const logger = require('../utils/logger');

const gloriaFoodAPI = new GloriaFoodAPI();

// Webhook endpoint for incoming orders from GloriaFood
router.post('/webhook', async (req, res) => {
  try {
    const webhookData = req.body;
    const signature = req.headers['x-gloriafood-signature'] || req.headers['authorization'];
    
    logger.info('Received webhook from GloriaFood:', {
      orderId: webhookData.order_id || webhookData.id,
      eventType: webhookData.event_type || 'new_order',
      timestamp: new Date().toISOString()
    });
    
    // Log the full webhook data for debugging
    logger.info('Full webhook data:', JSON.stringify(webhookData, null, 2));

    // Verify webhook signature if configured
    // Temporarily disabled for testing - re-enable in production
    /*
    if (!gloriaFoodAPI.verifyWebhookSignature(webhookData, signature)) {
      logger.warn('Invalid webhook signature received');
      return res.status(401).json({ error: 'Invalid signature' });
    }
    */

    // Validate webhook data
    try {
      gloriaFoodAPI.validateWebhookData(webhookData);
    } catch (validationError) {
      logger.error('Webhook validation failed:', validationError.message);
      return res.status(400).json({ error: validationError.message });
    }

    // Create receipt in Loyverse using the same logic as the API endpoint
    try {
      const processedOrder = gloriaFoodAPI.processWebhookData(webhookData);
      
      // Create receipt in Loyverse
      const LoyverseAPI = require('../utils/loyverseApi');
      const loyverseAPI = new LoyverseAPI();
      const receipt = await loyverseAPI.createReceipt(processedOrder);
      
      res.status(200).json({
        success: true,
        message: 'Order received and receipt created in Loyverse',
        orderId: processedOrder.id,
        eventType: 'new_order',
        receiptId: receipt.id,
        total: processedOrder.total,
        items: processedOrder.items.length,
        receipt: receipt
      });
      
    } catch (error) {
      logger.error('Error processing webhook:', error.message);
      res.status(500).json({
        error: 'Failed to process webhook',
        message: error.message
      });
    }
  } catch (error) {
    logger.error('Error processing GloriaFood webhook:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get order details from GloriaFood
router.get('/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }
    
    const order = await gloriaFoodAPI.getOrder(orderId);
    
    res.json({
      success: true,
      data: order
    });
    
  } catch (error) {
    logger.error(`Error retrieving order ${req.params.orderId}:`, error.message);
    
    if (error.response?.status === 404) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.status(500).json({
      error: 'Failed to retrieve order',
      message: error.message
    });
  }
});

// Get menu items from GloriaFood
router.get('/menu', async (req, res) => {
  try {
    const menuItems = await gloriaFoodAPI.getMenuItems();
    
    res.json({
      success: true,
      data: menuItems
    });
    
  } catch (error) {
    logger.error('Error retrieving menu items:', error.message);
    
    res.status(500).json({
      error: 'Failed to retrieve menu items',
      message: error.message
    });
  }
});

// Test webhook endpoint
router.post('/test-webhook', (req, res) => {
  const testData = {
    order_id: 'TEST-123',
    customer: {
      name: 'Test Customer',
      phone: '+1234567890',
      email: 'test@example.com',
      address: '123 Test St, Test City'
    },
    items: [
      {
        name: 'Test Item',
        quantity: 1,
        unit_price: 10.00,
        total_price: 10.00
      }
    ],
    subtotal: 10.00,
    tax: 1.00,
    total: 11.00,
    order_type: 'delivery',
    notes: 'Test order from GloriaFood'
  };
  
  // Emit test event
  req.app.emit('newOrder', testData);
  
  res.json({
    success: true,
    message: 'Test webhook sent',
    data: testData
  });
});

// Get all customers from GloriaFood
router.get('/customers', async (req, res) => {
  try {
    logger.info('Fetching customers from GloriaFood');
    const customers = await gloriaFoodAPI.getCustomers();
    
    res.json({
      success: true,
      message: `Retrieved ${customers.length} customers from GloriaFood`,
      count: customers.length,
      customers: customers
    });
  } catch (error) {
    logger.error('Failed to fetch customers from GloriaFood:', error.message);
    res.status(500).json({
      error: 'Failed to fetch customers',
      message: error.message
    });
  }
});

// Get specific customer by ID from GloriaFood
router.get('/customers/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    logger.info(`Fetching customer ${customerId} from GloriaFood`);
    
    const customer = await gloriaFoodAPI.getCustomer(customerId);
    
    res.json({
      success: true,
      message: `Retrieved customer ${customerId} from GloriaFood`,
      customer: customer
    });
  } catch (error) {
    logger.error(`Failed to fetch customer ${req.params.customerId} from GloriaFood:`, error.message);
    res.status(500).json({
      error: 'Failed to fetch customer',
      message: error.message
    });
  }
});

// Get customer orders from GloriaFood
router.get('/customers/:customerId/orders', async (req, res) => {
  try {
    const { customerId } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    
    logger.info(`Fetching orders for customer ${customerId} from GloriaFood`);
    
    const orders = await gloriaFoodAPI.getCustomerOrders(customerId, limit);
    
    res.json({
      success: true,
      message: `Retrieved ${orders.length} orders for customer ${customerId} from GloriaFood`,
      count: orders.length,
      customerId: customerId,
      orders: orders
    });
  } catch (error) {
    logger.error(`Failed to fetch orders for customer ${req.params.customerId} from GloriaFood:`, error.message);
    res.status(500).json({
      error: 'Failed to fetch customer orders',
      message: error.message
    });
  }
});

// Search customer by email or phone and create in Loyverse if not found
router.post('/customers/search-and-create', async (req, res) => {
  try {
    const { email, phone, name, address } = req.body;
    
    if (!email && !phone) {
      return res.status(400).json({
        error: 'Email or phone number is required'
      });
    }
    
    logger.info(`Searching customer by email: ${email} or phone: ${phone}`);
    
    const customerData = {
      name: name || 'Unknown Customer',
      email: email,
      phone: phone,
      address: address
    };
    
    const result = await gloriaFoodAPI.findOrCreateCustomerInGloriaFoodAndLoyverse(customerData);
    
    res.json({
      success: true,
      message: 'Customer search and creation completed',
      customer: result,
      found_in_gloriafood: result.found_in_gloriafood,
      created_in_loyverse: true
    });
  } catch (error) {
    logger.error('Failed to search and create customer:', error.message);
    res.status(500).json({
      error: 'Failed to search and create customer',
      message: error.message
    });
  }
});

module.exports = router;
