const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  // Match export_items_menu.json structure exactly
  handle: {
    type: String,
    required: false,
    trim: true
  },
  sku: {
    type: Number,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: false,
    default: 'مشروبات'
  },
  defaultPrice: {
    type: Number,
    required: true
  },
  cat: {
    type: String,
    required: false
  },
  gloriaFoodItemName: {
    type: String,
    required: true,
    trim: true
  },
  size: {
    type: String,
    required: false,
    trim: true
  },
  price: {
    type: Number,
    required: true
  }
}, {
  timestamps: true,
  collection: 'products'
});

// Indexes for better performance
productSchema.index({ gloriaFoodItemName: 1, size: 1 });

// Static methods
productSchema.statics.findByGloriaFoodName = function (name, size = null) {
  const query = { gloriaFoodItemName: name };
  if (size) {
    query.size = size;
  }
  return this.findOne(query);
};

productSchema.statics.findBySKU = function (sku) {
  return this.findOne({ sku: sku });
};



module.exports = mongoose.model('Product', productSchema);
