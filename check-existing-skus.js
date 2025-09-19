const axios = require('axios');

// Load environment variables
require('dotenv').config();

class SKUChecker {
  constructor() {
    this.baseURL = 'https://api.loyverse.com/v1.0';
    this.accessToken = process.env.LOYVERSE_ACCESS_TOKEN;
    this.locationId = process.env.LOYVERSE_LOCATION_ID;
  }

  getHeaders() {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };
  }

  async checkSKUs() {
    try {
      console.log('🔍 Fetching all items from Loyverse...');
      const response = await axios.get(`${this.baseURL}/items`, {
        headers: this.getHeaders()
      });
      
      const items = response.data.items || [];
      console.log(`📋 Found ${items.length} items in Loyverse\n`);

      // Check for the specific SKUs we're trying to create
      const targetSKUs = ['10048', '10047', '10046', '10045'];
      
      console.log('🔍 Checking for existing SKUs:');
      console.log('='.repeat(60));
      
      for (const sku of targetSKUs) {
        console.log(`\n🔍 Searching for SKU: ${sku}`);
        let found = false;
        
        for (const item of items) {
          if (item.variants && item.variants.length > 0) {
            for (const variant of item.variants) {
              if (variant.sku === sku) {
                console.log(`✅ Found: ${item.item_name} (ID: ${item.id})`);
                console.log(`   Variant ID: ${variant.variant_id}`);
                console.log(`   Price: ${variant.default_price}`);
                found = true;
                break;
              }
            }
          }
          if (found) break;
        }
        
        if (!found) {
          console.log(`❌ SKU ${sku} not found in Loyverse`);
        }
      }
      
      console.log('\n' + '='.repeat(60));
      console.log('📊 All items with their SKUs:');
      console.log('='.repeat(60));
      
      for (const item of items) {
        if (item.variants && item.variants.length > 0) {
          for (const variant of item.variants) {
            console.log(`SKU: ${variant.sku} | ${item.item_name} | Price: ${variant.default_price}`);
          }
        }
      }
      
    } catch (error) {
      console.error('❌ Error:', error.response?.data || error.message);
    }
  }
}

// Main execution
async function main() {
  const checker = new SKUChecker();
  await checker.checkSKUs();
}

main();
