const axios = require('axios');
const fs = require('fs');

// Load environment variables
require('dotenv').config();

class LoyverseCleanPusher {
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

  async getAllLoyverseItems() {
    try {
      console.log('🔍 Fetching all items from Loyverse...');
      const response = await axios.get(`${this.baseURL}/items`, {
        headers: this.getHeaders()
      });
      
      console.log(`📋 Found ${response.data.items.length} items in Loyverse`);
      return response.data.items || [];
    } catch (error) {
      console.error('❌ Error fetching items from Loyverse:', error.response?.data || error.message);
      return [];
    }
  }

  async findItemBySKU(sku, loyverseItems) {
    for (const item of loyverseItems) {
      if (item.variants && item.variants.length > 0) {
        for (const variant of item.variants) {
          if (variant.sku === sku.toString()) {
            return item;
          }
        }
      }
    }
    return null;
  }

  async deleteItem(itemId) {
    try {
      console.log(`🗑️  Deleting item: ${itemId}`);
      await axios.delete(`${this.baseURL}/items/${itemId}`, {
        headers: this.getHeaders()
      });
      console.log(`✅ Deleted item: ${itemId}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to delete item ${itemId}:`, error.response?.data || error.message);
      return false;
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
      return { success: true, item: response.data };
    } catch (error) {
      console.error(`❌ Failed to create ${itemData.Name}:`, error.response?.data || error.message);
      return { success: false, error: error.response?.data || error.message };
    }
  }

  async processItems() {
    try {
      // Load the updated mapping file
      const mappingFilePath = '/Users/macos/Desktop/Upwork lead/export_items_menu.json';
      const mappingData = JSON.parse(fs.readFileSync(mappingFilePath, 'utf8'));
      
      console.log(`📋 Loaded ${mappingData.length} items from mapping file`);
      
      // Get all existing items from Loyverse
      const loyverseItems = await this.getAllLoyverseItems();
      
      console.log('🚀 Starting clean item push to Loyverse...\n');

      const results = {
        total: mappingData.length,
        created: 0,
        skipped: 0,
        failed: 0,
        deleted: 0,
        details: []
      };

      // First, identify items that need to be deleted (duplicate SKUs)
      const itemsToDelete = [];
      const itemsToCreate = [];
      
      for (const item of mappingData) {
        const existingItem = await this.findItemBySKU(item.SKU, loyverseItems);
        
        if (existingItem) {
          // Check if the existing item has the same name
          if (existingItem.item_name === item.Name) {
            console.log(`✅ Item already exists correctly: ${item.Name} (SKU: ${item.SKU})`);
            results.skipped++;
            results.details.push({
              name: item.Name,
              sku: item.SKU,
              action: 'skipped',
              loyverseId: existingItem.id,
              reason: 'Already exists with correct name and SKU'
            });
          } else {
            // Different name, same SKU - need to delete and recreate
            console.log(`⚠️  SKU conflict: ${existingItem.item_name} vs ${item.Name} (SKU: ${item.SKU})`);
            itemsToDelete.push(existingItem);
            itemsToCreate.push(item);
          }
        } else {
          // Item doesn't exist, create it
          itemsToCreate.push(item);
        }
      }

      // Delete conflicting items first
      console.log(`\n🗑️  Deleting ${itemsToDelete.length} conflicting items...`);
      for (const item of itemsToDelete) {
        const deleted = await this.deleteItem(item.id);
        if (deleted) {
          results.deleted++;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Create new items
      console.log(`\n🔄 Creating ${itemsToCreate.length} items...`);
      for (let i = 0; i < itemsToCreate.length; i++) {
        const item = itemsToCreate[i];
        console.log(`\n[${i + 1}/${itemsToCreate.length}] Processing: ${item.Name}`);
        
        const createResult = await this.createItem(item);
        results.details.push({
          name: item.Name,
          sku: item.SKU,
          action: createResult.success ? 'created' : 'failed',
          loyverseId: createResult.item?.id,
          error: createResult.error
        });
        
        if (createResult.success) {
          results.created++;
        } else {
          results.failed++;
        }

        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Print summary
      console.log('\n' + '='.repeat(60));
      console.log('📊 CLEAN PUSH SUMMARY');
      console.log('='.repeat(60));
      console.log(`📋 Total items processed: ${results.total}`);
      console.log(`✅ Created: ${results.created}`);
      console.log(`⏭️  Skipped: ${results.skipped}`);
      console.log(`🗑️  Deleted: ${results.deleted}`);
      console.log(`❌ Failed: ${results.failed}`);
      console.log('='.repeat(60));

      // Save detailed results
      const resultsFile = 'clean-push-results.json';
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
    console.log('🚀 Starting Loyverse Clean Item Push...\n');
    
    const pusher = new LoyverseCleanPusher();
    const results = await pusher.processItems();
    
    console.log('\n🎉 Clean item push completed!');
    
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
