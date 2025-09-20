const fs = require('fs');
const path = require('path');
const axios = require('axios');
const logger = require('../utils/logger');
const LoyverseAPI = require('../utils/loyverseApi');
const apiConfig = require('../config/apiConfig');

class ItemMappingService {
  constructor() {
    this.mappingData = null;
    this.isLoading = false;
    this.loadMappingData();
  }

  // Load the mapping data from JSONBin.io first, fallback to local file
  async loadMappingData() {
    try {
      // First try to load from JSONBin.io with a shorter timeout
      console.log('🔄 Attempting to load mapping data from JSONBin.io...');
      
      // Use Promise.race to implement a shorter timeout for faster fallback
      const jsonbinPromise = this.loadFromJSONBin();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('JSONBin.io timeout')), 15000)
      );
      
      const jsonbinData = await Promise.race([jsonbinPromise, timeoutPromise]);
      
      if (jsonbinData && jsonbinData.length > 0) {
        this.mappingData = jsonbinData;
        logger.info(`Loaded ${this.mappingData.length} item mappings from JSONBin.io`);
        console.log(`✅ Loaded ${this.mappingData.length} item mappings from JSONBin.io`);
        return;
      }
      
      // Fallback to local file
      console.log('⚠️  JSONBin.io failed, falling back to local file...');
      this.loadFromLocalFile();
      
    } catch (error) {
      logger.error('Failed to load item mapping data:', error.message);
      console.error('Failed to load item mapping data:', error.message);
      
      // Fallback to local file
      console.log('⚠️  Error loading from JSONBin.io, falling back to local file...');
      this.loadFromLocalFile();
    }
  }

  // Load mapping data from JSONBin.io
  async loadFromJSONBin() {
    try {
      const { jsonbin } = apiConfig;
      
      if (!jsonbin.apiKey || !jsonbin.binId) {
        throw new Error('JSONBin.io credentials not configured');
      }

      const response = await axios.get(`${jsonbin.baseURL}/b/${jsonbin.binId}/latest`, {
        headers: {
          'X-Master-Key': jsonbin.apiKey,
          'X-Access-Key': jsonbin.accessKey
        },
        timeout: 30000 // 30 second timeout
      });

      if (response.data && response.data.record) {
        console.log('✅ Successfully fetched data from JSONBin.io');
        return response.data.record;
      } else {
        throw new Error('No data found in JSONBin.io response');
      }
    } catch (error) {
      console.error('❌ Failed to load from JSONBin.io:', error.message);
      throw error;
    }
  }

  // Load mapping data from local file (fallback)
  async loadFromLocalFile() {
    try {
      // If JSONBin.io credentials are available, use external storage
      if (process.env.JSONBIN_ID && process.env.JSONBIN_API_KEY) {
        console.log('Using JSONBin.io for mapping data storage');
        await this.loadFromExternalStorage();
        return;
      }
      
      // Fallback to local file if no JSONBin.io credentials
      console.log('JSONBin.io credentials not found, using local file');
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
      console.log(`✅ Loaded ${this.mappingData.length} item mappings from local file`);
    } catch (error) {
      logger.error('Failed to load item mapping data from local file:', error.message);
      console.error('Failed to load item mapping data from local file:', error.message);
      this.mappingData = [];
    }
  }

  // Load mapping data from external storage (JSONBin.io)
  async loadFromExternalStorage() {
    try {
      const jsonbinId = process.env.JSONBIN_ID || 'your-jsonbin-id';
      const jsonbinApiKey = process.env.JSONBIN_API_KEY || 'your-api-key';
      
      if (!jsonbinId || !jsonbinApiKey) {
        console.log('JSONBin credentials not set, using empty mapping data');
        this.mappingData = [];
        return;
      }
      
      const response = await axios.get(`https://api.jsonbin.io/v3/b/${jsonbinId}/latest`, {
        headers: {
          'X-Master-Key': jsonbinApiKey
        }
      });
      
      this.mappingData = response.data.record || [];
      logger.info(`Loaded ${this.mappingData.length} item mappings from external storage`);
      console.log(`Loaded ${this.mappingData.length} item mappings from external storage`);
    } catch (error) {
      logger.error('Failed to load from external storage:', error.message);
      console.error('Failed to load from external storage:', error.message);
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
    // Generate a truly unique SKU using timestamp and random number
    // This ensures uniqueness even in read-only environments
    const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `GF_${timestamp}${random}`;
  }

  // Create new item in Loyverse and add to mapping
  async createNewItem(gloriaFoodItem, loyverseAPI) {
    try {
      logger.info(`Creating new item for unmapped GloriaFood item: ${gloriaFoodItem.name}`);
      
      // Extract size from options and calculate correct price
      let size = null;
      let itemName = gloriaFoodItem.name;
      let calculatedPrice = gloriaFoodItem.price; // Start with base price
      
      // Handle Arabic text in production (Vercel) - use fallback English name
      if (process.env.NODE_ENV === 'production' && /[\u0600-\u06FF]/.test(itemName)) {
        console.log('Arabic text detected in production, using fallback English name');
        itemName = `Arabic Item ${gloriaFoodItem.id}`;
      }
      
      if (gloriaFoodItem.options && Array.isArray(gloriaFoodItem.options) && gloriaFoodItem.options.length > 0) {
        const sizeOption = gloriaFoodItem.options.find(option => 
          option.group_name === 'Size' || 
          option.type === 'size'
        );
        
        if (sizeOption) {
          size = sizeOption.name;
          // Handle Arabic text in size option for production
          if (process.env.NODE_ENV === 'production' && /[\u0600-\u06FF]/.test(size)) {
            console.log('Arabic text detected in size option in production, using fallback English name');
            size = 'Large';
          }
          itemName = `${itemName} ${size}`;
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
      console.log('Creating item in Loyverse with data:', JSON.stringify(itemData, null, 2));
      const createdItem = await loyverseAPI.createItem(itemData);
      console.log('Item created successfully:', JSON.stringify(createdItem, null, 2));
      
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
      
      // Save the mapping data (to external storage in production, file in development)
      await this.saveMappingData();
      logger.info(`Successfully created new item: ${itemName} with SKU: ${sku}`);
      
      console.log('Created item response:', JSON.stringify(createdItem, null, 2));
      
      if (!createdItem.variants || createdItem.variants.length === 0) {
        throw new Error('Created item has no variants');
      }
      
      const variantId = createdItem.variants[0].variant_id;
      console.log('Using variant ID:', variantId);
      
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

  // Save mapping data to JSONBin.io and local file
  async saveMappingData() {
    try {
      // First try to save to JSONBin.io
      console.log('🔄 Attempting to save mapping data to JSONBin.io...');
      const jsonbinSuccess = await this.saveToJSONBin();
      
      if (jsonbinSuccess) {
        console.log('✅ Successfully saved to JSONBin.io');
      } else {
        console.log('⚠️  Failed to save to JSONBin.io');
      }
      
      // Try to save to local file as backup (optional, don't fail if it doesn't work)
      try {
        this.saveToLocalFile();
      } catch (localError) {
        console.log('⚠️  Local file save failed (expected in Vercel):', localError.message);
        // Don't throw - this is expected in Vercel's read-only environment
      }
      
    } catch (error) {
      logger.error('Failed to save mapping data:', error.message);
      console.error('Failed to save mapping data:', error.message);
      
      // Try local file as last resort (optional)
      try {
        this.saveToLocalFile();
      } catch (localError) {
        console.log('⚠️  Local file save also failed:', localError.message);
        // Don't throw - this is expected in Vercel's read-only environment
      }
    }
  }

  // Save mapping data to JSONBin.io
  async saveToJSONBin() {
    try {
      const { jsonbin } = apiConfig;
      
      if (!jsonbin.apiKey || !jsonbin.binId) {
        throw new Error('JSONBin.io credentials not configured');
      }

      const response = await axios.put(`${jsonbin.baseURL}/b/${jsonbin.binId}`, this.mappingData, {
        headers: {
          'X-Master-Key': jsonbin.apiKey,
          'X-Access-Key': jsonbin.accessKey,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      });

      if (response.data) {
        logger.info(`Updated JSONBin.io with ${this.mappingData.length} items`);
        console.log('✅ JSONBin.io save successful');
        return true;
      } else {
        throw new Error('JSONBin.io save failed - no response data');
      }
    } catch (error) {
      console.error('❌ Failed to save to JSONBin.io:', error.message);
      return false;
    }
  }

  // Save mapping data to local file (fallback)
  saveToLocalFile() {
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
      console.log(`✅ Updated local mapping file with ${this.mappingData.length} items`);
    } catch (error) {
      logger.error('Failed to save mapping data to local file:', error.message);
      throw error;
    }
  }

  // Save mapping data to external storage (JSONBin.io)
  async saveToExternalStorage() {
    try {
      const jsonbinId = process.env.JSONBIN_ID || 'your-jsonbin-id';
      const jsonbinApiKey = process.env.JSONBIN_API_KEY || 'your-api-key';
      
      if (!jsonbinId || !jsonbinApiKey) {
        console.log('JSONBin credentials not set, skipping save to external storage');
        return;
      }
      
      const response = await axios.put(`https://api.jsonbin.io/v3/b/${jsonbinId}`, this.mappingData, {
        headers: {
          'X-Master-Key': jsonbinApiKey,
          'Content-Type': 'application/json'
        }
      });
      
      logger.info(`Saved ${this.mappingData.length} item mappings to external storage`);
      console.log(`Saved ${this.mappingData.length} item mappings to external storage`);
    } catch (error) {
      logger.error('Failed to save to external storage:', error.message);
      console.error('Failed to save to external storage:', error.message);
      // Don't throw error - just log it, as this is not critical for the main flow
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
          console.log('About to create new item for:', JSON.stringify(item, null, 2));
          mapping = await this.createNewItem(item, loyverseAPI);
          console.log('New item mapping created:', JSON.stringify(mapping, null, 2));
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
