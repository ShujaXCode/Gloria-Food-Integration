const fs = require('fs');
const path = require('path');
const database = require('./config/database');
const Product = require('./models/Product');
const logger = require('./utils/logger');

class ProductSeeder {
  constructor() {
    this.jsonFilePath = path.join(__dirname, 'export_items_menu.json');
    this.stats = {
      total: 0,
      inserted: 0,
      updated: 0,
      errors: 0,
      skipped: 0
    };
  }

  async seed() {
    try {
      console.log('🌱 Starting Product Seeder...');
      logger.info('Starting Product Seeder');

      // Connect to database
      console.log('🔌 Connecting to MongoDB...');
      const connected = await database.connect();
      if (!connected) {
        throw new Error('Failed to connect to database');
      }

      // Wait for connection to be ready
      console.log('⏳ Waiting for database connection to be ready...');
      await new Promise((resolve, reject) => {
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState === 1) {
          resolve();
        } else {
          mongoose.connection.once('open', resolve);
          mongoose.connection.once('error', reject);
          // Timeout after 30 seconds
          setTimeout(() => reject(new Error('Connection timeout')), 30000);
        }
      });
      console.log('✅ Database connection ready');

      // Read JSON file
      console.log('📖 Reading export_items_menu.json...');
      const jsonData = this.readJsonFile();
      
      if (!jsonData || !Array.isArray(jsonData)) {
        throw new Error('Invalid JSON data or empty array');
      }

      this.stats.total = jsonData.length;
      console.log(`📊 Found ${this.stats.total} products to process`);

      // Process each product
      for (let i = 0; i < jsonData.length; i++) {
        const item = jsonData[i];
        await this.processProduct(item, i + 1);
      }

      // Display results
      this.displayResults();

    } catch (error) {
      console.error('❌ Seeder failed:', error.message);
      logger.error('Seeder failed:', error);
      throw error;
    } finally {
      // Disconnect from database
      await database.disconnect();
      console.log('🔌 Database disconnected');
    }
  }

  readJsonFile() {
    try {
      if (!fs.existsSync(this.jsonFilePath)) {
        throw new Error(`JSON file not found: ${this.jsonFilePath}`);
      }

      const fileContent = fs.readFileSync(this.jsonFilePath, 'utf8');
      return JSON.parse(fileContent);
    } catch (error) {
      console.error('❌ Error reading JSON file:', error.message);
      throw error;
    }
  }

  async processProduct(item, index) {
    try {
      // Map JSON fields to Product schema fields
      const productData = {
        handle: item.Handle || null,
        sku: item.SKU,
        name: item.Name,
        category: item.Category || 'مشروبات',
        defaultPrice: item['Default price'],
        cat: item.Cat || null,
        gloriaFoodItemName: item['Gloria food item name'],
        size: item.Size || null,
        price: item.Price
      };

      // Validate required fields
      if (!productData.sku || !productData.name || !productData.gloriaFoodItemName) {
        console.log(`⚠️ Skipping item ${index}: Missing required fields (SKU, Name, or Gloria food item name)`);
        this.stats.skipped++;
        return;
      }

      // Check if product already exists
      const existingProduct = await Product.findOne({ sku: productData.sku });
      
      if (existingProduct) {
        // Update existing product
        Object.assign(existingProduct, productData);
        await existingProduct.save();
        this.stats.updated++;
        console.log(`✅ Updated product ${index}/${this.stats.total}: ${productData.name} (SKU: ${productData.sku})`);
      } else {
        // Create new product
        const newProduct = new Product(productData);
        await newProduct.save();
        this.stats.inserted++;
        console.log(`➕ Inserted product ${index}/${this.stats.total}: ${productData.name} (SKU: ${productData.sku})`);
      }

    } catch (error) {
      console.error(`❌ Error processing product ${index}:`, error.message);
      logger.error(`Error processing product ${index}:`, error);
      this.stats.errors++;
    }
  }

  displayResults() {
    console.log('\n📈 Seeding Results:');
    console.log('==================');
    console.log(`Total items processed: ${this.stats.total}`);
    console.log(`✅ Inserted: ${this.stats.inserted}`);
    console.log(`🔄 Updated: ${this.stats.updated}`);
    console.log(`⚠️ Skipped: ${this.stats.skipped}`);
    console.log(`❌ Errors: ${this.stats.errors}`);
    console.log(`📊 Success rate: ${((this.stats.inserted + this.stats.updated) / this.stats.total * 100).toFixed(2)}%`);
    
    logger.info('Seeding completed', this.stats);
  }

  async clearCollection() {
    try {
      console.log('🗑️ Clearing existing products...');
      const result = await Product.deleteMany({});
      console.log(`✅ Cleared ${result.deletedCount} products`);
      logger.info(`Cleared ${result.deletedCount} products`);
    } catch (error) {
      console.error('❌ Error clearing collection:', error.message);
      throw error;
    }
  }
}

// Main execution
async function main() {
  const seeder = new ProductSeeder();
  
  // Check command line arguments
  const args = process.argv.slice(2);
  const shouldClear = args.includes('--clear') || args.includes('-c');
  
  try {
    if (shouldClear) {
      console.log('⚠️ Clearing existing data before seeding...');
      await seeder.clearCollection();
    }
    
    await seeder.seed();
    console.log('\n🎉 Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n💥 Seeding failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = ProductSeeder;
