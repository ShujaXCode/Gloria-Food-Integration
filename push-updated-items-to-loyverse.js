const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

class LoyverseItemPusher {
  constructor() {
    this.baseURL = 'https://api.loyverse.com/v1.0';
    this.accessToken = process.env.LOYVERSE_ACCESS_TOKEN;
    this.locationId = process.env.LOYVERSE_LOCATION_ID;
    
    if (!this.accessToken) {
      console.error('❌ LOYVERSE_ACCESS_TOKEN not found in environment variables');
      process.exit(1);
    }
    
    if (!this.locationId) {
      console.error('❌ LOYVERSE_LOCATION_ID not found in environment variables');
      process.exit(1);
    }
    
    console.log('✅ Loyverse API initialized');
    console.log(`📍 Location ID: ${this.locationId}`);
  }

  getHeaders() {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };
  }

  async findExistingItem(sku) {
    try {
      // Fetch all items and search locally for the SKU
      const response = await axios.get(`${this.baseURL}/items`, {
        headers: this.getHeaders()
      });

      if (response.data && response.data.items && response.data.items.length > 0) {
        for (const item of response.data.items) {
          if (item.variants && item.variants.length > 0) {
            for (const variant of item.variants) {
              if (variant.sku === sku.toString()) {
                return item;
              }
            }
          }
        }
      }
      return null;
    } catch (error) {
      console.error(`❌ Error searching for item with SKU ${sku}:`, error.response?.data || error.message);
      return null;
    }
  }

  async createItem(itemData) {
    try {
      console.log(`🔄 Creating item: ${itemData.Name} (SKU: ${itemData.SKU})`);
      
      const itemPayload = {
        item_name: itemData.Name,
        description: itemData.Name,
        category_id: null,
        track_stock: false,
        sold_by_weight: false,
        is_composite: false,
        use_production: false,
        primary_supplier_id: null,
        tax_ids: [],
        modifiers_ids: [],
        form: "SQUARE",
        color: "GREY",
        variants: [
          {
            sku: itemData.SKU.toString(),
            cost: 0, // Set cost to 0 as requested
            default_pricing_type: "FIXED",
            default_price: itemData["Default price"]
          }
        ]
      };

      const response = await axios.post(`${this.baseURL}/items`, itemPayload, {
        headers: this.getHeaders()
      });

      console.log(`✅ Created: ${itemData.Name} (ID: ${response.data.id})`);
      return { success: true, item: response.data, action: 'created' };
    } catch (error) {
      console.error(`❌ Failed to create ${itemData.Name}:`, error.response?.data || error.message);
      return { success: false, error: error.response?.data || error.message, action: 'failed' };
    }
  }

  async updateItem(itemId, itemData) {
    try {
      console.log(`🔄 Updating item: ${itemData.Name} (SKU: ${itemData.SKU})`);
      
      const updatePayload = {
        item_name: itemData.Name,
        description: itemData.Name
      };

      const response = await axios.put(`${this.baseURL}/items/${itemId}`, updatePayload, {
        headers: this.getHeaders()
      });

      console.log(`✅ Updated: ${itemData.Name} (ID: ${itemId})`);
      return { success: true, item: response.data, action: 'updated' };
    } catch (error) {
      console.error(`❌ Failed to update ${itemData.Name}:`, error.response?.data || error.message);
      return { success: false, error: error.response?.data || error.message, action: 'failed' };
    }
  }

  async processItems() {
    try {
      // Load the updated mapping file
      const mappingFilePath = '/Users/macos/Desktop/Upwork lead/export_items_menu.json';
      const mappingData = JSON.parse(fs.readFileSync(mappingFilePath, 'utf8'));
      
      console.log(`📋 Loaded ${mappingData.length} items from mapping file`);
      console.log('🚀 Starting item push to Loyverse...\n');

      const results = {
        total: mappingData.length,
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        details: []
      };

      for (let i = 0; i < mappingData.length; i++) {
        const item = mappingData[i];
        console.log(`\n[${i + 1}/${mappingData.length}] Processing: ${item.Name}`);
        
        // Check if item already exists
        const existingItem = await this.findExistingItem(item.SKU);
        
        if (existingItem) {
          console.log(`⚠️  Item already exists: ${existingItem.item_name} (ID: ${existingItem.id})`);
          
          // Update the existing item
          const updateResult = await this.updateItem(existingItem.id, item);
          results.details.push({
            name: item.Name,
            sku: item.SKU,
            action: updateResult.action,
            loyverseId: existingItem.id,
            error: updateResult.error
          });
          
          if (updateResult.success) {
            results.updated++;
          } else {
            results.failed++;
          }
        } else {
          // Create new item
          const createResult = await this.createItem(item);
          results.details.push({
            name: item.Name,
            sku: item.SKU,
            action: createResult.action,
            loyverseId: createResult.item?.id,
            error: createResult.error
          });
          
          if (createResult.success) {
            results.created++;
          } else {
            results.failed++;
          }
        }

        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Print summary
      console.log('\n' + '='.repeat(60));
      console.log('📊 PUSH SUMMARY');
      console.log('='.repeat(60));
      console.log(`📋 Total items processed: ${results.total}`);
      console.log(`✅ Created: ${results.created}`);
      console.log(`🔄 Updated: ${results.updated}`);
      console.log(`❌ Failed: ${results.failed}`);
      console.log('='.repeat(60));

      // Save detailed results
      const resultsFile = 'push-results.json';
      fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
      console.log(`📄 Detailed results saved to: ${resultsFile}`);

      return results;
    } catch (error) {
      console.error('❌ Error processing items:', error.message);
      throw error;
    }
  }
}

// Main execution
async function main() {
  try {
    console.log('🚀 Starting Loyverse Item Push...\n');
    
    const pusher = new LoyverseItemPusher();
    const results = await pusher.processItems();
    
    console.log('\n🎉 Item push completed!');
    
    if (results.failed > 0) {
      console.log(`⚠️  ${results.failed} items failed. Check the results file for details.`);
      process.exit(1);
    } else {
      console.log('✅ All items processed successfully!');
      process.exit(0);
    }
  } catch (error) {
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
  }
}

// Run the script
main();