const express = require('express');
const router = express.Router();
const LoyverseAPI = require('../utils/loyverseApi');
const logger = require('../utils/logger');

const loyverseAPI = new LoyverseAPI();

// Create a new receipt in Loyverse
router.post('/receipts', async (req, res) => {
  try {
    const orderData = req.body;
    
    if (!orderData || !orderData.items || orderData.items.length === 0) {
      return res.status(400).json({ error: 'Order data with items is required' });
    }
    
    // Create or find customer if customer data is provided
    let customer = null;
    if (orderData.customer) {
      customer = await loyverseAPI.findOrCreateCustomer(orderData.customer);
    }
    
    // Add customer ID to order data if found/created
    if (customer) {
      orderData.customer_id = customer.id;
    }
    
    // Create receipt in Loyverse
    const receipt = await loyverseAPI.createReceipt(orderData);
    
    logger.info(`Receipt created successfully in Loyverse: ${receipt.id}`);
    
    res.status(201).json({
      success: true,
      message: 'Receipt created successfully',
      data: receipt
    });
    
  } catch (error) {
    logger.error('Error creating receipt in Loyverse:', error.message);
    
    res.status(500).json({
      error: 'Failed to create receipt',
      message: error.message
    });
  }
});

// Get all products from Loyverse
router.get('/products', async (req, res) => {
  try {
    const products = await loyverseAPI.getProducts();
    
    res.json({
      success: true,
      count: products.length,
      data: products
    });
    
  } catch (error) {
    logger.error('Error retrieving products from Loyverse:', error.message);
    
    res.status(500).json({
      error: 'Failed to retrieve products',
      message: error.message
    });
  }
});

// Get all locations from Loyverse
router.get('/locations', async (req, res) => {
  try {
    const locations = await loyverseAPI.getLocations();
    
    res.json({
      success: true,
      count: locations.length,
      data: locations
    });
    
  } catch (error) {
    logger.error('Error retrieving locations from Loyverse:', error.message);
    
    res.status(500).json({
      error: 'Failed to retrieve locations',
      message: error.message
    });
  }
});

// Create a new customer in Loyverse
router.post('/customers', async (req, res) => {
  try {
    const customerData = req.body;
    
    if (!customerData.name || !customerData.phone) {
      return res.status(400).json({ 
        error: 'Customer name and phone are required' 
      });
    }
    
    const customer = await loyverseAPI.createCustomer(customerData);
    
    logger.info(`Customer created successfully in Loyverse: ${customer.id}`);
    
    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: customer
    });
    
  } catch (error) {
    logger.error('Error creating customer in Loyverse:', error.message);
    
    res.status(500).json({
      error: 'Failed to create customer',
      message: error.message
    });
  }
});

// Find customer by phone number
router.get('/customers/search', async (req, res) => {
  try {
    const { phone } = req.query;
    
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    
    const customer = await loyverseAPI.findCustomerByPhone(phone);
    
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    res.json({
      success: true,
      data: customer
    });
    
  } catch (error) {
    logger.error('Error searching for customer:', error.message);
    
    res.status(500).json({
      error: 'Failed to search for customer',
      message: error.message
    });
  }
});

// Update receipt status
router.patch('/receipts/:receiptId/status', async (req, res) => {
  try {
    const { receiptId } = req.params;
    const { status } = req.body;
    
    if (!receiptId || !status) {
      return res.status(400).json({ 
        error: 'Receipt ID and status are required' 
      });
    }
    
    const receipt = await loyverseAPI.updateReceiptStatus(receiptId, status);
    
    logger.info(`Receipt ${receiptId} status updated to ${status}`);
    
    res.json({
      success: true,
      message: 'Receipt status updated successfully',
      data: receipt
    });
    
  } catch (error) {
    logger.error(`Error updating receipt ${req.params.receiptId} status:`, error.message);
    
    res.status(500).json({
      error: 'Failed to update receipt status',
      message: error.message
    });
  }
});

// Test connection to Loyverse
router.get('/test-connection', async (req, res) => {
  try {
    // Try to get locations to test the connection
    const locations = await loyverseAPI.getLocations();
    
    res.json({
      success: true,
      message: 'Connection to Loyverse successful',
      locationCount: locations.length,
      configuredLocationId: process.env.LOYVERSE_LOCATION_ID
    });
    
  } catch (error) {
    logger.error('Loyverse connection test failed:', error.message);
    
    res.status(500).json({
      success: false,
      error: 'Connection to Loyverse failed',
      message: error.message
    });
  }
});

module.exports = router;
