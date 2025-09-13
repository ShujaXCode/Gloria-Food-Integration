const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

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

  // Find SKU by GloriaFood item name and size
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
            price: mapping.price,
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
}

module.exports = ItemMappingService;
