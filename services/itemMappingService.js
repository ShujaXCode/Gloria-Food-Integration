const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const LoyverseAPI = require('../utils/loyverseApi');

class ItemMappingService {
  constructor() {
    this.mappingData = null;
    this.loadMappingData();
  }

  // Load the mapping data from the JSON file
  loadMappingData() {
    try {
      // Try multiple possible paths
      const possiblePaths = [
        path.join(__dirname, '../../export_items_menu.json'),
        path.join(process.cwd(), 'export_items_menu.json'),
        './export_items_menu.json'
      ];
      
      let mappingFilePath = null;
      for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
          mappingFilePath = testPath;
          break;
        }
      }
      
      if (!mappingFilePath) {
        throw new Error(`Mapping file not found. Tried paths: ${possiblePaths.join(', ')}`);
      }
      
      console.log('Loading mapping file from:', mappingFilePath);
      const rawData = fs.readFileSync(mappingFilePath, 'utf8');
      this.mappingData = JSON.parse(rawData);
      logger.info(`Loaded ${this.mappingData.length} item mappings from export_items_menu.json`);
      console.log(`Loaded ${this.mappingData.length} item mappings`);
    } catch (error) {
      logger.error('Failed to load item mapping data:', error.message);
      console.error('Failed to load item mapping data:', error.message);
      this.mappingData = [];
    }
  }

  // Find SKU by GloriaFood item name and size (exact match only)
  async findExactSKUByGloriaFoodItem(gloriaFoodItemName, size = null, loyverseAPI = null) {
    if (!this.mappingData || this.mappingData.length === 0) {
      logger.warn('No mapping data available');
      return null;
    }

    logger.info(`Looking for exact SKU match: GloriaFood item="${gloriaFoodItemName}", size="${size}"`);

    // Only exact match with both name and size
    if (size) {
      const exactMatch = this.mappingData.find(item => 
        item["Gloria food item name"] === gloriaFoodItemName && 
        item["Size"] === size
      );
      
      if (exactMatch) {
        logger.info(`Found exact match: SKU ${exactMatch.SKU} for "${gloriaFoodItemName}" (${size})`);
        
        // Use GloriaFood price instead of mapping file price for accuracy
        // The customer paid the GloriaFood price, so we should use that
        logger.info(`Using GloriaFood price for SKU ${exactMatch.SKU} (not mapping file price)`);
        
        return {
          sku: exactMatch.SKU,
          loyverseName: exactMatch.Name,
          category: exactMatch.Category,
          price: null, // Will be set to GloriaFood price in the calling function
          realTimePrice: null,
          matchType: 'exact'
        };
      }
    } else {
      // For items without size, match by name only (ignore size field completely)
      const exactMatch = this.mappingData.find(item => 
        item["Gloria food item name"] === gloriaFoodItemName
      );
      
      if (exactMatch) {
        logger.info(`Found exact match: SKU ${exactMatch.SKU} for "${gloriaFoodItemName}" (no size)`);
        
        // Use GloriaFood price instead of mapping file price for accuracy
        // The customer paid the GloriaFood price, so we should use that
        logger.info(`Using GloriaFood price for SKU ${exactMatch.SKU} (not mapping file price)`);
        
        return {
          sku: exactMatch.SKU,
          loyverseName: exactMatch.Name,
          category: exactMatch.Category,
          price: null, // Will be set to GloriaFood price in the calling function
          realTimePrice: null,
          matchType: 'exact'
        };
      }
    }

    // No exact match found
    logger.warn(`No exact SKU match found for GloriaFood item: "${gloriaFoodItemName}" (size: "${size}")`);
    return null;
  }

  // Find SKU by GloriaFood item name and size (with fallback)
  findSKUByGloriaFoodItem(gloriaFoodItemName, size = null) {
    if (!this.mappingData || this.mappingData.length === 0) {
      logger.warn('No mapping data available');
      return null;
    }

    logger.info(`Looking for SKU: GloriaFood item="${gloriaFoodItemName}", size="${size}"`);

    // First try: exact match with both name and size
    if (size) {
      const exactMatch = this.mappingData.find(item => 
        item["Gloria food item name"] === gloriaFoodItemName && 
        item["Size"] === size
      );
      
      if (exactMatch) {
        logger.info(`Found exact match: SKU ${exactMatch.SKU} for "${gloriaFoodItemName}" (${size})`);
        return {
          sku: exactMatch.SKU,
          loyverseName: exactMatch.Name,
          category: exactMatch.Category,
          price: exactMatch.Price || exactMatch["Default price"],
          matchType: 'exact'
        };
      }
    }

    // Second try: match by name only (fallback)
    const nameMatch = this.mappingData.find(item => 
      item["Gloria food item name"] === gloriaFoodItemName
    );

    if (nameMatch) {
      logger.info(`Found name match: SKU ${nameMatch.SKU} for "${gloriaFoodItemName}" (fallback, no size match)`);
      return {
        sku: nameMatch.SKU,
        loyverseName: nameMatch.Name,
        category: nameMatch.Category,
        price: nameMatch.Price || nameMatch["Default price"],
        matchType: 'name_only'
      };
    }

    // No match found
    logger.warn(`No SKU found for GloriaFood item: "${gloriaFoodItemName}" (size: "${size}")`);
    return null;
  }

  // Process GloriaFood order items and map them to Loyverse SKUs
  processGloriaFoodOrderItems(gloriaFoodItems) {
    const processedItems = [];

    for (const item of gloriaFoodItems) {
      try {
        // Handle special items like delivery fees
        if (item.name === 'DELIVERY_FEE' || item.type === 'delivery_fee') {
          logger.info(`Processing delivery fee: ${item.name} (${item.price} PKR)`);
          processedItems.push({
            originalGloriaFoodItem: item,
            sku: 'DELIVERY_FEE',
            loyverseName: 'Delivery Fee',
            category: 'Delivery',
            price: item.price,
            matchType: 'delivery_fee',
            size: null,
            gloriaFoodItemName: item.name,
            status: 'mapped'
          });
          continue;
        }

        // Extract size from item options or name
        let size = null;
        let gloriaFoodItemName = item.name;

        // First, try to extract size from options array
        if (item.options && Array.isArray(item.options)) {
          const sizeOption = item.options.find(option => 
            option.group_name === 'Size' || 
            option.type === 'size' ||
            ['كبير', 'وسط', 'صغير', 'large', 'medium', 'small'].includes(option.name)
          );
          
          if (sizeOption) {
            size = sizeOption.name;
            logger.info(`Found size in options: "${size}" for item "${item.name}"`);
          }
        }

        // If no size found in options, try to extract from item name
        if (!size) {
          const sizePatterns = ['كبير', 'وسط', 'صغير', 'large', 'medium', 'small'];
          for (const pattern of sizePatterns) {
            if (item.name.includes(pattern)) {
              size = pattern;
              // Remove size from the name for matching
              gloriaFoodItemName = item.name.replace(pattern, '').trim();
              break;
            }
          }
        }

        // Find the SKU mapping
        const mapping = this.findSKUByGloriaFoodItem(gloriaFoodItemName, size);

        if (mapping) {
          processedItems.push({
            originalGloriaFoodItem: item,
            sku: mapping.sku,
            loyverseName: mapping.loyverseName,
            category: mapping.category,
            price: item.price, // Use GloriaFood price instead of mapping file price
            matchType: mapping.matchType,
            size: size,
            gloriaFoodItemName: gloriaFoodItemName,
            status: 'mapped'
          });
        } else {
          processedItems.push({
            originalGloriaFoodItem: item,
            sku: null,
            loyverseName: null,
            category: null,
            price: null,
            matchType: 'no_match',
            size: size,
            gloriaFoodItemName: gloriaFoodItemName,
            status: 'unmapped',
            error: `No SKU mapping found for "${gloriaFoodItemName}"`
          });
        }
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

    return processedItems;
  }

  // Get mapping statistics
  getMappingStats() {
    if (!this.mappingData) return null;

    const stats = {
      totalMappings: this.mappingData.length,
      uniqueGloriaFoodNames: new Set(this.mappingData.map(item => item["Gloria food item name"])).size,
      uniqueSizes: new Set(this.mappingData.map(item => item["Size"])).size,
      categories: new Set(this.mappingData.map(item => item["Category"])).size
    };

    return stats;
  }

  // Reload mapping data (useful for updates)
  reloadMappingData() {
    this.loadMappingData();
    logger.info('Item mapping data reloaded');
  }

  // Generate unique SKU for new items
  generateUniqueSKU() {
    const usedSKUs = new Set(this.mappingData.map(item => item.SKU));
    let sku;
    do {
      sku = `GF_${Math.floor(1000 + Math.random() * 9000)}`;
    } while (usedSKUs.has(sku));
    return sku;
  }

  // Create new item in Loyverse and add to mapping
  async createNewItem(gloriaFoodItem, loyverseAPI) {
    try {
      logger.info(`Creating new item for unmapped GloriaFood item: ${gloriaFoodItem.name}`);
      
      // Extract size from options and calculate correct price
      let size = null;
      let itemName = gloriaFoodItem.name;
      let calculatedPrice = gloriaFoodItem.price; // Start with base price
      
      if (gloriaFoodItem.options && Array.isArray(gloriaFoodItem.options) && gloriaFoodItem.options.length > 0) {
        const sizeOption = gloriaFoodItem.options.find(option => 
          option.group_name === 'Size' || 
          option.type === 'size'
        );
        
        if (sizeOption) {
          size = sizeOption.name;
          itemName = `${gloriaFoodItem.name} ${size}`;
          // Add size price to base price
          calculatedPrice = gloriaFoodItem.price + (sizeOption.price || 0);
        }
      }

      // Generate unique SKU
      const sku = this.generateUniqueSKU();
      
      // Create item data for Loyverse
      const itemData = {
        name: itemName,
        price: calculatedPrice, // Use calculated price (base + size)
        instructions: gloriaFoodItem.instructions || '',
        id: sku // Use SKU as ID for consistency
      };

      // Create item in Loyverse
      const createdItem = await loyverseAPI.createItem(itemData);
      
      // Create mapping entry
      const mappingEntry = {
        Handle: itemName.toLowerCase().replace(/\s+/g, '-'),
        SKU: sku,
        Name: itemName,
        Category: "مشروبات", // Default category
        "Default price": calculatedPrice,
        Cat: "مشروبات",
        "Gloria food item name": gloriaFoodItem.name,
        Size: size || "",
        Price: calculatedPrice
      };

      // Add to mapping data
      this.mappingData.push(mappingEntry);
      
      // Save updated mapping data to file
      await this.saveMappingData();
      
      logger.info(`Successfully created new item: ${itemName} with SKU: ${sku}`);
      
      return {
        sku: sku,
        loyverseName: itemName,
        category: "مشروبات",
        price: calculatedPrice,
        matchType: 'auto_created',
        loyverseItemId: createdItem.id,
        variantId: createdItem.variants[0].variant_id
      };
      
    } catch (error) {
      logger.error(`Failed to create new item for ${gloriaFoodItem.name}:`, error.message);
      throw error;
    }
  }

  // Save mapping data to file
  async saveMappingData() {
    try {
      const possiblePaths = [
        path.join(__dirname, '../../export_items_menu.json'),
        path.join(process.cwd(), 'export_items_menu.json'),
        './export_items_menu.json'
      ];
      
      let mappingFilePath = null;
      for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
          mappingFilePath = testPath;
          break;
        }
      }
      
      if (!mappingFilePath) {
        throw new Error(`Mapping file not found. Tried paths: ${possiblePaths.join(', ')}`);
      }
      
      fs.writeFileSync(mappingFilePath, JSON.stringify(this.mappingData, null, 2), 'utf8');
      logger.info(`Updated mapping file: ${mappingFilePath}`);
      console.log(`Updated mapping file with ${this.mappingData.length} items`);
    } catch (error) {
      logger.error('Failed to save mapping data:', error.message);
      throw error;
    }
  }

  // Process GloriaFood order items with automatic item creation
  async processGloriaFoodOrderItemsWithAutoCreation(gloriaFoodItems, loyverseAPI) {
    const processedItems = [];

    for (const item of gloriaFoodItems) {
      try {
        // Handle special items like delivery fees
        if (item.name === 'DELIVERY_FEE' || item.type === 'delivery_fee') {
          logger.info(`Processing delivery fee: ${item.name} (${item.price} PKR)`);
          processedItems.push({
            originalGloriaFoodItem: item,
            sku: 'DELIVERY_FEE',
            loyverseName: 'Delivery Fee',
            category: 'Delivery',
            price: item.price,
            matchType: 'delivery_fee',
            size: null,
            gloriaFoodItemName: item.name,
            status: 'mapped'
          });
          continue;
        }

        // Extract size from item options or name
        let size = null;
        let gloriaFoodItemName = item.name;

        // First, try to extract size from options array
        if (item.options && Array.isArray(item.options)) {
          const sizeOption = item.options.find(option => 
            option.group_name === 'Size' || 
            option.type === 'size' ||
            ['كبير', 'وسط', 'صغير', 'large', 'medium', 'small'].includes(option.name)
          );
          
          if (sizeOption) {
            size = sizeOption.name;
            logger.info(`Found size in options: "${size}" for item "${item.name}"`);
          }
        }

        // If no size found in options, try to extract from item name
        if (!size) {
          const sizePatterns = ['كبير', 'وسط', 'صغير', 'large', 'medium', 'small'];
          for (const pattern of sizePatterns) {
            if (item.name.includes(pattern)) {
              size = pattern;
              // Remove size from the name for matching
              gloriaFoodItemName = item.name.replace(pattern, '').trim();
              break;
            }
          }
        }

        // Find the SKU mapping (exact match only for auto-creation)
        let mapping = await this.findExactSKUByGloriaFoodItem(gloriaFoodItemName, size, loyverseAPI);

        // If no exact mapping found, create new item
        if (!mapping) {
          logger.info(`No exact mapping found for "${gloriaFoodItemName}" (${size}), creating new item...`);
          mapping = await this.createNewItem(item, loyverseAPI);
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

    return processedItems;
  }
}

module.exports = ItemMappingService;
