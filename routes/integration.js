const express = require('express');
const router = express.Router();
const LoyverseAPI = require('../utils/loyverseApi');
const ReceiptService = require('../services/receiptService');
const logger = require('../utils/logger');
const integrationService = require('../services/enhancedIntegrationService'); // Added this import

const loyverseAPI = new LoyverseAPI();
const receiptService = new ReceiptService();

// In-memory storage for order processing status (in production, use a database)
const orderProcessingStatus = new Map();

// Process order from GloriaFood to Loyverse
router.post('/process-order', async (req, res) => {
  try {
    const orderData = req.body;
    
    if (!orderData || !orderData.id) {
      return res.status(400).json({ error: 'Valid order data is required' });
    }
    
    // Check if order is already being processed
    if (orderProcessingStatus.has(orderData.id)) {
      return res.status(409).json({ 
        error: 'Order is already being processed',
        status: orderProcessingStatus.get(orderData.id)
      });
    }
    
    // Mark order as processing
    orderProcessingStatus.set(orderData.id, 'processing');
    
    try {
      // Create or find customer in Loyverse
      let customer = null;
      if (orderData.customer) {
        customer = await loyverseAPI.findOrCreateCustomer(orderData.customer);
        if (customer) {
          orderData.customer_id = customer.id;
        }
      }
      
      // Check for existing receipt first
      const existingReceipt = await receiptService.findReceiptByOrderId(orderData.id);
      
      if (existingReceipt) {
        // Handle existing receipt
        const result = await receiptService.handleExistingReceipt(existingReceipt, orderData, loyverseAPI);
        
        if (result.success) {
          // Duplicate or already processed
          orderProcessingStatus.set(orderData.id, 'completed');
          return res.json({
            success: true,
            message: result.message,
            data: {
              orderId: orderData.id,
              loyverseReceiptId: result.receiptNumber,
              mongoReceiptId: result.mongoReceiptId,
              customerId: customer?.id,
              status: 'duplicate'
            }
          });
        } else if (result.status === 'retry_needed') {
          // Retry the receipt
          const retryResult = await receiptService.createNewReceipt(orderData, loyverseAPI);
          orderProcessingStatus.set(orderData.id, 'completed');
          return res.json({
            success: true,
            message: 'Order processed successfully (retry)',
            data: {
              orderId: orderData.id,
              loyverseReceiptId: retryResult.loyverseReceiptId,
              mongoReceiptId: retryResult.mongoReceiptId,
              customerId: customer?.id,
              status: 'retry'
            }
          });
        }
      }
      
      // Create new receipt using robust flow
      const result = await receiptService.createNewReceipt(orderData, loyverseAPI);
      
      // Mark order as completed
      orderProcessingStatus.set(orderData.id, 'completed');
      
      logger.info(`Order ${orderData.id} processed successfully. Loyverse Receipt ID: ${result.loyverseReceiptId}, MongoDB Receipt ID: ${result.mongoReceiptId}`);
      
      res.json({
        success: true,
        message: 'Order processed successfully and saved to MongoDB',
        data: {
          orderId: orderData.id,
          loyverseReceiptId: result.loyverseReceiptId,
          mongoReceiptId: result.mongoReceiptId,
          customerId: customer?.id,
          status: 'completed'
        }
      });
      
    } catch (processingError) {
      // Mark order as failed
      orderProcessingStatus.set(orderData.id, 'failed');
      
      // Save failed receipt to MongoDB
      try {
        await receiptService.processGloriaFoodOrder(orderData, null);
        await receiptService.markReceiptAsFailed(orderData.id, processingError.message);
        logger.info(`Failed receipt saved to MongoDB for order ${orderData.id}`);
      } catch (dbError) {
        logger.error(`Failed to save failed receipt to MongoDB for order ${orderData.id}:`, dbError.message);
      }
      
      logger.error(`Failed to process order ${orderData.id}:`, processingError.message);
      
      res.status(500).json({
        error: 'Order processing failed',
        message: processingError.message,
        orderId: orderData.id,
        status: 'failed'
      });
    }
    
  } catch (error) {
    logger.error('Error in process-order endpoint:', error.message);
    
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get order processing status
router.get('/order-status/:orderId', (req, res) => {
  const { orderId } = req.params;
  
  if (!orderId) {
    return res.status(400).json({ error: 'Order ID is required' });
  }
  
  const status = orderProcessingStatus.get(orderId) || 'not_found';
  
  res.json({
    success: true,
    data: {
      orderId,
      status,
      timestamp: new Date().toISOString()
    }
  });
});

// Get receipt by order ID from MongoDB
router.get('/receipt/:orderId', async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const receipt = await receiptService.findReceiptByOrderId(orderId);
    
    if (!receipt) {
      return res.status(404).json({
        error: 'Receipt not found',
        orderId: orderId
      });
    }
    
    res.json({
      success: true,
      data: receipt
    });
    
  } catch (error) {
    logger.error('Error getting receipt:', error.message);
    res.status(500).json({
      error: 'Failed to get receipt',
      message: error.message
    });
  }
});

// Get receipt statistics from MongoDB
router.get('/receipt-stats', async (req, res) => {
  try {
    const stats = await receiptService.getReceiptStats();
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    logger.error('Error getting receipt stats:', error.message);
    res.status(500).json({
      error: 'Failed to get receipt stats',
      message: error.message
    });
  }
});

// Get recent receipts from MongoDB
router.get('/recent-receipts', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const receipts = await receiptService.getRecentReceipts(limit);
    
    res.json({
      success: true,
      data: receipts,
      count: receipts.length
    });
    
  } catch (error) {
    logger.error('Error getting recent receipts:', error.message);
    res.status(500).json({
      error: 'Failed to get recent receipts',
      message: error.message
    });
  }
});

// Test endpoint for debugging GloriaFood to Loyverse integration
// Endpoint to create Loyverse receipt from GloriaFood order
router.post('/create-loyverse-receipt', async (req, res) => {
  try {
    const gloriaFoodPayload = req.body;
    logger.info('Creating Loyverse receipt from GloriaFood order:', JSON.stringify(gloriaFoodPayload, null, 2));

    // Extract order data from GloriaFood format
    const orderData = gloriaFoodPayload.orders ? gloriaFoodPayload.orders[0] : gloriaFoodPayload;

    if (!orderData || !orderData.id) {
      return res.status(400).json({ error: 'Valid GloriaFood order data is required' });
    }

    logger.info(`Processing order ${orderData.id} to create receipt in Loyverse`);

    // Transform GloriaFood data to our format
    const transformedOrder = {
      id: orderData.id,
      customer: {
        name: `${orderData.client_first_name || ''} ${orderData.client_last_name || ''}`.trim() || 'Unknown Customer',
        phone: orderData.client_phone,
        email: orderData.client_email,
        address: orderData.client_address
      },
      items: orderData.items.map(item => ({
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        instructions: item.instructions || '',
        total_price: item.total_item_price
      })),
      total: orderData.total_price,
      subtotal: orderData.sub_total_price,
      tax: orderData.tax_value,
      orderType: orderData.type,
      notes: orderData.instructions || '',
      paymentMethod: orderData.payment || 'CASH',
      timestamp: orderData.accepted_at || orderData.updated_at
    };

    logger.info('Transformed order data:', JSON.stringify(transformedOrder, null, 2));

    // Create receipt in Loyverse
    const receipt = await loyverseAPI.createReceipt(transformedOrder);
    
    res.json({
      success: true,
      message: 'Receipt created successfully in Loyverse',
      data: {
        orderId: orderData.id,
        receiptId: receipt.id,
        total: transformedOrder.total,
        items: transformedOrder.items.length,
        receipt: receipt
      }
    });

  } catch (error) {
    logger.error('Error creating Loyverse receipt:', error.message);
    console.error('=== ROUTE ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    console.error('==================');
    
    res.status(500).json({
      error: 'Failed to create receipt',
      message: error.message,
      details: error.response?.data || null
    });
  }
});

// Endpoint to create Loyverse items from GloriaFood order
router.post('/create-loyverse-items', async (req, res) => {
  try {
    const gloriaFoodPayload = req.body;
    logger.info('Creating Loyverse items from GloriaFood order:', JSON.stringify(gloriaFoodPayload, null, 2));

    // Extract order data from GloriaFood format
    const orderData = gloriaFoodPayload.orders ? gloriaFoodPayload.orders[0] : gloriaFoodPayload;

    if (!orderData || !orderData.id) {
      return res.status(400).json({ error: 'Valid GloriaFood order data is required' });
    }

    logger.info(`Processing order ${orderData.id} to create items in Loyverse`);

    // Transform GloriaFood data to our format
    const transformedOrder = {
      id: orderData.id,
      items: orderData.items.map(item => ({
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        instructions: item.instructions || '',
        total_price: item.total_item_price
      }))
    };

    logger.info('Transformed order data:', JSON.stringify(transformedOrder, null, 2));

    // Create items in Loyverse
    const itemsWithIds = await loyverseAPI.createOrderItems(transformedOrder);
    
    // Count created vs existing items
    const createdItems = itemsWithIds.filter(item => item.loyverse_item_id);
    const existingItems = itemsWithIds.filter(item => !item.loyverse_item_id);

    res.json({
      success: true,
      message: 'Items processed successfully',
      data: {
        orderId: orderData.id,
        totalItems: itemsWithIds.length,
        createdItems: createdItems.length,
        existingItems: existingItems.length,
        items: itemsWithIds.map(item => ({
          name: item.name,
          price: item.price,
          loyverseItemId: item.loyverse_item_id,
          status: item.loyverse_item_id ? 'created/found' : 'failed'
        }))
      }
    });

  } catch (error) {
    logger.error('Error creating Loyverse items:', error.message);
    res.status(500).json({
      error: 'Failed to create items',
      message: error.message
    });
  }
});

// Test endpoint to create a single item in Loyverse
router.post('/test-create-item', async (req, res) => {
  try {
    const { itemName, itemPrice } = req.body;
    
    if (!itemName || !itemPrice) {
      return res.status(400).json({ error: 'itemName and itemPrice are required' });
    }

    logger.info(`Testing item creation: ${itemName} at $${itemPrice}`);

    // Create minimal Loyverse item payload as per API docs
    const loyverseItemPayload = {
      item_name: itemName,
      description: `Test item: ${itemName}`,
      category_id: null,
      track_stock: false,
      sold_by_weight: false,
      is_composite: false,
      use_production: false,
      primary_supplier_id: null,
      tax_ids: [],
      modifiers_ids: [],
      form: "SQUARE",
      color: "GREY",
      variants: [
        {
          sku: `TEST_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          cost: parseFloat((parseFloat(itemPrice) * 0.6).toFixed(2)),
          default_pricing_type: "FIXED",
          default_price: parseFloat(itemPrice)
        }
      ]
    };

    logger.info('Loyverse item payload:', JSON.stringify(loyverseItemPayload, null, 2));

    // Make direct API call to Loyverse
    const axios = require('axios');
    const response = await axios.post('https://api.loyverse.com/v1.0/items', loyverseItemPayload, {
      headers: {
        'Authorization': `Bearer ${process.env.LOYVERSE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    res.json({
      success: true,
      message: 'Item created successfully',
      item: response.data
    });

  } catch (error) {
    logger.error('Error in item creation test:', error.message);
    
    if (error.response) {
      logger.error('Loyverse API Error:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
    
    res.status(500).json({
      error: 'Item creation failed',
      message: error.message,
      details: error.response?.data || 'No response details'
    });
  }
});

router.post('/test-gloriafood-to-loyverse', async (req, res) => {
  try {
    const gloriaFoodPayload = req.body;
    logger.info('Test endpoint called with GloriaFood payload:', JSON.stringify(gloriaFoodPayload, null, 2));
    
    // Extract order data from GloriaFood format
    const orderData = gloriaFoodPayload.orders ? gloriaFoodPayload.orders[0] : gloriaFoodPayload;
    
    if (!orderData || !orderData.id) {
      return res.status(400).json({ error: 'Valid GloriaFood order data is required' });
    }
    
    logger.info(`Processing test order ${orderData.id} to Loyverse`);
    
    // Transform GloriaFood data to Loyverse format
    console.log(orderData ,'orderData fucking orderData++=')
    const transformedOrder = {
      id: orderData.id,
      customer: {
        name: `${orderData.client_first_name || ''} ${orderData.client_last_name || ''}`.trim() || 'Unknown Customer',
        phone: orderData.client_phone,
        email: orderData.client_email,
        address: orderData.client_address
      },
      items: orderData.items.map(item => ({
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        instructions: item.instructions || '',
        total_price: item.total_item_price
      })),
      total: orderData.total_price,
      subtotal: orderData.sub_total_price,
      tax: orderData.tax_value,
      orderType: orderData.type,
      notes: orderData.instructions || '',
      paymentMethod: orderData.payment || 'CASH',
      timestamp: orderData.accepted_at || orderData.updated_at
    };
    
    logger.info('Transformed order data:', JSON.stringify(transformedOrder, null, 2));
    
    // Process the transformed order using LoyverseAPI directly
    let customer = null;
    let receipt = null;
    
              try {
            // Step 1: Create items in Loyverse first
            logger.info('Creating items in Loyverse...');
            const itemsWithIds = await loyverseAPI.createOrderItems(transformedOrder);
            logger.info('Items created/found:', itemsWithIds);

            // Step 2: Create or find customer
            logger.info('Creating/finding customer in Loyverse...');
            customer = await loyverseAPI.findOrCreateCustomer(transformedOrder.customer);
            logger.info('Customer result:', customer);

            // Step 3: Create receipt (only if customer was created successfully)
            if (customer) {
              logger.info('Creating receipt in Loyverse...');
              // Update order with items that have Loyverse IDs
              const orderWithItemIds = {
                ...transformedOrder,
                items: itemsWithIds
              };
              receipt = await loyverseAPI.createReceipt(orderWithItemIds);
              logger.info('Receipt result:', receipt);
            } else {
              logger.warn('Customer creation failed, skipping receipt creation');
            }
      
    } catch (error) {
      logger.error('Error in Loyverse operations:', error.message);
      throw error;
    }
    
    const result = {
      customer: customer,
      receipt: receipt,
      success: customer && receipt
    };
    
    res.json({
      success: true,
      message: 'Test order processed',
      data: {
        originalOrder: orderData.id,
        transformedOrder: transformedOrder,
        result: result,
        debug: {
          customerCreationAttempted: true,
          receiptCreationAttempted: !!customer,
          customerError: customer ? null : 'Customer creation failed',
          receiptError: receipt ? null : 'Receipt creation failed'
        }
      }
    });
    
  } catch (error) {
    logger.error('Error in test endpoint:', error.message);
    
    res.status(500).json({
      error: 'Test failed',
      message: error.message,
      stack: error.stack
    });
  }
});

// Retry failed order
router.post('/retry-order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }
    
    const currentStatus = orderProcessingStatus.get(orderId);
    
    if (currentStatus !== 'failed') {
      return res.status(400).json({ 
        error: 'Order is not in failed status',
        currentStatus 
      });
    }
    
    // Reset status to allow retry
    orderProcessingStatus.delete(orderId);
    
    res.json({
      success: true,
      message: 'Order marked for retry. Please submit the order again.',
      orderId
    });
    
  } catch (error) {
    logger.error(`Error retrying order ${req.params.orderId}:`, error.message);
    
    res.status(500).json({
      error: 'Failed to retry order',
      message: error.message
    });
  }
});

// Manual order sync (for testing or manual processing)
router.post('/manual-sync', async (req, res) => {
  try {
    const { gloriaFoodOrderId } = req.body;
    
    if (!gloriaFoodOrderId) {
      return res.status(400).json({ error: 'GloriaFood order ID is required' });
    }
    
    // This would typically fetch the order from GloriaFood first
    // For now, we'll assume the order data is provided in the request body
    const orderData = req.body.orderData;
    
    if (!orderData) {
      return res.status(400).json({ error: 'Order data is required for manual sync' });
    }
    
    // Process the order
    const result = await processOrderToLoyverse(orderData);
    
    res.json({
      success: true,
      message: 'Manual sync completed',
      data: result
    });
    
  } catch (error) {
    logger.error('Error in manual sync:', error.message);
    
    res.status(500).json({
      error: 'Manual sync failed',
      message: error.message
    });
  }
});

// Sync menu items between GloriaFood and Loyverse
router.post('/sync-menu', async (req, res) => {
  try {
    logger.info('Starting menu synchronization between GloriaFood and Loyverse');
    
    // Get menu items from GloriaFood
    const gloriaFoodAPI = require('../utils/gloriaFoodApi');
    const gloriaFood = new gloriaFoodAPI();
    
    const gloriaFoodMenu = await gloriaFood.getMenuItems();
    
    if (!gloriaFoodMenu || !gloriaFoodMenu.length) {
      return res.status(400).json({ 
        error: 'No menu items found in GloriaFood' 
      });
    }
    
    // Map menu items to Loyverse products
    const mappedItems = await integrationService.mapMenuItems(gloriaFoodMenu);
    
    // Get mapping statistics
    const totalItems = mappedItems.length;
    const mappedCount = mappedItems.filter(item => item.mapped).length;
    const unmappedCount = totalItems - mappedCount;
    
    logger.info(`Menu sync completed: ${mappedCount}/${totalItems} items mapped`);
    
    res.json({
      success: true,
      message: 'Menu synchronization completed',
      data: {
        totalItems,
        mappedCount,
        unmappedCount,
        mappedItems: mappedItems.filter(item => item.mapped),
        unmappedItems: mappedItems.filter(item => !item.mapped)
      }
    });
    
  } catch (error) {
    logger.error('Error in menu synchronization:', error.message);
    
    res.status(500).json({
      error: 'Menu synchronization failed',
      message: error.message
    });
  }
});

// Get menu mapping status
router.get('/menu-mapping', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    // Get recent menu items and their mapping status
    const gloriaFoodAPI = require('../utils/gloriaFoodApi');
    const gloriaFood = new gloriaFoodAPI();
    
    const gloriaFoodMenu = await gloriaFood.getMenuItems();
    const mappedItems = await integrationService.mapMenuItems(gloriaFoodMenu);
    
    // Limit results
    const limitedItems = mappedItems.slice(0, parseInt(limit));
    
    res.json({
      success: true,
      count: limitedItems.length,
      totalItems: mappedItems.length,
      mappingStats: {
        mapped: mappedItems.filter(item => item.mapped).length,
        unmapped: mappedItems.filter(item => !item.mapped).length,
        mappingRate: Math.round((mappedItems.filter(item => item.mapped).length / mappedItems.length) * 100)
      },
      data: limitedItems
    });
    
  } catch (error) {
    logger.error('Error getting menu mapping status:', error.message);
    
    res.status(500).json({
      error: 'Failed to get menu mapping status',
      message: error.message
    });
  }
});

// Get all order processing statuses
router.get('/all-orders-status', (req, res) => {
  const orders = Array.from(orderProcessingStatus.entries()).map(([orderId, status]) => ({
    orderId,
    status,
    timestamp: new Date().toISOString()
  }));
  
  res.json({
    success: true,
    count: orders.length,
    data: orders
  });
});

// Clear completed orders from memory (for cleanup)
router.delete('/clear-completed-orders', (req, res) => {
  let clearedCount = 0;
  
  for (const [orderId, status] of orderProcessingStatus.entries()) {
    if (status === 'completed') {
      orderProcessingStatus.delete(orderId);
      clearedCount++;
    }
  }
  
  res.json({
    success: true,
    message: `Cleared ${clearedCount} completed orders from memory`,
    clearedCount
  });
});

// Bulk create menu items in Loyverse from JSON data
router.post('/create-menu-items', async (req, res) => {
  try {
    const menuItems = req.body;
    
    if (!Array.isArray(menuItems)) {
      return res.status(400).json({ 
        error: 'Request body must be an array of menu items' 
      });
    }
    
    if (menuItems.length === 0) {
      return res.status(400).json({ 
        error: 'No menu items provided' 
      });
    }
    
    logger.info(`Starting bulk creation of ${menuItems.length} menu items in Loyverse`);
    
    const results = {
      total: menuItems.length,
      created: 0,
      existing: 0,
      failed: 0,
      items: []
    };
    
    // Process each menu item
    for (const item of menuItems) {
      try {
        // Validate required fields
        if (!item.name || !item.price || !item.sku) {
          results.failed++;
          results.items.push({
            name: item.name || 'Unknown',
            sku: item.sku || 'N/A',
            status: 'failed',
            error: 'Missing required fields (name, price, sku)'
          });
          continue;
        }
        
        // Check if item already exists by name
        const existingItem = await loyverseAPI.findItemByName(item.name);
        
        if (existingItem) {
          results.existing++;
          results.items.push({
            name: item.name,
            sku: item.sku,
            loyverseId: existingItem.id,
            status: 'existing',
            message: 'Item already exists in Loyverse'
          });
          logger.info(`Item already exists: ${item.name} (ID: ${existingItem.id})`);
        } else {
          // Create new item
          const itemData = {
            name: item.name,
            price: parseFloat(item.price),
            id: item.sku, // Use SKU as ID for tracking
            instructions: item.category || '', // Use category as description
            category: item.category || 'General'
          };
          
          const newItem = await loyverseAPI.createItem(itemData);
          
          results.created++;
          results.items.push({
            name: item.name,
            sku: item.sku,
            loyverseId: newItem.id,
            status: 'created',
            message: 'Successfully created in Loyverse'
          });
          
          logger.info(`Created new item: ${item.name} (ID: ${newItem.id})`);
        }
        
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        results.failed++;
        results.items.push({
          name: item.name || 'Unknown',
          sku: item.sku || 'N/A',
          status: 'failed',
          error: error.message
        });
        
        logger.error(`Failed to process item ${item.name}:`, error.message);
      }
    }
    
    logger.info(`Menu creation completed: ${results.created} created, ${results.existing} existing, ${results.failed} failed`);
    
    res.json({
      success: true,
      message: `Menu creation completed: ${results.created} created, ${results.existing} existing, ${results.failed} failed`,
      data: results
    });
    
  } catch (error) {
    logger.error('Error in bulk menu creation:', error.message);
    
    res.status(500).json({
      error: 'Menu creation failed',
      message: error.message
    });
  }
});

// Helper function to process order to Loyverse
async function processOrderToLoyverse(orderData) {
  try {
    // Create or find customer
    let customer = null;
    if (orderData.customer) {
      customer = await loyverseAPI.findOrCreateCustomer(orderData.customer);
      if (customer) {
        orderData.customer_id = customer.id;
      }
    }
    
    // Create receipt
    const receipt = await loyverseAPI.createReceipt(orderData);
    
    return {
      orderId: orderData.id,
      receiptId: receipt.id,
      customerId: customer?.id,
      status: 'completed'
    };
    
  } catch (error) {
    logger.error(`Failed to process order ${orderData.id} to Loyverse:`, error.message);
    throw error;
  }
}

module.exports = router;
