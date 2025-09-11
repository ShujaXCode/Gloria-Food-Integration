const GloriaFoodService = require('./gloriaFoodService');
const LoyverseAPI = require('../utils/loyverseApi');
const config = require('../config/apiConfig');
const logger = require('../utils/logger');

class EnhancedIntegrationService {
  constructor() {
    this.gloriaFoodService = new GloriaFoodService();
    this.loyverseAPI = new LoyverseAPI();
    this.config = config.integration;
    
    // Order processing queue
    this.processingQueue = new Map();
    this.completedOrders = new Map();
    this.failedOrders = new Map();
    
    // Statistics
    this.stats = {
      totalOrders: 0,
      successfulOrders: 0,
      failedOrders: 0,
      processingOrders: 0,
      startTime: new Date()
    };
    
    logger.info('Enhanced Integration Service initialized');
  }

  // Main method to process incoming orders
  async processOrder(orderData) {
    const orderId = orderData.id;
    
    try {
      logger.info(`Starting to process order ${orderId}`);
      
      // Check if order is already being processed
      if (this.processingQueue.has(orderId)) {
        logger.warn(`Order ${orderId} is already being processed`);
        return {
          success: false,
          error: 'Order already being processed',
          orderId
        };
      }
      
      // Mark order as processing
      this.processingQueue.set(orderId, {
        status: 'processing',
        startTime: new Date(),
        attempts: 0,
        data: orderData
      });
      
      this.stats.processingOrders++;
      this.stats.totalOrders++;
      
      // Process the order
      const result = await this.processOrderToLoyverse(orderData);
      
      // Mark as completed
      this.processingQueue.delete(orderId);
      this.completedOrders.set(orderId, {
        status: 'completed',
        startTime: new Date(),
        completedTime: new Date(),
        result,
        data: orderData
      });
      
      this.stats.processingOrders--;
      this.stats.successfulOrders++;
      
      logger.info(`Order ${orderId} processed successfully`, result);
      
      return {
        success: true,
        orderId,
        result
      };
      
    } catch (error) {
      logger.error(`Failed to process order ${orderId}:`, error.message);
      
      // Mark as failed
      this.processingQueue.delete(orderId);
      this.failedOrders.set(orderId, {
        status: 'failed',
        startTime: new Date(),
        error: error.message,
        attempts: (this.processingQueue.get(orderId)?.attempts || 0) + 1,
        data: orderData
      });
      
      this.stats.processingOrders--;
      this.stats.failedOrders++;
      
      // Attempt retry if configured
      if (this.shouldRetry(orderId)) {
        this.scheduleRetry(orderId, orderData);
      }
      
      return {
        success: false,
        error: error.message,
        orderId
      };
    }
  }

  // Process order to Loyverse
  async processOrderToLoyverse(orderData) {
    try {
      logger.info(`Processing order ${orderData.id} to Loyverse`);
      
      // Step 1: Handle customer
      let customer = null;
      if (orderData.customer) {
        customer = await this.loyverseAPI.findOrCreateCustomer(orderData.customer);
        if (customer) {
          orderData.customer_id = customer.id;
          logger.info(`Customer handled for order ${orderData.id}: ${customer.id}`);
        }
      }
      
      // Step 2: Map menu items if enabled
      if (this.config.syncMenuItems) {
        orderData.items = await this.mapMenuItems(orderData.items);
      }
      
      // Step 3: Create receipt in Loyverse
      const receipt = await this.loyverseAPI.createReceipt(orderData);
      
      logger.info(`Receipt created in Loyverse for order ${orderData.id}: ${receipt.id}`);
      
      return {
        receiptId: receipt.id,
        customerId: customer?.id,
        status: 'completed',
        timestamp: new Date().toISOString(),
        loyverseData: receipt
      };
      
    } catch (error) {
      logger.error(`Error processing order ${orderData.id} to Loyverse:`, error.message);
      throw error;
    }
  }

  // Map GloriaFood menu items to Loyverse products
  async mapMenuItems(gloriaFoodItems) {
    try {
      if (!this.config.syncMenuItems) {
        return gloriaFoodItems;
      }
      
      logger.info('Mapping GloriaFood menu items to Loyverse products');
      
      // Get all products from Loyverse
      const loyverseProducts = await this.loyverseAPI.getProducts();
      
      const mappedItems = gloriaFoodItems.map(item => {
        // Try to find matching product by name (case-insensitive)
        const matchingProduct = loyverseProducts.find(product => 
          product.name.toLowerCase().includes(item.name.toLowerCase()) ||
          item.name.toLowerCase().includes(product.name.toLowerCase())
        );
        
        return {
          ...item,
          loyverse_item_id: matchingProduct?.id || null,
          mapped: !!matchingProduct,
          original_name: item.name,
          loyverse_product: matchingProduct || null
        };
      });
      
      const mappedCount = mappedItems.filter(item => item.mapped).length;
      logger.info(`Mapped ${mappedCount} out of ${mappedItems.length} items`);
      
      return mappedItems;
    } catch (error) {
      logger.error('Error mapping menu items:', error.message);
      return gloriaFoodItems; // Return original items if mapping fails
    }
  }

  // Handle order updates
  async updateOrder(orderData) {
    const orderId = orderData.id;
    
    try {
      logger.info(`Starting to update order ${orderId}`);
      
      // Find existing receipt in Loyverse by external ID
      const existingReceipt = await this.findReceiptByExternalId(orderId);
      
      if (!existingReceipt) {
        throw new Error(`Receipt not found for order ${orderId}`);
      }
      
      // Update the receipt with new data
      const result = await this.updateReceiptInLoyverse(existingReceipt.id, orderData);
      
      // Mark as updated
      this.completedOrders.set(orderId, {
        status: 'updated',
        startTime: new Date(),
        updatedTime: new Date(),
        result
      });
      
      logger.info(`Order ${orderId} updated successfully`);
      
      return {
        success: true,
        orderId,
        result
      };
      
    } catch (error) {
      logger.error(`Failed to update order ${orderId}:`, error.message);
      
      this.failedOrders.set(orderId, {
        status: 'update_failed',
        startTime: new Date(),
        error: error.message
      });
      
      return {
        success: false,
        error: error.message,
        orderId
      };
    }
  }

  // Handle order cancellations
  async cancelOrder(orderData) {
    const orderId = orderData.id;
    
    try {
      logger.info(`Starting to cancel order ${orderId}`);
      
      // Find existing receipt in Loyverse by external ID
      const existingReceipt = await this.findReceiptByExternalId(orderId);
      
      if (!existingReceipt) {
        throw new Error(`Receipt not found for order ${orderId}`);
      }
      
      // Cancel the receipt in Loyverse
      const result = await this.cancelReceiptInLoyverse(existingReceipt.id);
      
      // Mark as cancelled
      this.completedOrders.set(orderId, {
        status: 'cancelled',
        startTime: new Date(),
        cancelledTime: new Date(),
        result
      });
      
      logger.info(`Order ${orderId} cancelled successfully`);
      
      return {
        success: true,
        orderId,
        result
      };
      
    } catch (error) {
      logger.error(`Failed to cancel order ${orderId}:`, error.message);
      
      this.failedOrders.set(orderId, {
        status: 'cancel_failed',
        startTime: new Date(),
        error: error.message
      });
      
      return {
        success: false,
        error: error.message,
        orderId
      };
    }
  }

  // Find receipt by external ID (GloriaFood order ID)
  async findReceiptByExternalId(externalId) {
    try {
      // This would need to be implemented based on Loyverse API capabilities
      // For now, we'll return null and handle it in the calling method
      logger.warn(`Receipt lookup by external ID not implemented yet for: ${externalId}`);
      return null;
    } catch (error) {
      logger.error(`Error finding receipt by external ID ${externalId}:`, error.message);
      return null;
    }
  }

  // Update receipt in Loyverse
  async updateReceiptInLoyverse(receiptId, orderData) {
    try {
      // This would update the existing receipt in Loyverse
      // Implementation depends on Loyverse API capabilities
      logger.info(`Updating receipt ${receiptId} in Loyverse`);
      
      // For now, return success (implement actual update logic)
      return {
        receiptId,
        status: 'updated',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Error updating receipt ${receiptId}:`, error.message);
      throw error;
    }
  }

  // Cancel receipt in Loyverse
  async cancelReceiptInLoyverse(receiptId) {
    try {
      // This would cancel the receipt in Loyverse
      // Implementation depends on Loyverse API capabilities
      logger.info(`Cancelling receipt ${receiptId} in Loyverse`);
      
      // For now, return success (implement actual cancellation logic)
      return {
        receiptId,
        status: 'cancelled',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Error cancelling receipt ${receiptId}:`, error.message);
      throw error;
    }
  }

  // Check if order should be retried
  shouldRetry(orderId) {
    const orderInfo = this.failedOrders.get(orderId);
    return orderInfo && orderInfo.attempts < this.config.retryAttempts;
  }

  // Schedule retry for failed order
  scheduleRetry(orderId, orderData) {
    const orderInfo = this.failedOrders.get(orderId);
    const delay = this.config.retryDelay * Math.pow(2, orderInfo.attempts - 1); // Exponential backoff
    
    logger.info(`Scheduling retry for order ${orderId} in ${delay}ms (attempt ${orderInfo.attempts + 1})`);
    
    setTimeout(async () => {
      try {
        logger.info(`Retrying order ${orderId} (attempt ${orderInfo.attempts + 1})`);
        await this.processOrder(orderData);
      } catch (error) {
        logger.error(`Retry failed for order ${orderId}:`, error.message);
      }
    }, delay);
  }

  // Get order processing status
  getOrderStatus(orderId) {
    if (this.processingQueue.has(orderId)) {
      return this.processingQueue.get(orderId);
    }
    if (this.completedOrders.has(orderId)) {
      return this.completedOrders.get(orderId);
    }
    if (this.failedOrders.has(orderId)) {
      return this.failedOrders.get(orderId);
    }
    return null;
  }

  // Get all processing statuses
  getAllOrderStatuses() {
    const allOrders = [];
    
    // Add processing orders
    for (const [orderId, info] of this.processingQueue.entries()) {
      allOrders.push({ orderId, ...info });
    }
    
    // Add completed orders
    for (const [orderId, info] of this.completedOrders.entries()) {
      allOrders.push({ orderId, ...info });
    }
    
    // Add failed orders
    for (const [orderId, info] of this.failedOrders.entries()) {
      allOrders.push({ orderId, ...info });
    }
    
    return allOrders;
  }

  // Get processing queue statistics
  getQueueStats() {
    return {
      ...this.stats,
      processingQueueSize: this.processingQueue.size,
      completedOrdersCount: this.completedOrders.size,
      failedOrdersCount: this.failedOrders.size,
      uptime: Date.now() - this.stats.startTime.getTime()
    };
  }

  // Health check for the integration service
  async healthCheck() {
    try {
      // Test GloriaFood connection
      const gloriaFoodStatus = await this.gloriaFoodService.testConnection();
      
      // Test Loyverse connection
      const loyverseStatus = await this.loyverseAPI.testConnection();
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        gloriaFood: gloriaFoodStatus,
        loyverse: loyverseStatus,
        queueStats: this.getQueueStats()
      };
      
    } catch (error) {
      logger.error('Integration service health check failed:', error.message);
      
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
        queueStats: this.getQueueStats()
      };
    }
  }

  // Clear old completed orders (for memory management)
  clearOldOrders(maxAge = 24 * 60 * 60 * 1000) { // 24 hours default
    const cutoffTime = Date.now() - maxAge;
    let clearedCount = 0;
    
    for (const [orderId, info] of this.completedOrders.entries()) {
      if (info.completedTime && new Date(info.completedTime).getTime() < cutoffTime) {
        this.completedOrders.delete(orderId);
        clearedCount++;
      }
    }
    
    logger.info(`Cleared ${clearedCount} old completed orders`);
    return clearedCount;
  }
}

module.exports = EnhancedIntegrationService;
