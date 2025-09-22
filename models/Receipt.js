const mongoose = require('mongoose');

const receiptSchema = new mongoose.Schema({
  // Order Information
  gloriaFoodOrderId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  gloriaFoodOrderData: {
    type: Object,
    required: true
  },
  
  // Loyverse Information
  loyverseReceiptId: {
    type: String,
    required: false
  },
  loyverseReceiptNumber: {
    type: String,
    required: false,
    index: true
  },
  loyverseStoreId: {
    type: String,
    required: false
  },
  
  // Order Details
  customerName: {
    type: String,
    required: false
  },
  customerPhone: {
    type: String,
    required: false
  },
  customerEmail: {
    type: String,
    required: false
  },
  
  // Financial Information
  totalAmount: {
    type: Number,
    required: true
  },
  subtotalAmount: {
    type: Number,
    required: true
  },
  taxAmount: {
    type: Number,
    default: 0
  },
  deliveryFee: {
    type: Number,
    default: 0
  },
  
  // Order Type
  orderType: {
    type: String,
    required: true
  },
  paymentMethod: {
    type: String,
    required: true
  },
  
  // Items Information
  itemsCount: {
    type: Number,
    required: true
  },
  items: [{
    name: String,
    sku: String,
    quantity: Number,
    unitPrice: Number,
    totalPrice: Number,
    loyverseItemId: String,
    loyverseVariantId: String
  }],
  
  // Processing Status
  status: {
    type: String,
    enum: ['pending', 'processed', 'failed', 'duplicate'],
    default: 'pending'
  },
  
  // Processing Information
  processedAt: {
    type: Date,
    required: false
  },
  processingAttempts: {
    type: Number,
    default: 0
  },
  lastError: {
    type: String,
    required: false
  },
  
  // Source Information
  source: {
    type: String,
    default: 'GloriaFood'
  },
  webhookReceived: {
    type: Date,
    default: Date.now
  },
  
  // Additional Notes
  notes: {
    type: String,
    required: false
  }
}, {
  timestamps: true,
  collection: 'receipts'
});

// Indexes for better performance
receiptSchema.index({ gloriaFoodOrderId: 1 }, { unique: true });
receiptSchema.index({ loyverseReceiptNumber: 1 });
receiptSchema.index({ status: 1 });
receiptSchema.index({ orderType: 1 });
receiptSchema.index({ createdAt: -1 });
receiptSchema.index({ customerPhone: 1 });

// Instance methods
receiptSchema.methods.markAsProcessed = function(loyverseReceiptNumber, loyverseReceiptId) {
  this.status = 'processed';
  this.loyverseReceiptNumber = loyverseReceiptNumber;
  this.loyverseReceiptId = loyverseReceiptId;
  this.processedAt = new Date();
  return this.save();
};

receiptSchema.methods.markAsFailed = function(error) {
  this.status = 'failed';
  this.lastError = error;
  this.processingAttempts += 1;
  return this.save();
};

receiptSchema.methods.markAsDuplicate = function() {
  this.status = 'duplicate';
  return this.save();
};

// Static methods
receiptSchema.statics.findByOrderId = function(orderId) {
  return this.findOne({ gloriaFoodOrderId: orderId.toString() });
};

receiptSchema.statics.findByReceiptNumber = function(receiptNumber) {
  return this.findOne({ loyverseReceiptNumber: receiptNumber });
};

receiptSchema.statics.getRecentReceipts = function(limit = 50) {
  return this.find({ status: 'processed' })
    .sort({ createdAt: -1 })
    .limit(limit);
};

receiptSchema.statics.getFailedReceipts = function() {
  return this.find({ status: 'failed' })
    .sort({ createdAt: -1 });
};

module.exports = mongoose.model('Receipt', receiptSchema);

