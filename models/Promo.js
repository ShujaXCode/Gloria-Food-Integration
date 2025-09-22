const mongoose = require('mongoose');

const promoSchema = new mongoose.Schema({
  // Loyverse discount ID (if created in Loyverse)
  loyverseDiscountId: {
    type: String,
    required: false,
    unique: true,
    sparse: true // Allow multiple null values
  },
  
  // Discount type from Loyverse
  type: {
    type: String,
    enum: ['FIXED_PERCENT', 'FIXED_AMOUNT', 'VARIABLE_PERCENT', 'VARIABLE_AMOUNT', 'DISCOUNT_BY_POINTS'],
    required: true
  },
  
  // Discount name
  name: {
    type: String,
    required: true,
    maxlength: 40
  },
  
  // Discount amount (for FIXED_AMOUNT type)
  discountAmount: {
    type: Number,
    required: false,
    min: 0.01,
    max: 999999.99
  },
  
  // Discount percentage (for FIXED_PERCENT type)
  discountPercent: {
    type: Number,
    required: false,
    min: 0.01,
    max: 100
  },
  
  // Store IDs where this discount is available
  stores: [{
    type: String,
    required: false
  }],
  
  // Whether password verification is required
  restrictedAccess: {
    type: Boolean,
    default: false
  },
  
  // GloriaFood specific fields
  gloriaFoodItemId: {
    type: String,
    required: false,
    unique: true,
    sparse: true // Allow multiple null values
  },
  
  gloriaFoodPromoName: {
    type: String,
    required: false
  },
  
  // Original discount value from GloriaFood (may be negative)
  originalDiscountValue: {
    type: Number,
    required: false
  },
}, {
  timestamps: true
});

// Index for efficient lookups
promoSchema.index({ name: 1 });
promoSchema.index({ loyverseDiscountId: 1 });
promoSchema.index({ gloriaFoodItemId: 1 });

module.exports = mongoose.model('Promo', promoSchema);
