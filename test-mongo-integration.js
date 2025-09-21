require('dotenv').config();
const MongoItemMappingService = require('./services/mongoItemMappingService');
const logger = require('./utils/logger');

async function testMongoIntegration() {
  try {
    console.log('🧪 Testing MongoDB Integration...');
    
    const itemMappingService = new MongoItemMappingService();
    
    // Test 1: Initialize service
    console.log('\n1️⃣ Testing service initialization...');
    await itemMappingService.initialize();
    console.log('✅ Service initialized successfully');
    
    // Test 2: Get product statistics
    console.log('\n2️⃣ Testing product statistics...');
    const stats = await itemMappingService.getProductStats();
    console.log('📊 Product Statistics:', stats);
    
    // Test 3: Search for existing product
    console.log('\n3️⃣ Testing product search...');
    const searchResult = await itemMappingService.findSKUByGloriaFoodItem('كبسة ابتاون بالدجاج', 'كبير');
    if (searchResult) {
      console.log('✅ Found product:', searchResult);
    } else {
      console.log('ℹ️ No product found for test search');
    }
    
    // Test 4: Get all products (first 5)
    console.log('\n4️⃣ Testing get all products...');
    const products = await itemMappingService.getAllProducts(5);
    console.log(`📋 Found ${products.length} products:`);
    products.forEach(product => {
      console.log(`  - SKU: ${product.sku}, Name: ${product.name}, GloriaFood: ${product.gloriaFoodItemName}`);
    });
    
    // Test 5: Test exact search
    console.log('\n5️⃣ Testing exact search...');
    if (products.length > 0) {
      const firstProduct = products[0];
      const exactResult = await itemMappingService.findExactSKUByGloriaFoodItem(
        firstProduct.gloriaFoodItemName, 
        firstProduct.size
      );
      if (exactResult) {
        console.log('✅ Exact search successful:', exactResult);
      } else {
        console.log('❌ Exact search failed');
      }
    }
    
    console.log('\n🎉 MongoDB Integration Test Completed Successfully!');
    
  } catch (error) {
    console.error('❌ MongoDB Integration Test Failed:', error.message);
    logger.error('MongoDB Integration Test Failed:', error);
  }
}

// Run the test
testMongoIntegration();
