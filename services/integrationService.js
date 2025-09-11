const LoyverseAPI = require('../utils/loyverseApi');
const logger = require('../utils/logger');

class IntegrationService {
  constructor() {
    this.loyverseAPI = new LoyverseAPI();
    this.processingQueue = new Map();
    this.retryAttempts = parseInt(process.env.RETRY_ATTEMPTS) || 3;
    this.retryDelay = parseInt(process.env.RETRY_DELAY) || 5000;
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
        attempts: 0
      });
      
      // Process the order
      const result = await this.processOrderToLoyverse(orderData);
      
      // Mark as completed
      this.processingQueue.set(orderId, {
        status: 'completed',
        startTime: new Date(),
        completedTime: new Date(),
        result
      });
      
      logger.info(`Order ${orderId} processed successfully`, result);
      
      return {
        success: true,
        orderId,
        result
      };
      
    } catch (error) {
      logger.error(`Failed to process order ${orderId}:`, error.message);
      
      // Mark as failed
      this.processingQueue.set(orderId, {
        status: 'failed',
        startTime: new Date(),
        error: error.message,
        attempts: (this.processingQueue.get(orderId)?.attempts || 0) + 1
      });
      
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
      // Step 1: Handle customer
      let customer = null;
      if (orderData.customer) {
        customer = await this.loyverseAPI.findOrCreateCustomer(orderData.customer);
        if (customer) {
          orderData.customer_id = customer.id;
          logger.info(`Customer handled for order ${orderData.id}: ${customer.id}`);
        }
      }
      
      // Step 2: Create receipt in Loyverse
      const receipt = await this.loyverseAPI.createReceipt(orderData);
      
      logger.info(`Receipt created in Loyverse for order ${orderData.id}: ${receipt.id}`);
      
      return {
        receiptId: receipt.id,
        customerId: customer?.id,
        status: 'completed',
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error(`Error processing order ${orderData.id} to Loyverse:`, error.message);
      throw error;
    }
  }

  // Check if order should be retried
  shouldRetry(orderId) {
    const orderInfo = this.processingQueue.get(orderId);
    return orderInfo && orderInfo.attempts < this.retryAttempts;
  }

  // Schedule retry for failed order
  scheduleRetry(orderId, orderData) {
    const orderInfo = this.processingQueue.get(orderId);
    const delay = this.retryDelay * Math.pow(2, orderInfo.attempts - 1); // Exponential backoff
    
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
    return this.processingQueue.get(orderId) || null;
  }

  // Get all processing statuses
  getAllOrderStatuses() {
    const statuses = [];
    
    for (const [orderId, info] of this.processingQueue.entries()) {
      statuses.push({
        orderId,
        ...info
      });
    }
    
    return statuses;
  }

  // Clear completed orders
  clearCompletedOrders() {
    let clearedCount = 0;
    
    for (const [orderId, info] of this.processingQueue.entries()) {
      if (info.status === 'completed') {
        this.processingQueue.delete(orderId);
        clearedCount++;
      }
    }
    
    logger.info(`Cleared ${clearedCount} completed orders from processing queue`);
    return clearedCount;
  }

  // Retry a specific failed order
  async retryOrder(orderId, orderData) {
    const orderInfo = this.processingQueue.get(orderId);
    
    if (!orderInfo) {
      throw new Error('Order not found in processing queue');
    }
    
    if (orderInfo.status !== 'failed') {
      throw new Error(`Order is not in failed status: ${orderInfo.status}`);
    }
    
    // Remove from queue to allow retry
    this.processingQueue.delete(orderId);
    
    // Process again
    return await this.processOrder(orderData);
  }

  // Get processing queue statistics
  getQueueStats() {
    const stats = {
      total: this.processingQueue.size,
      processing: 0,
      completed: 0,
      failed: 0,
      retryable: 0
    };
    
    for (const info of this.processingQueue.values()) {
      stats[info.status]++;
      
      if (info.status === 'failed' && this.shouldRetry(info.orderId)) {
        stats.retryable++;
      }
    }
    
    return stats;
  }

  // Health check for the integration service
  async healthCheck() {
    try {
      // Test Loyverse connection
      const locations = await this.loyverseAPI.getLocations();
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        loyverseConnection: 'ok',
        locationCount: locations.length,
        queueStats: this.getQueueStats()
      };
      
    } catch (error) {
      logger.error('Integration service health check failed:', error.message);
      
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        loyverseConnection: 'failed',
        error: error.message,
        queueStats: this.getQueueStats()
      };
    }
  }

  // Update existing order in Loyverse
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
      this.processingQueue.set(orderId, {
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
      
      this.processingQueue.set(orderId, {
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

  // Cancel order in Loyverse
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
      this.processingQueue.set(orderId, {
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
      
      this.processingQueue.set(orderId, {
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

  // Map GloriaFood menu items to Loyverse products
  async mapMenuItems(gloriaFoodItems) {
    try {
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
          original_name: item.name
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
}

module.exports = IntegrationService;
