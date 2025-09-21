require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Product = require('./models/Product');

// Simple seeder without clearing collection
async function seedProducts() {
  try {
    console.log('🌱 Starting Simple Product Seeder...');
    
    // Connect directly to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    
    // Try to get MongoDB URI from environment or use default
    const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://writeshuja46:SHuja4646@cluster0.ac7ag.mongodb.net/?retryWrites=true&w=majority';
    
    console.log('🔗 Using MongoDB URI:', mongoUri.replace(/\/\/.*@/, '//***:***@')); // Hide credentials in log
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
    });
    
    console.log('✅ Connected to MongoDB');
    
    // Read JSON file
    console.log('📖 Reading export_items_menu.json...');
    const jsonData = JSON.parse(fs.readFileSync(path.join(__dirname, 'export_items_menu.json'), 'utf8'));
    
    console.log(`📊 Found ${jsonData.length} products to insert`);
    
    // Insert products one by one
    let inserted = 0;
    let errors = 0;
    
    for (let i = 0; i < jsonData.length; i++) {
      const item = jsonData[i];
      
      try {
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
        
        // Skip if missing required fields
        if (!productData.sku || !productData.name || !productData.gloriaFoodItemName) {
          console.log(`⚠️ Skipping item ${i + 1}: Missing required fields`);
          continue;
        }
        
        const product = new Product(productData);
        await product.save();
        inserted++;
        
        if ((i + 1) % 10 === 0) {
          console.log(`📝 Processed ${i + 1}/${jsonData.length} items...`);
        }
        
      } catch (error) {
        console.error(`❌ Error inserting item ${i + 1}:`, error.message);
        errors++;
      }
    }
    
    console.log('\n📈 Results:');
    console.log(`✅ Inserted: ${inserted}`);
    console.log(`❌ Errors: ${errors}`);
    console.log(`📊 Success rate: ${(inserted / jsonData.length * 100).toFixed(2)}%`);
    
  } catch (error) {
    console.error('💥 Seeding failed:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the seeder
seedProducts();
