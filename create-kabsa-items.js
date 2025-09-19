const axios = require('axios');

// Load environment variables
require('dotenv').config();

class KabsaItemCreator {
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

  async createKabsaItem(name, sku, price) {
    try {
      console.log(`🔄 Creating: ${name} (SKU: ${sku}, Price: ${price})`);
      
      const itemPayload = {
        item_name: name,
        description: name,
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
            sku: sku.toString(),
            cost: 0, // Set cost to 0 as requested
            default_pricing_type: "FIXED",
            default_price: price
          }
        ]
      };

      const response = await axios.post(`${this.baseURL}/items`, itemPayload, {
        headers: this.getHeaders()
      });

      console.log(`✅ Created: ${name} (ID: ${response.data.id})`);
      return { success: true, item: response.data };
    } catch (error) {
      console.error(`❌ Failed to create ${name}:`, error.response?.data || error.message);
      return { success: false, error: error.response?.data || error.message };
    }
  }

  async createAllKabsaItems() {
    const kabsaItems = [
      {
        name: "كبسة ابتاون دجاج كبير",
        sku: "10048",
        price: 2500
      },
      {
        name: "كبسة ابتاون دجاج وسط", 
        sku: "10047",
        price: 1900
      },
      {
        name: "كبسة ابتاون دجاج صغبر",
        sku: "10046", 
        price: 1300
      },
      {
        name: "نودلز كبسة ابتاون كبير",
        sku: "10045",
        price: 2000
      }
    ];

    console.log('🚀 Creating كبسة ابتاون items...\n');

    const results = {
      created: 0,
      failed: 0,
      details: []
    };

    for (let i = 0; i < kabsaItems.length; i++) {
      const item = kabsaItems[i];
      console.log(`[${i + 1}/${kabsaItems.length}] Processing: ${item.name}`);
      
      const result = await this.createKabsaItem(item.name, item.sku, item.price);
      
      results.details.push({
        name: item.name,
        sku: item.sku,
        price: item.price,
        success: result.success,
        loyverseId: result.item?.id,
        error: result.error
      });
      
      if (result.success) {
        results.created++;
      } else {
        results.failed++;
      }

      // Add delay between requests
      if (i < kabsaItems.length - 1) {
        console.log('⏳ Waiting 2 seconds...\n');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 KABSA ITEMS CREATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Created: ${results.created}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log('='.repeat(60));

    return results;
  }
}

// Main execution
async function main() {
  try {
    console.log('🚀 Starting كبسة ابتاون Items Creation...\n');
    
    const creator = new KabsaItemCreator();
    const results = await creator.createAllKabsaItems();
    
    if (results.failed > 0) {
      console.log(`\n⚠️  ${results.failed} items failed to create.`);
      process.exit(1);
    } else {
      console.log('\n🎉 All كبسة ابتاون items created successfully!');
      process.exit(0);
    }
  } catch (error) {
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
  }
}

main();
