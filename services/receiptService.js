const Receipt = require('../models/Receipt');
const logger = require('../utils/logger');

class ReceiptService {
  constructor() {
    this.isInitialized = false;
    logger.info('MongoDB Receipt Service initialized');
  }

  // Initialize the service (ensure database connection)
  async initialize() {
    if (this.isInitialized) {
      return true;
    }

    try {
      // Test database connection by counting receipts
      const count = await Receipt.countDocuments();
      logger.info(`MongoDB connection verified. Found ${count} receipts in database.`);
      this.isInitialized = true;
      return true;
    } catch (error) {
      logger.error('Failed to initialize MongoDB Receipt Service:', error.message);
      throw error;
    }
  }

  // Create a new receipt in MongoDB
  async createReceipt(receiptData) {
    try {
      await this.initialize();

      logger.info(`Creating receipt for order: ${receiptData.gloriaFoodOrderId}`);

      // Check if receipt already exists
      const existingReceipt = await Receipt.findByOrderId(receiptData.gloriaFoodOrderId);
      if (existingReceipt) {
        logger.warn(`Receipt for order ${receiptData.gloriaFoodOrderId} already exists`);
        return existingReceipt;
      }

      // Create new receipt with pending status
      const receiptDataWithStatus = {
        ...receiptData,
        status: 'pending',
        processingAttempts: 0,
        webhookReceived: new Date()
      };

      const newReceipt = new Receipt(receiptDataWithStatus);
      await newReceipt.save();

      logger.info(`Successfully created receipt for order: ${receiptData.gloriaFoodOrderId}`);

      return newReceipt;

    } catch (error) {
      logger.error(`Error creating receipt for order ${receiptData.gloriaFoodOrderId}:`, error.message);
      throw error;
    }
  }

  // Update receipt with Loyverse information after successful creation
  async updateReceiptWithLoyverseInfo(orderId, loyverseReceiptId, loyverseReceiptNumber) {
    try {
      await this.initialize();

      const receipt = await Receipt.findByOrderId(orderId);
      if (!receipt) {
        throw new Error(`Receipt for order ${orderId} not found`);
      }

      await receipt.markAsProcessed(loyverseReceiptId, loyverseReceiptNumber);

      logger.info(`Updated receipt for order ${orderId} with Loyverse info: ReceiptID=${loyverseReceiptId}, ReceiptNumber=${loyverseReceiptNumber}`);

      return receipt;

    } catch (error) {
      logger.error(`Error updating receipt for order ${orderId} with Loyverse info:`, error.message);
      throw error;
    }
  }

  // Mark receipt as failed
  async markReceiptAsFailed(orderId, error) {
    try {
      await this.initialize();

      const receipt = await Receipt.findByOrderId(orderId);
      if (!receipt) {
        throw new Error(`Receipt for order ${orderId} not found`);
      }

      await receipt.markAsFailed(error);

      logger.info(`Marked receipt for order ${orderId} as failed: ${error}`);

      return receipt;

    } catch (error) {
      logger.error(`Error marking receipt for order ${orderId} as failed:`, error.message);
      throw error;
    }
  }

  // Mark receipt as duplicate
  async markReceiptAsDuplicate(orderId) {
    try {
      await this.initialize();

      const receipt = await Receipt.findByOrderId(orderId);
      if (!receipt) {
        throw new Error(`Receipt for order ${orderId} not found`);
      }

      await receipt.markAsDuplicate();

      logger.info(`Marked receipt for order ${orderId} as duplicate`);

      return receipt;

    } catch (error) {
      logger.error(`Error marking receipt for order ${orderId} as duplicate:`, error.message);
      throw error;
    }
  }

  // Find receipt by order ID
  async findReceiptByOrderId(orderId) {
    try {
      await this.initialize();

      const receipt = await Receipt.findByOrderId(orderId);
      
      if (receipt) {
        logger.info(`Found receipt for order ${orderId}: Status=${receipt.status}`);
        return receipt;
      }

      logger.warn(`No receipt found for order: ${orderId}`);
      return null;

    } catch (error) {
      logger.error(`Error finding receipt for order ${orderId}:`, error.message);
      throw error;
    }
  }

  // Find receipt by Loyverse receipt number
  async findReceiptByReceiptNumber(receiptNumber) {
    try {
      await this.initialize();

      const receipt = await Receipt.findByReceiptNumber(receiptNumber);
      
      if (receipt) {
        logger.info(`Found receipt by receipt number ${receiptNumber}: OrderID=${receipt.gloriaFoodOrderId}`);
        return receipt;
      }

      logger.warn(`No receipt found for receipt number: ${receiptNumber}`);
      return null;

    } catch (error) {
      logger.error(`Error finding receipt by receipt number ${receiptNumber}:`, error.message);
      throw error;
    }
  }

  // Get recent processed receipts
  async getRecentReceipts(limit = 50) {
    try {
      await this.initialize();
      
      const receipts = await Receipt.getRecentReceipts(limit);
      
      logger.info(`Retrieved ${receipts.length} recent receipts`);
      
      return receipts;
    } catch (error) {
      logger.error('Error getting recent receipts:', error.message);
      throw error;
    }
  }

  // Get failed receipts
  async getFailedReceipts() {
    try {
      await this.initialize();
      
      const receipts = await Receipt.getFailedReceipts();
      
      logger.info(`Retrieved ${receipts.length} failed receipts`);
      
      return receipts;
    } catch (error) {
      logger.error('Error getting failed receipts:', error.message);
      throw error;
    }
  }

  // Get receipt statistics
  async getReceiptStats() {
    try {
      await this.initialize();
      
      const totalReceipts = await Receipt.countDocuments();
      const processedReceipts = await Receipt.countDocuments({ status: 'processed' });
      const failedReceipts = await Receipt.countDocuments({ status: 'failed' });
      const pendingReceipts = await Receipt.countDocuments({ status: 'pending' });
      const duplicateReceipts = await Receipt.countDocuments({ status: 'duplicate' });
      
      return {
        totalReceipts,
        processedReceipts,
        failedReceipts,
        pendingReceipts,
        duplicateReceipts
      };
    } catch (error) {
      logger.error('Error getting receipt stats:', error.message);
      throw error;
    }
  }

  // Verify processed receipt with Loyverse
  async verifyProcessedReceipt(existingReceipt, loyverseAPI) {
    try {
      await this.initialize();

      if (!existingReceipt.loyverseReceiptNumber) {
        logger.warn(`No Loyverse receipt number for order ${existingReceipt.gloriaFoodOrderId}`);
        return { exists: false, reason: 'No Loyverse receipt number' };
      }

      // Use Loyverse API to verify receipt exists
      const loyverseReceipt = await loyverseAPI.getReceiptById(existingReceipt.loyverseReceiptNumber);
      
      if (loyverseReceipt) {
        logger.info(`Verified receipt exists in Loyverse: ${existingReceipt.loyverseReceiptNumber}`);
        return { exists: true, receipt: loyverseReceipt };
      } else {
        logger.warn(`Receipt not found in Loyverse: ${existingReceipt.loyverseReceiptNumber}`);
        return { exists: false, reason: 'Receipt not found in Loyverse' };
      }
    } catch (error) {
      logger.error(`Error verifying receipt ${existingReceipt.loyverseReceiptNumber}:`, error.message);
      return { exists: false, reason: `Verification error: ${error.message}` };
    }
  }

  // Retry failed receipt
  async retryFailedReceipt(existingReceipt, orderData, loyverseAPI) {
    try {
      await this.initialize();

      const maxRetries = 3;
      if (existingReceipt.processingAttempts >= maxRetries) {
        await this.markReceiptAsFailed(existingReceipt.gloriaFoodOrderId, `Max retries (${maxRetries}) exceeded`);
        throw new Error(`Max retries exceeded for order ${existingReceipt.gloriaFoodOrderId}`);
      }

      // Reset status to pending and increment attempts
      existingReceipt.status = 'pending';
      existingReceipt.processingAttempts += 1;
      existingReceipt.lastError = null;
      await existingReceipt.save();

      logger.info(`Retrying receipt for order ${existingReceipt.gloriaFoodOrderId} (attempt ${existingReceipt.processingAttempts})`);

      return existingReceipt;
    } catch (error) {
      logger.error(`Error retrying receipt for order ${existingReceipt.gloriaFoodOrderId}:`, error.message);
      throw error;
    }
  }

  // Check pending receipt
  async checkPendingReceipt(existingReceipt, loyverseAPI) {
    try {
      await this.initialize();

      // Check if receipt was created in Loyverse but MongoDB wasn't updated
      if (existingReceipt.loyverseReceiptNumber) {
        const verification = await this.verifyProcessedReceipt(existingReceipt, loyverseAPI);
        
        if (verification.exists) {
          // Receipt exists in Loyverse - update MongoDB status
          await this.updateReceiptWithLoyverseInfo(
            existingReceipt.gloriaFoodOrderId,
            verification.receipt.id,
            verification.receipt.receipt_number
          );
          
          logger.info(`Updated pending receipt status for order ${existingReceipt.gloriaFoodOrderId}`);
          return { status: 'updated', receipt: verification.receipt };
        }
      }

      // No Loyverse receipt found - return for retry
      return { status: 'needs_retry' };
    } catch (error) {
      logger.error(`Error checking pending receipt for order ${existingReceipt.gloriaFoodOrderId}:`, error.message);
      return { status: 'error', error: error.message };
    }
  }

  // Handle existing receipt based on status
  async handleExistingReceipt(existingReceipt, orderData, loyverseAPI) {
    try {
      await this.initialize();

      logger.info(`Handling existing receipt for order ${existingReceipt.gloriaFoodOrderId} with status: ${existingReceipt.status}`);

      switch (existingReceipt.status) {
        case 'processed':
          // Verify with Loyverse
          const verification = await this.verifyProcessedReceipt(existingReceipt, loyverseAPI);
          if (verification.exists) {
            return {
              success: true,
              message: 'Order already processed',
              eventType: 'duplicate_order',
              receiptNumber: verification.receipt.receipt_number,
              mongoReceiptId: existingReceipt._id,
              status: 'verified'
            };
          } else {
            // Receipt doesn't exist in Loyverse - mark as failed and retry
            await this.markReceiptAsFailed(existingReceipt.gloriaFoodOrderId, verification.reason);
            const retryReceipt = await this.retryFailedReceipt(existingReceipt, orderData, loyverseAPI);
            return { status: 'retry_needed', receipt: retryReceipt };
          }

        case 'failed':
          // Retry failed receipt
          const retryReceipt = await this.retryFailedReceipt(existingReceipt, orderData, loyverseAPI);
          return { status: 'retry_needed', receipt: retryReceipt };

        case 'pending':
          // Check if Loyverse receipt was created
          const pendingCheck = await this.checkPendingReceipt(existingReceipt, loyverseAPI);
          if (pendingCheck.status === 'updated') {
            return {
              success: true,
              message: 'Order already processed (status updated)',
              eventType: 'duplicate_order',
              receiptNumber: pendingCheck.receipt.receipt_number,
              mongoReceiptId: existingReceipt._id,
              status: 'updated'
            };
          } else if (pendingCheck.status === 'needs_retry') {
            const retryReceipt = await this.retryFailedReceipt(existingReceipt, orderData, loyverseAPI);
            return { status: 'retry_needed', receipt: retryReceipt };
          } else {
            return { status: 'error', error: pendingCheck.error };
          }

        case 'duplicate':
          // Already handled as duplicate
          return {
            success: true,
            message: 'Order already processed - duplicate',
            eventType: 'duplicate_order',
            mongoReceiptId: existingReceipt._id,
            status: 'duplicate'
          };

        default:
          // Unknown status - treat as new
          logger.warn(`Unknown receipt status: ${existingReceipt.status} for order ${existingReceipt.gloriaFoodOrderId}`);
          return { status: 'treat_as_new' };
      }
    } catch (error) {
      logger.error(`Error handling existing receipt for order ${existingReceipt.gloriaFoodOrderId}:`, error.message);
      throw error;
    }
  }

  // Create new receipt with proper flow
  async createNewReceipt(orderData, loyverseAPI) {
    try {
      await this.initialize();

      logger.info(`Creating new receipt for order: ${orderData.id}`);

      // Step 1: Create receipt record in MongoDB first (status: pending)
      const receiptData = {
        gloriaFoodOrderId: orderData.id.toString(),
        gloriaFoodOrderData: orderData,
        customerName: orderData.customer?.name || null,
        customerPhone: orderData.customer?.phone || null,
        customerEmail: orderData.customer?.email || null,
        totalAmount: orderData.total || 0,
        subtotalAmount: orderData.subtotal || orderData.total || 0,
        taxAmount: orderData.tax || 0,
        deliveryFee: orderData.delivery_fee || 0,
        orderType: orderData.order_type || 'delivery',
        paymentMethod: orderData.payment_method || 'cash',
        itemsCount: orderData.items?.length || 0,
        items: orderData.items?.map(item => ({
          name: item.name,
          sku: item.sku || null,
          quantity: item.quantity || 1,
          unitPrice: item.price || 0,
          totalPrice: (item.price || 0) * (item.quantity || 1),
          loyverseItemId: item.loyverseItemId || null,
          loyverseVariantId: item.variantId || null
        })) || [],
        source: 'GloriaFood'
      };

      const receiptRecord = await this.createReceipt(receiptData);

      // Step 2: Process order to Loyverse
      const loyverseResult = await this.processOrderToLoyverse(orderData, loyverseAPI);

      // Step 3: Update MongoDB with Loyverse info
      await this.updateReceiptWithLoyverseInfo(
        orderData.id,
        loyverseResult.loyverseReceiptId,
        loyverseResult.loyverseReceiptNumber
      );

      logger.info(`Successfully created new receipt for order: ${orderData.id}`);

      return {
        success: true,
        message: 'Order processed successfully',
        eventType: 'order_processed',
        receiptNumber: loyverseResult.loyverseReceiptNumber,
        mongoReceiptId: receiptRecord._id,
        loyverseReceiptId: loyverseResult.loyverseReceiptId
      };

    } catch (error) {
      // Mark as failed in MongoDB
      await this.markReceiptAsFailed(orderData.id, error.message);
      logger.error(`Error creating new receipt for order ${orderData.id}:`, error.message);
      throw error;
    }
  }

  // Process order to Loyverse
  async processOrderToLoyverse(orderData, loyverseAPI) {
    try {
      // Map items using the item mapping service
      const MongoItemMappingService = require('./mongoItemMappingService');
      const itemMappingService = new MongoItemMappingService();
      
      const mappedItems = await itemMappingService.processGloriaFoodOrderItemsWithAutoCreation(
        orderData.items, 
        loyverseAPI
      );

      // Transform mapped items to the format expected by Loyverse API
      const transformedItems = mappedItems
        .filter(item => item.status === 'mapped')
        .map(item => ({
          id: item.originalGloriaFoodItem.id,
          name: item.loyverseName,
          price: item.price,
          quantity: item.originalGloriaFoodItem.quantity, // ✅ Preserve original quantity
          instructions: item.originalGloriaFoodItem.instructions || '',
          total_price: item.price * item.originalGloriaFoodItem.quantity,
          sku: item.sku,
          category: item.category,
          matchType: item.matchType
        }));

      // Create receipt in Loyverse
      const processedOrder = {
        ...orderData,
        items: transformedItems, // ✅ Use transformed items with proper quantities
        mappingResults: mappedItems
      };

      const loyverseReceipt = await loyverseAPI.createReceipt(processedOrder);

      return {
        loyverseReceiptId: loyverseReceipt.id || loyverseReceipt.receipt_number,
        loyverseReceiptNumber: loyverseReceipt.receipt_number || loyverseReceipt.id
      };

    } catch (error) {
      logger.error(`Error processing order to Loyverse for order ${orderData.id}:`, error.message);
      throw error;
    }
  }

  // Process GloriaFood order and create receipt record
  async processGloriaFoodOrder(orderData, loyverseReceiptResponse = null) {
    try {
      await this.initialize();

      logger.info(`Processing GloriaFood order: ${orderData.id}`);

      // Check if receipt already exists
      const existingReceipt = await this.findReceiptByOrderId(orderData.id);
      if (existingReceipt) {
        logger.warn(`Receipt for order ${orderData.id} already exists, skipping creation`);
        return existingReceipt;
      }

      // Prepare receipt data
      const receiptData = {
        gloriaFoodOrderId: orderData.id.toString(),
        gloriaFoodOrderData: orderData,
        customerName: orderData.customer?.name || null,
        customerPhone: orderData.customer?.phone || null,
        customerEmail: orderData.customer?.email || null,
        totalAmount: orderData.total || 0,
        subtotalAmount: orderData.subtotal || orderData.total || 0,
        taxAmount: orderData.tax || 0,
        deliveryFee: orderData.delivery_fee || 0,
        orderType: orderData.order_type || 'delivery',
        paymentMethod: orderData.payment_method || 'cash',
        itemsCount: orderData.items?.length || 0,
        items: orderData.items?.map(item => ({
          name: item.name,
          sku: item.sku || null,
          quantity: item.quantity || 1,
          unitPrice: item.price || 0,
          totalPrice: (item.price || 0) * (item.quantity || 1),
          loyverseItemId: item.loyverseItemId || null,
          loyverseVariantId: item.variantId || null
        })) || [],
        status: loyverseReceiptResponse ? 'processed' : 'pending',
        loyverseReceiptId: loyverseReceiptResponse?.id || null,
        loyverseReceiptNumber: loyverseReceiptResponse?.receipt_number || null,
        processedAt: loyverseReceiptResponse ? new Date() : null,
        source: 'GloriaFood',
        webhookReceived: new Date()
      };

      // Create receipt
      const receipt = await this.createReceipt(receiptData);

      // If Loyverse receipt was created successfully, update the receipt
      if (loyverseReceiptResponse) {
        await this.updateReceiptWithLoyverseInfo(
          orderData.id,
          loyverseReceiptResponse.id || loyverseReceiptResponse.receipt_number,
          loyverseReceiptResponse.receipt_number || loyverseReceiptResponse.id
        );
      }

      logger.info(`Successfully processed GloriaFood order: ${orderData.id}`);

      return receipt;

    } catch (error) {
      logger.error(`Error processing GloriaFood order ${orderData.id}:`, error.message);
      throw error;
    }
  }
}

module.exports = ReceiptService;
