require('dotenv').config();
const MongoItemMappingService = require('./services/mongoItemMappingService');
const ReceiptService = require('./services/receiptService');
const logger = require('./utils/logger');

async function testCompleteMongoIntegration() {
  try {
    console.log('🧪 Testing Complete MongoDB Integration...');
    
    const itemMappingService = new MongoItemMappingService();
    const receiptService = new ReceiptService();
    
    // Test 1: Initialize services
    console.log('\n1️⃣ Testing service initialization...');
    await itemMappingService.initialize();
    await receiptService.initialize();
    console.log('✅ Both services initialized successfully');
    
    // Test 2: Get product statistics
    console.log('\n2️⃣ Testing product statistics...');
    const productStats = await itemMappingService.getProductStats();
    console.log('📊 Product Statistics:', productStats);
    
    // Test 3: Get receipt statistics
    console.log('\n3️⃣ Testing receipt statistics...');
    const receiptStats = await receiptService.getReceiptStats();
    console.log('📊 Receipt Statistics:', receiptStats);
    
    // Test 4: Search for existing product
    console.log('\n4️⃣ Testing product search...');
    const searchResult = await itemMappingService.findSKUByGloriaFoodItem('كبسة ابتاون بالدجاج', 'كبير');
    if (searchResult) {
      console.log('✅ Found product:', searchResult);
    } else {
      console.log('ℹ️ No product found for test search');
    }
    
    // Test 5: Get recent receipts
    console.log('\n5️⃣ Testing recent receipts...');
    const recentReceipts = await receiptService.getRecentReceipts(5);
    console.log(`📋 Found ${recentReceipts.length} recent receipts:`);
    recentReceipts.forEach(receipt => {
      console.log(`  - Order: ${receipt.gloriaFoodOrderId}, Status: ${receipt.status}, Total: ${receipt.totalAmount}`);
    });
    
    // Test 6: Test exact product search
    console.log('\n6️⃣ Testing exact product search...');
    const products = await itemMappingService.getAllProducts(3);
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
    
    // Test 7: Test receipt search by order ID
    console.log('\n7️⃣ Testing receipt search...');
    if (recentReceipts.length > 0) {
      const firstReceipt = recentReceipts[0];
      const foundReceipt = await receiptService.findReceiptByOrderId(firstReceipt.gloriaFoodOrderId);
      if (foundReceipt) {
        console.log('✅ Receipt search successful:', {
          orderId: foundReceipt.gloriaFoodOrderId,
          status: foundReceipt.status,
          total: foundReceipt.totalAmount
        });
      } else {
        console.log('❌ Receipt search failed');
      }
    }
    
    console.log('\n🎉 Complete MongoDB Integration Test Completed Successfully!');
    console.log('\n📋 Summary:');
    console.log(`   - Products in database: ${productStats.totalProducts}`);
    console.log(`   - Products with Loyverse mapping: ${productStats.productsWithLoyverse}`);
    console.log(`   - Total receipts: ${receiptStats.totalReceipts}`);
    console.log(`   - Processed receipts: ${receiptStats.processedReceipts}`);
    console.log(`   - Failed receipts: ${receiptStats.failedReceipts}`);
    
  } catch (error) {
    console.error('❌ Complete MongoDB Integration Test Failed:', error.message);
    logger.error('Complete MongoDB Integration Test Failed:', error);
  }
}

// Run the test
testCompleteMongoIntegration();
