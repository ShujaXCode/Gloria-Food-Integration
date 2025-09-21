const express = require('express');
const router = express.Router();
const GloriaFoodAPI = require('../utils/gloriaFoodApi');
const MongoItemMappingService = require('../services/mongoItemMappingService');
const ReceiptService = require('../services/receiptService');
const logger = require('../utils/logger');

const gloriaFoodAPI = new GloriaFoodAPI();
const itemMappingService = new MongoItemMappingService();
const receiptService = new ReceiptService();

// Webhook endpoint for incoming orders from GloriaFood
router.post('/webhook', async (req, res) => {
  try {
    console.log('=== WEBHOOK RECEIVED ===');
    console.log('Headers:', req.headers);
    console.log('Body received:', JSON.stringify(req.body, null, 2));
    
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

    // Basic webhook data validation
    if (!webhookData || (!webhookData.orders && !webhookData.id)) {
      logger.error('Invalid webhook data: missing orders or id');
      return res.status(400).json({ error: 'Invalid webhook data: missing orders or id' });
    }

    // Process webhook data with item mapping
    try {
      const orderData = webhookData.orders ? webhookData.orders[0] : webhookData;
      
      if (!orderData || !orderData.items) {
        throw new Error('Invalid order data: missing items');
      }

      logger.info(`Processing order ${orderData.id} with ${orderData.items.length} items`);

      // Check order status - only process accepted orders
      if (orderData.status && orderData.status !== 'accepted') {
        logger.info(`Order ${orderData.id} status is '${orderData.status}', skipping receipt creation`);
        return res.status(200).json({
          success: true,
          message: `Order received but status is '${orderData.status}', receipt will be created when order is accepted`,
          orderId: orderData.id,
          status: orderData.status
        });
      }

      // Check if this is a table reservation or order with no items
      // Initialize Loyverse API
      const LoyverseAPI = require('../utils/loyverseApi');
      const loyverseAPI = new LoyverseAPI();

      const isTableReservation = orderData.type === 'table_reservation' || !orderData.items || orderData.items.length === 0;
      
      if (isTableReservation) {
        logger.info(`Processing table reservation or empty order: ${orderData.id}`);

      // For table reservations, we'll just log the customer info and skip receipt creation
      const customer = {
        name: `${orderData.client_first_name || ''} ${orderData.client_last_name || ''}`.trim() || 'Unknown Customer',
        phone: orderData.client_phone,
        email: orderData.client_email,
        address: orderData.client_address
      };
        let customerResult = null;
        
        try {
          customerResult = await loyverseAPI.findOrCreateCustomer(customer);
          logger.info(`Customer processed for table reservation: ${customerResult ? customerResult.id : 'failed'}`);
        } catch (customerError) {
          logger.warn(`Customer processing failed for table reservation: ${customerError.message}`);
        }
        
        return res.status(200).json({
          success: true,
          message: 'Table reservation received and customer processed',
          orderId: orderData.id,
          eventType: 'table_reservation',
          orderType: orderData.type,
          customer: customerResult,
          note: 'No receipt created for table reservation',
          timestamp: new Date().toISOString()
        });
      }

      // Item mapping service is already initialized in constructor
      
      // NEW ROBUST FLOW: Check MongoDB first (source of truth)
      console.log(`Checking MongoDB for existing receipt for order ID: ${orderData.id}`);
      const existingReceipt = await receiptService.findReceiptByOrderId(orderData.id);
      
      if (existingReceipt) {
        console.log(`Found existing receipt in MongoDB for order ${orderData.id} with status: ${existingReceipt.status}`);
        logger.info(`Found existing receipt in MongoDB for order ${orderData.id} with status: ${existingReceipt.status}`);
        
        // Handle existing receipt based on status
        const result = await receiptService.handleExistingReceipt(existingReceipt, orderData, loyverseAPI);
        
        if (result.success) {
          // Duplicate or already processed
          return res.status(200).json(result);
        } else if (result.status === 'retry_needed') {
          // Retry the receipt
          console.log(`Retrying receipt for order ${orderData.id}`);
          const retryResult = await receiptService.createNewReceipt(orderData, loyverseAPI);
          return res.status(200).json(retryResult);
        } else if (result.status === 'treat_as_new') {
          // Treat as new order
          console.log(`Treating order ${orderData.id} as new order`);
        } else {
          // Error handling
          return res.status(500).json({
            success: false,
            message: 'Error handling existing receipt',
            error: result.error,
            orderId: orderData.id
          });
        }
      }
      
      console.log(`No existing receipt found for order ${orderData.id}, creating new receipt...`);
      
      // Map GloriaFood items to Loyverse SKUs
      console.log('=== DEBUGGING ITEM MAPPING ===');
      console.log('Order items:', JSON.stringify(orderData.items, null, 2));
      const mappedItems = await itemMappingService.processGloriaFoodOrderItemsWithAutoCreation(orderData.items, loyverseAPI);
      console.log('Mapped items result:', JSON.stringify(mappedItems, null, 2));
      
      // Log mapping results
      const mappedCount = mappedItems.filter(item => item.status === 'mapped').length;
      const unmappedCount = mappedItems.filter(item => item.status === 'unmapped' || item.status === 'error').length;
      console.log(`Mapping results: ${mappedCount} mapped, ${unmappedCount} unmapped`);
      
      logger.info(`Item mapping results: ${mappedCount} mapped, ${unmappedCount} unmapped`);

      // Check if we have any mapped items to process
      if (mappedCount === 0) {
        logger.warn(`No items could be mapped for order ${orderData.id}`);
        return res.status(200).json({
          success: false,
          message: 'No items could be mapped to Loyverse SKUs',
          orderId: orderData.id,
          mappingResults: {
            totalItems: mappedItems.length,
            mappedItems: 0,
            unmappedItems: unmappedCount,
            unmappedItemsList: mappedItems.filter(item => item.status === 'unmapped' || item.status === 'error').map(item => ({
              gloriaFoodName: item.originalGloriaFoodItem.name,
              error: item.error || 'Unknown error'
            }))
          },
          timestamp: new Date().toISOString()
        });
      }

      // Create processed order with mapped items
      // Always use full name (first_name + last_name) for customer display
      let customerName = `${orderData.client_first_name || ''} ${orderData.client_last_name || ''}`.trim() || 'Unknown Customer';
      
      const processedOrder = {
        id: orderData.id,
        // Include original GloriaFood fields for smart payment detection
        client_first_name: orderData.client_first_name,
        client_last_name: orderData.client_last_name,
        type: orderData.type,
        customer: {
          name: customerName,
          first_name: orderData.client_first_name,
          last_name: orderData.client_last_name,
          phone: orderData.client_phone,
          email: orderData.client_email,
          address: orderData.client_address
        },
        items: mappedItems.filter(item => item.status === 'mapped').map(item => ({
          id: item.originalGloriaFoodItem.id,
          name: item.loyverseName,
          price: item.price,
          quantity: item.originalGloriaFoodItem.quantity,
          instructions: item.originalGloriaFoodItem.instructions || '',
          total_price: item.price * item.originalGloriaFoodItem.quantity,
          sku: item.sku,
          category: item.category,
          matchType: item.matchType
        })),
        total: orderData.total_price,
        subtotal: orderData.sub_total_price,
        tax: orderData.tax_value,
        orderType: orderData.type,
        notes: orderData.instructions || '',
        paymentMethod: orderData.payment || 'CASH',
        timestamp: orderData.accepted_at || orderData.updated_at,
        mappingResults: {
          totalItems: mappedItems.length,
          mappedItems: mappedCount,
          unmappedItems: unmappedCount,
          unmappedItemsList: mappedItems.filter(item => item.status === 'unmapped' || item.status === 'error').map(item => ({
            gloriaFoodName: item.originalGloriaFoodItem.name,
            error: item.error || 'Unknown error'
          }))
        }
      };

      logger.info('Processed order with mapping:', JSON.stringify(processedOrder, null, 2));
      
      // Create new receipt using the robust flow
      console.log('Creating new receipt using robust flow...');
      const result = await receiptService.createNewReceipt(orderData, loyverseAPI);
      
      // Send response to GloriaFood
      console.log('Sending response to GloriaFood...');
      res.status(200).json({
        ...result,
        orderId: orderData.id,
        total: orderData.total,
        items: orderData.items?.length || 0,
        timestamp: new Date().toISOString()
      });
      console.log('Response sent successfully');
      
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

// Debug endpoint to test receipt creation with detailed error logging
router.post('/debug/receipt-creation', async (req, res) => {
  try {
    const LoyverseAPI = require('../utils/loyverseApi');
    const loyverseAPI = new LoyverseAPI();
    
    console.log('Testing receipt creation with detailed logging...');
    
    // Test with a simple order
    const testOrder = {
      id: 999999999,
      client_first_name: "Debug",
      client_last_name: "Test",
      type: "pickup",
      customer: {
        name: "Debug Test",
        first_name: "Debug",
        last_name: "Test",
        phone: "+923001234999",
        email: "debug@test.com"
      },
      items: [
        {
          id: 999999999,
          name: "موهيتو رمان",
          price: 200,
          quantity: 1,
          instructions: "Debug test",
          total_price: 200,
          sku: 10028,
          category: "مشروبات",
          matchType: "exact"
        }
      ],
      total: 200,
      subtotal: 200,
      tax: 0,
      orderType: "pickup",
      notes: "Debug test order",
      paymentMethod: "CASH",
      timestamp: new Date().toISOString()
    };
    
    console.log('Test order data:', JSON.stringify(testOrder, null, 2));
    
    const receipt = await loyverseAPI.createReceipt(testOrder);
    
    res.json({
      success: true,
      message: 'Receipt creation test completed',
      receipt: receipt
    });
  } catch (error) {
    console.error('Receipt creation test failed:', error.message);
    console.error('Full error:', error);
    
    res.status(500).json({
      success: false,
      error: error.message,
      fullError: error.toString(),
      response: error.response?.data || null,
      status: error.response?.status || null
    });
  }
});

// Debug endpoint to test item creation with Arabic text
router.post('/debug/create-item', async (req, res) => {
  try {
    const LoyverseAPI = require('../utils/loyverseApi');
    const ItemMappingService = require('../services/itemMappingService');
    
    const loyverseAPI = new LoyverseAPI();
    const itemMappingService = new ItemMappingService();
    
    console.log('Testing item creation with Arabic text...');
    
    // Use the same SKU generation logic as the main application
    const sku = itemMappingService.generateUniqueSKU();
    
    const testItemData = {
      name: "كبسة ابتاون بالدجاج",
      price: 2500,
      instructions: "Test Arabic item",
      id: sku
    };
    
    console.log('Creating item with data:', JSON.stringify(testItemData, null, 2));
    
    const createdItem = await loyverseAPI.createItem(testItemData);
    
    res.json({
      success: true,
      message: 'Item creation test completed',
      item: createdItem,
      generatedSKU: sku
    });
  } catch (error) {
    console.error('Item creation test failed:', error.message);
    console.error('Full error:', error);
    
    res.status(500).json({
      success: false,
      error: error.message,
      fullError: error.toString(),
      response: error.response?.data || null,
      status: error.response?.status || null
    });
  }
});

// Debug endpoint to check environment variables
router.get('/debug/env', async (req, res) => {
  res.json({
    nodeEnv: process.env.NODE_ENV,
    nodeVersion: process.version,
    loyverseToken: process.env.LOYVERSE_ACCESS_TOKEN ? 'SET' : 'NOT SET',
    loyverseLocation: process.env.LOYVERSE_LOCATION_ID ? 'SET' : 'NOT SET',
    tokenLength: process.env.LOYVERSE_ACCESS_TOKEN ? process.env.LOYVERSE_ACCESS_TOKEN.length : 0,
    locationId: process.env.LOYVERSE_LOCATION_ID || 'NOT SET',
    mongodb: 'CONNECTED',
    itemMappingService: 'MongoDB',
    receiptService: 'MongoDB'
  });
});

// Debug endpoint to test Loyverse API connection
router.get('/debug/loyverse', async (req, res) => {
  try {
    const LoyverseAPI = require('../utils/loyverseApi');
    const loyverseAPI = new LoyverseAPI();
    
    console.log('Testing Loyverse API connection...');
    console.log('Access Token:', process.env.LOYVERSE_ACCESS_TOKEN ? 'SET' : 'NOT SET');
    console.log('Location ID:', process.env.LOYVERSE_LOCATION_ID ? 'SET' : 'NOT SET');
    
    // Test payment types endpoint
    const paymentTypes = await loyverseAPI.getCashPaymentTypeId();
    console.log('Payment types test result:', paymentTypes);
    
    res.json({
      success: true,
      message: 'Loyverse API test completed',
      accessToken: process.env.LOYVERSE_ACCESS_TOKEN ? 'SET' : 'NOT SET',
      locationId: process.env.LOYVERSE_LOCATION_ID ? 'SET' : 'NOT SET',
      paymentTypesResult: paymentTypes
    });
  } catch (error) {
    console.error('Loyverse API test failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      accessToken: process.env.LOYVERSE_ACCESS_TOKEN ? 'SET' : 'NOT SET',
      locationId: process.env.LOYVERSE_LOCATION_ID ? 'SET' : 'NOT SET'
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
  console.log('=== TEST WEBHOOK CALLED ===');
  console.log('Test webhook body:', req.body);
  
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

// Simple webhook test endpoint
router.post('/webhook-test', (req, res) => {
  console.log('=== SIMPLE WEBHOOK TEST ===');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  
  res.json({
    success: true,
    message: 'Webhook test successful',
    received: {
      headers: req.headers,
      body: req.body
    }
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

// Test endpoint for item mapping
router.post('/test-item-mapping', async (req, res) => {
  try {
    const { gloriaFoodItemName, size } = req.body;
    
    if (!gloriaFoodItemName) {
      return res.status(400).json({ error: 'gloriaFoodItemName is required' });
    }

    const mapping = itemMappingService.findSKUByGloriaFoodItem(gloriaFoodItemName, size);
    
    res.json({
      success: true,
      gloriaFoodItemName,
      size,
      mapping,
      stats: itemMappingService.getMappingStats()
    });
    
  } catch (error) {
    logger.error('Error in item mapping test:', error.message);
    res.status(500).json({
      error: 'Item mapping test failed',
      message: error.message
    });
  }
});

// Test endpoint for processing GloriaFood order items
router.post('/test-order-mapping', async (req, res) => {
  try {
    const { items } = req.body;
    
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'items array is required' });
    }

    const mappedItems = itemMappingService.processGloriaFoodOrderItems(items);
    
    res.json({
      success: true,
      originalItems: items,
      mappedItems,
      stats: {
        total: mappedItems.length,
        mapped: mappedItems.filter(item => item.status === 'mapped').length,
        unmapped: mappedItems.filter(item => item.status === 'unmapped').length,
        errors: mappedItems.filter(item => item.status === 'error').length
      }
    });
    
  } catch (error) {
    logger.error('Error in order mapping test:', error.message);
    res.status(500).json({
      error: 'Order mapping test failed',
      message: error.message
    });
  }
});

// Test endpoint for smart payment detection
router.post('/test-payment-detection', async (req, res) => {
  try {
    const { orderData } = req.body;
    
    if (!orderData) {
      return res.status(400).json({ error: 'orderData is required' });
    }

    const LoyverseAPI = require('../utils/loyverseApi');
    const loyverseAPI = new LoyverseAPI();
    
    console.log('=== TESTING SMART PAYMENT DETECTION ===');
    console.log('Order data:', JSON.stringify(orderData, null, 2));
    
    const paymentTypeId = await loyverseAPI.getSmartPaymentTypeId(orderData);
    
    res.json({
      success: true,
      orderData,
      paymentTypeId,
      message: 'Smart payment detection test completed'
    });
    
  } catch (error) {
    logger.error('Error in payment detection test:', error.message);
    res.status(500).json({
      error: 'Payment detection test failed',
      message: error.message
    });
  }
});

// Test endpoint to see receipt creation response
router.post('/test-receipt-creation', async (req, res) => {
  try {
    const orderData = req.body.orders[0];
    
    if (!orderData) {
      return res.status(400).json({ error: 'Order data is required' });
    }
    
    const LoyverseAPI = require('../utils/loyverseApi');
    const loyverseAPI = new LoyverseAPI();
    const ItemMappingService = require('../services/itemMappingService');
    const itemMappingService = new ItemMappingService();
    
    // Process items using the mapping service (same as webhook)
    const mappedItems = await itemMappingService.processGloriaFoodOrderItemsWithAutoCreation(orderData.items, loyverseAPI);
    
    // Process the order (same logic as webhook)
    const processedOrder = {
      id: orderData.id,
      type: orderData.type,
      total: orderData.total_price,
      items: mappedItems.filter(item => item.status === 'mapped').map(item => ({
        id: item.originalGloriaFoodItem.id,
        name: item.loyverseName,
        price: item.price,
        quantity: item.originalGloriaFoodItem.quantity,
        instructions: item.originalGloriaFoodItem.instructions || '',
        total_price: item.price * item.originalGloriaFoodItem.quantity,
        sku: item.sku,
        category: item.category,
        matchType: item.matchType
      })),
      customer: {
        name: `${orderData.client_first_name || ''} ${orderData.client_last_name || ''}`.trim() || 'Unknown Customer',
        phone: orderData.client_phone,
        email: orderData.client_email,
        address: orderData.client_address
      },
      instructions: orderData.instructions,
      orderType: orderData.type,
      client_first_name: orderData.client_first_name,
      client_last_name: orderData.client_last_name,
      client_phone: orderData.client_phone,
      client_email: orderData.client_email,
      client_address: orderData.client_address
    };
    
    // Create receipt and return the full response
    const receipt = await loyverseAPI.createReceipt(processedOrder);
    
    res.json({
      success: true,
      message: 'Receipt created successfully',
      receipt: receipt,
      processedOrder: processedOrder
    });
  } catch (error) {
    console.error('Receipt creation test error:', error);
    res.status(500).json({ 
      error: 'Receipt creation test failed', 
      message: error.message,
      details: error.response?.data || error.message
    });
  }
});

module.exports = router;
