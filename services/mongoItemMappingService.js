const Product = require('../models/Product');
const logger = require('../utils/logger');

class MongoItemMappingService {
  constructor() {
    this.isInitialized = false;
    logger.info('MongoDB Item Mapping Service initialized');
  }

  // Initialize the service (ensure database connection)
  async initialize() {
    if (this.isInitialized) {
      return true;
    }

    try {
      // Test database connection by counting products
      const count = await Product.countDocuments();
      logger.info(`MongoDB connection verified. Found ${count} products in database.`);
      this.isInitialized = true;
      return true;
    } catch (error) {
      logger.error('Failed to initialize MongoDB Item Mapping Service:', error.message);
      throw error;
    }
  }

  // Find exact SKU by GloriaFood item name and size
  async findExactSKUByGloriaFoodItem(gloriaFoodItemName, size = null) {
    try {
      await this.initialize();

      logger.info(`Searching for exact match: GloriaFood item="${gloriaFoodItemName}", size="${size}"`);

      // Build query for exact match
      const query = { gloriaFoodItemName: gloriaFoodItemName };
      if (size) {
        query.size = size;
      }

      const product = await Product.findOne(query);

      if (product) {
        logger.info(`Found exact match: SKU ${product.sku} for "${gloriaFoodItemName}" (${size || 'no size'})`);
        return {
          sku: product.sku,
          loyverseName: product.name,
          category: product.category,
          price: product.price,
          matchType: 'exact'
        };
      }

      logger.warn(`No exact match found for: "${gloriaFoodItemName}" (size: "${size}")`);
      return null;

    } catch (error) {
      logger.error(`Error finding exact SKU for "${gloriaFoodItemName}":`, error.message);
      throw error;
    }
  }

  // Find SKU by GloriaFood item name with fallback (exact match first, then name only)
  async findSKUByGloriaFoodItem(gloriaFoodItemName, size = null) {
    try {
      await this.initialize();

      logger.info(`Searching for SKU: GloriaFood item="${gloriaFoodItemName}", size="${size}"`);

      // First try: exact match with both name and size
      if (size) {
        const exactMatch = await Product.findOne({
          gloriaFoodItemName: gloriaFoodItemName,
          size: size
        });

        if (exactMatch) {
          logger.info(`Found exact match: SKU ${exactMatch.sku} for "${gloriaFoodItemName}" (${size})`);
          return {
            sku: exactMatch.sku,
            loyverseName: exactMatch.name,
            category: exactMatch.category,
            price: exactMatch.price,
            matchType: 'exact'
          };
        }
      }

      // Second try: match by name only (fallback)
      const nameMatch = await Product.findOne({
        gloriaFoodItemName: gloriaFoodItemName
      });

      if (nameMatch) {
        logger.info(`Found name match: SKU ${nameMatch.sku} for "${gloriaFoodItemName}" (fallback, no size match)`);
        return {
          sku: nameMatch.sku,
          loyverseName: nameMatch.name,
          category: nameMatch.category,
          price: nameMatch.price,
          matchType: 'name_only'
        };
      }

      // No match found
      logger.warn(`No SKU found for GloriaFood item: "${gloriaFoodItemName}" (size: "${size}")`);
      return null;

    } catch (error) {
      logger.error(`Error finding SKU for "${gloriaFoodItemName}":`, error.message);
      throw error;
    }
  }

  // Find product by SKU
  async findProductBySKU(sku) {
    try {
      await this.initialize();

      const product = await Product.findBySKU(sku);
      
      if (product) {
        logger.info(`Found product by SKU ${sku}: ${product.name}`);
        return {
          sku: product.sku,
          loyverseName: product.name,
          category: product.category,
          price: product.price,
          gloriaFoodItemName: product.gloriaFoodItemName,
          size: product.size
        };
      }

      logger.warn(`No product found for SKU: ${sku}`);
      return null;

    } catch (error) {
      logger.error(`Error finding product by SKU ${sku}:`, error.message);
      throw error;
    }
  }

  // Create new product in MongoDB
  async createNewProduct(productData) {
    try {
      await this.initialize();

      logger.info(`Creating new product: ${productData.name} (SKU: ${productData.sku})`);

      // Check if product already exists
      const existingProduct = await Product.findBySKU(productData.sku);
      if (existingProduct) {
        logger.warn(`Product with SKU ${productData.sku} already exists`);
        return {
          sku: existingProduct.sku,
          loyverseName: existingProduct.name,
          category: existingProduct.category,
          price: existingProduct.price,
          matchType: 'existing'
        };
      }

      // Create new product
      const newProduct = new Product(productData);
      await newProduct.save();

      logger.info(`Successfully created new product: ${productData.name} (SKU: ${productData.sku})`);

        return {
          sku: newProduct.sku,
          loyverseName: newProduct.name,
          category: newProduct.category,
          price: newProduct.price,
          matchType: 'newly_created'
        };

    } catch (error) {
      logger.error(`Error creating new product:`, error.message);
      throw error;
    }
  }


  // Create new item in Loyverse and save to MongoDB
  async createNewItem(gloriaFoodItem, loyverseAPI) {
    try {
      await this.initialize();

      logger.info(`Creating new item for GloriaFood item: ${gloriaFoodItem.name}`);

      // Generate SKU (you might want to implement a better SKU generation logic)
      const sku = await this.generateNextSKU();
      
      // Extract size from item name or use provided size
      const size = this.extractSizeFromItem(gloriaFoodItem);
      const itemName = this.cleanItemName(gloriaFoodItem.name);
      const calculatedPrice = Math.round(gloriaFoodItem.price * 100) / 100; // Round to 2 decimal places

      // Create item in Loyverse
      const loyverseItemData = {
        name: itemName,  // This will become item_name in createItem method
        price: calculatedPrice,
        id: sku.toString()  // This will become the SKU
      };

      const createdItem = await loyverseAPI.createItem(loyverseItemData);
      
      if (!createdItem || !createdItem.variants || createdItem.variants.length === 0) {
        throw new Error('Failed to create item in Loyverse or item has no variants');
      }

      const variantId = createdItem.variants[0].variant_id;
      logger.info(`Created item in Loyverse: ${itemName} (ID: ${createdItem.id}, Variant: ${variantId})`);

      // Create product in MongoDB
      const productData = {
        handle: itemName.toLowerCase().replace(/\s+/g, '-'),
        sku: sku,
        name: itemName,
        category: "مشروبات", // Default category
        defaultPrice: calculatedPrice,
        cat: "مشروبات",
        gloriaFoodItemName: gloriaFoodItem.name,
        size: size || "",
        price: calculatedPrice
      };

      const savedProduct = await this.createNewProduct(productData);

      logger.info(`Successfully created new item: ${itemName} with SKU: ${sku}`);

      return {
        sku: sku,
        loyverseName: itemName,
        category: "مشروبات",
        price: calculatedPrice,
        matchType: 'auto_created',
        loyverseItemId: createdItem.id,
        variantId: variantId
      };

    } catch (error) {
      logger.error(`Failed to create new item for ${gloriaFoodItem.name}:`, error.message);
      throw error;
    }
  }

  // Process GloriaFood order items with automatic item creation
  async processGloriaFoodOrderItemsWithAutoCreation(gloriaFoodItems, loyverseAPI, orderData = null) {
    try {
      await this.initialize();

      const processedItems = [];

      // PRE-PROCESSING: Identify promo_item groups and exclude them from processing
      const promoItemGroups = new Map();
      const excludedItemIds = new Set();
      
      // First pass: Identify promo_item groups
      for (const item of gloriaFoodItems) {
        if (item.type === 'promo_item') {
          logger.info(`Found promo item: ${item.name} (ID: ${item.id}) - will be handled in receipt creation`);
          promoItemGroups.set(item.id, {
            promoItem: item,
            children: []
          });
          excludedItemIds.add(item.id);
        }
      }
      
      // Second pass: Find children of promo items
      for (const item of gloriaFoodItems) {
        if (item.parent_id && promoItemGroups.has(item.parent_id)) {
          logger.info(`Found child item: ${item.name} (ID: ${item.id}) for promo ${item.parent_id} - will be excluded`);
          promoItemGroups.get(item.parent_id).children.push(item);
          excludedItemIds.add(item.id);
        }
      }
      
      logger.info(`Excluding ${excludedItemIds.size} items from mapping processing`);

      for (const item of gloriaFoodItems) {
        try {
          // Skip items that are part of promo_item groups
          if (excludedItemIds.has(item.id)) {
            logger.info(`Skipping excluded item: ${item.name} (ID: ${item.id})`);
            continue;
          }
          
          // Handle cart discount items separately
          if (item.type === 'promo_cart') {
            // Check if payment detection was based on first_name - if so, skip promo processing
            if (orderData && orderData.paymentDetectionBasedOnFirstName) {
              logger.info(`Skipping promo processing for ${item.name} - payment detection based on first_name`);
              continue; // Skip this promo item entirely
            }
            
            logger.info(`Processing cart discount item: ${item.name} (type: ${item.type})`);
            
            // Use the new promo service to create/update the discount
            const PromoService = require('./promoService');
            const promoService = new PromoService();
            
            const promoResult = await promoService.createOrUpdatePromoCart(item);
            logger.info(`Promo cart result:`, promoResult);
            
            // Add cart discount item to processed items so it gets passed to receipt creation
            processedItems.push({
              originalGloriaFoodItem: item,
              sku: 'promo_cart',
              loyverseName: item.name,
              category: 'خصومات',
              price: item.cart_discount || item.item_discount || 0, // Keep negative value
              matchType: 'promo_cart',
              status: 'mapped',
              loyverseDiscountId: promoResult.loyverseDiscountId // Include the Loyverse discount ID
            });
            
            continue; // Skip normal item processing for promo items
          }
          
          const gloriaFoodItemName = item.name;
          const size = this.extractSizeFromItem(item);

          // Find the SKU mapping (exact match only for auto-creation)
          let mapping = await this.findExactSKUByGloriaFoodItem(gloriaFoodItemName, size);

          // If no exact mapping found, create new item (unless payment detection is based on first_name)
          if (!mapping) {
            if (orderData && orderData.paymentDetectionBasedOnFirstName) {
              logger.info(`No exact mapping found for "${gloriaFoodItemName}" (${size}), but skipping item creation due to payment detection based on first_name`);
              processedItems.push({
                originalGloriaFoodItem: item,
                sku: null,
                loyverseName: gloriaFoodItemName,
                category: 'غير محدد',
                price: item.price,
                matchType: 'unmapped',
                size: size,
                gloriaFoodItemName: gloriaFoodItemName,
                status: 'unmapped',
                error: 'No existing mapping found and item creation skipped due to payment detection based on first_name'
              });
              continue;
            } else {
              logger.info(`No exact mapping found for "${gloriaFoodItemName}" (${size}), creating new item...`);
              mapping = await this.createNewItem(item, loyverseAPI);
            }
          }

          processedItems.push({
            originalGloriaFoodItem: item,
            sku: mapping.sku,
            loyverseName: mapping.loyverseName,
            category: mapping.category,
            price: item.price, // Always use GloriaFood price for accuracy
            matchType: mapping.matchType,
            size: size,
            gloriaFoodItemName: gloriaFoodItemName,
            status: 'mapped',
            loyverseItemId: mapping.loyverseItemId,
            variantId: mapping.variantId
          });

        } catch (error) {
          logger.error(`Error processing GloriaFood item "${item.name}":`, error.message);
          processedItems.push({
            originalGloriaFoodItem: item,
            sku: null,
            loyverseName: null,
            category: null,
            price: null,
            matchType: 'error',
            status: 'error',
            error: error.message
          });
        }
      }

      const result = {
        processedItems,
        promoItemGroups: Array.from(promoItemGroups.values())
      };
      
      logger.info(`Returning mapping result: ${processedItems.length} processed items, ${result.promoItemGroups.length} promo groups`);
      return result;

    } catch (error) {
      logger.error('Error processing GloriaFood order items:', error.message);
      throw error;
    }
  }

  // Helper method to generate next available SKU
  async generateNextSKU() {
    try {
      const lastProduct = await Product.findOne().sort({ sku: -1 });
      return lastProduct ? lastProduct.sku + 1 : 10001; // Start from 10001 if no products exist
    } catch (error) {
      logger.error('Error generating next SKU:', error.message);
      return 10001; // Fallback
    }
  }

  // Helper method to extract size from item options or name
  extractSizeFromItem(item) {
    // First, try to extract size from options array
    if (item.options && Array.isArray(item.options)) {
      const sizeOption = item.options.find(option => 
        option.group_name === 'Size' || 
        option.type === 'size' ||
        ['كبير', 'وسط', 'صغير', 'large', 'medium', 'small'].includes(option.name)
      );
      
      if (sizeOption) {
        return sizeOption.name;
      }
    }

    // If no size found in options, try to extract from item name
    const name = item.name.toLowerCase();
    if (name.includes('كبير') || name.includes('large')) return 'كبير';
    if (name.includes('وسط') || name.includes('medium')) return 'وسط';
    if (name.includes('صغير') || name.includes('small')) return 'صغير';
    
    return null;
  }

  // Find or create promo cart item in MongoDB
  async findOrCreatePromoCartItem(promoData) {
    try {
      await this.initialize();
      
      const sku = 'promo_cart';
      logger.info(`Looking for promo cart item with SKU: ${sku}`);
      
      // First, try to find existing promo cart item
      let product = await Product.findOne({ sku: sku });
      
      if (product) {
        logger.info(`Found existing promo cart item: ${product.name} (SKU: ${product.sku})`);
        
        // Update the product with new promo data
        product.name = promoData.name;
        product.price = promoData.price;
        
        await product.save();
        logger.info(`✅ Updated promo cart item in MongoDB: ${product.name}`);
        
        return {
          sku: product.sku,
          loyverseName: product.name,
          category: product.category,
          price: product.price,
          matchType: 'exact',
          status: 'updated'
        };
      } else {
        logger.info(`Creating new promo cart item: ${promoData.name}`);
        
        // Create new promo cart product
        const newProduct = new Product({
          sku: sku,
          name: promoData.name,
          gloriaFoodItemName: promoData.name,
          category: 'خصومات', // Discounts category
          defaultPrice: 0, // Use absolute value for defaultPrice
          price: promoData.price,
          size: null,
          isActive: true
        });
        
        await newProduct.save();
        logger.info(`✅ Created new promo cart item in MongoDB: ${newProduct.name}`);
        
        return {
          sku: newProduct.sku,
          loyverseName: newProduct.name,
          category: newProduct.category,
          price: newProduct.price,
          matchType: 'exact',
          status: 'created'
        };
      }
    } catch (error) {
      logger.error('Error managing promo cart item in MongoDB:', error.message);
      throw error;
    }
  }

  // Helper method to clean item name
  cleanItemName(name) {
    return name.trim().replace(/\s+/g, ' ');
  }

  // Get all products (for debugging/admin purposes)
  async getAllProducts(limit = 100, skip = 0) {
    try {
      await this.initialize();
      
      const products = await Product.find()
        .sort({ sku: 1 })
        .limit(limit)
        .skip(skip);
      
      return products;
    } catch (error) {
      logger.error('Error getting all products:', error.message);
      throw error;
    }
  }

  // Get product statistics
  async getProductStats() {
    try {
      await this.initialize();
      
      const totalProducts = await Product.countDocuments();
      const productsWithLoyverse = await Product.countDocuments({ loyverseItemId: { $exists: true, $ne: null } });
      
      return {
        totalProducts,
        productsWithLoyverse,
        productsWithoutLoyverse: totalProducts - productsWithLoyverse
      };
    } catch (error) {
      logger.error('Error getting product stats:', error.message);
      throw error;
    }
  }
}

module.exports = MongoItemMappingService;
