require('dotenv').config();
const ReceiptService = require('./services/receiptService');
const LoyverseAPI = require('./utils/loyverseApi');
const logger = require('./utils/logger');

async function testRobustReceiptSystem() {
  try {
    console.log('🧪 Testing Robust Receipt Processing System...');
    
    const receiptService = new ReceiptService();
    const loyverseAPI = new LoyverseAPI();
    
    // Test 1: Initialize services
    console.log('\n1️⃣ Testing service initialization...');
    await receiptService.initialize();
    console.log('✅ Receipt service initialized successfully');
    
    // Test 2: Get receipt statistics
    console.log('\n2️⃣ Testing receipt statistics...');
    const stats = await receiptService.getReceiptStats();
    console.log('📊 Receipt Statistics:', stats);
    
    // Test 3: Test Loyverse API getReceiptById method
    console.log('\n3️⃣ Testing Loyverse getReceiptById method...');
    try {
      // Test with a non-existent receipt
      const nonExistentReceipt = await loyverseAPI.getReceiptById('NON_EXISTENT_123');
      console.log('✅ Non-existent receipt test:', nonExistentReceipt === null ? 'PASSED' : 'FAILED');
    } catch (error) {
      console.log('❌ Loyverse API test failed:', error.message);
    }
    
    // Test 4: Test receipt verification
    console.log('\n4️⃣ Testing receipt verification...');
    const recentReceipts = await receiptService.getRecentReceipts(1);
    if (recentReceipts.length > 0) {
      const testReceipt = recentReceipts[0];
      if (testReceipt.loyverseReceiptNumber) {
        const verification = await receiptService.verifyProcessedReceipt(testReceipt, loyverseAPI);
        console.log('✅ Receipt verification test:', verification.exists ? 'Receipt exists' : 'Receipt not found');
      } else {
        console.log('ℹ️ No Loyverse receipt number to test verification');
      }
    } else {
      console.log('ℹ️ No receipts to test verification');
    }
    
    // Test 5: Test existing receipt handling
    console.log('\n5️⃣ Testing existing receipt handling...');
    if (recentReceipts.length > 0) {
      const testReceipt = recentReceipts[0];
      const mockOrderData = {
        id: testReceipt.gloriaFoodOrderId,
        total: testReceipt.totalAmount,
        items: testReceipt.items || []
      };
      
      const result = await receiptService.handleExistingReceipt(testReceipt, mockOrderData, loyverseAPI);
      console.log('✅ Existing receipt handling test:', result.success ? 'SUCCESS' : 'NEEDS_RETRY');
      console.log('   Status:', result.status || 'unknown');
    } else {
      console.log('ℹ️ No receipts to test existing receipt handling');
    }
    
    // Test 6: Test retry mechanism
    console.log('\n6️⃣ Testing retry mechanism...');
    const failedReceipts = await receiptService.getFailedReceipts();
    if (failedReceipts.length > 0) {
      const testFailedReceipt = failedReceipts[0];
      const mockOrderData = {
        id: testFailedReceipt.gloriaFoodOrderId,
        total: testFailedReceipt.totalAmount,
        items: testFailedReceipt.items || []
      };
      
      try {
        const retryResult = await receiptService.retryFailedReceipt(testFailedReceipt, mockOrderData, loyverseAPI);
        console.log('✅ Retry mechanism test: PASSED');
        console.log('   Attempts:', retryResult.processingAttempts);
        console.log('   Status:', retryResult.status);
      } catch (error) {
        console.log('⚠️ Retry mechanism test: FAILED (expected for max retries)');
        console.log('   Error:', error.message);
      }
    } else {
      console.log('ℹ️ No failed receipts to test retry mechanism');
    }
    
    console.log('\n🎉 Robust Receipt Processing System Test Completed!');
    console.log('\n📋 Summary:');
    console.log(`   - Total receipts: ${stats.totalReceipts}`);
    console.log(`   - Processed receipts: ${stats.processedReceipts}`);
    console.log(`   - Failed receipts: ${stats.failedReceipts}`);
    console.log(`   - Pending receipts: ${stats.pendingReceipts}`);
    console.log(`   - Duplicate receipts: ${stats.duplicateReceipts}`);
    
  } catch (error) {
    console.error('❌ Robust Receipt System Test Failed:', error.message);
    logger.error('Robust Receipt System Test Failed:', error);
  }
}

// Run the test
testRobustReceiptSystem();
