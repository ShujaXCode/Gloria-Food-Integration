const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

// Test data for a sample order
const testOrder = {
  id: 'TEST-ORDER-001',
  customer: {
    name: 'John Smith',
    phone: '+1234567890',
    email: 'john.smith@example.com',
    address: '123 Main Street, Anytown, USA'
  },
  items: [
    {
      name: 'Margherita Pizza',
      quantity: 1,
      unit_price: 18.99,
      total_price: 18.99,
      modifiers: ['Extra Cheese', 'Thin Crust']
    },
    {
      name: 'Caesar Salad',
      quantity: 1,
      unit_price: 12.99,
      total_price: 12.99,
      modifiers: ['No Croutons']
    }
  ],
  subtotal: 31.98,
  tax: 2.88,
  deliveryFee: 3.00,
  total: 37.86,
  order_type: 'delivery',
  notes: 'Please deliver to back door. Ring doorbell twice.',
  paymentMethod: 'credit_card',
  source: 'gloriafood'
};

async function runTests() {
  console.log('🧪 Starting GloriaFood-Loyverse Integration Tests\n');
  
  try {
    // Test 1: Health Check
    console.log('1️⃣ Testing Health Check...');
    const healthResponse = await axios.get(`${BASE_URL}/health`);
    console.log('✅ Health Check:', healthResponse.data.status);
    
    // Test 2: System Status
    console.log('\n2️⃣ Testing System Status...');
    const statusResponse = await axios.get(`${BASE_URL}/api/dashboard/status`);
    console.log('✅ System Status:', statusResponse.data.data.environment);
    
    // Test 3: Configuration Check
    console.log('\n3️⃣ Testing Configuration...');
    const configResponse = await axios.get(`${BASE_URL}/api/dashboard/config`);
    const config = configResponse.data.data;
    console.log('✅ GloriaFood configured:', config.gloriafood.apiKey !== 'Not configured');
    console.log('✅ Loyverse configured:', config.loyverse.accessToken !== 'Not configured');
    
    // Test 4: Test Webhook
    console.log('\n4️⃣ Testing GloriaFood Webhook...');
    const webhookResponse = await axios.post(`${BASE_URL}/api/gloriafood/test-webhook`);
    console.log('✅ Test Webhook sent:', webhookResponse.data.message);
    
    // Test 5: Manual Order Processing
    console.log('\n5️⃣ Testing Manual Order Processing...');
    const processResponse = await axios.post(`${BASE_URL}/api/integration/process-order`, testOrder);
    console.log('✅ Order Processing:', processResponse.data.message);
    
    // Test 6: Check Order Status
    console.log('\n6️⃣ Testing Order Status Check...');
    const statusCheckResponse = await axios.get(`${BASE_URL}/api/integration/order-status/${testOrder.id}`);
    console.log('✅ Order Status:', statusCheckResponse.data.data.status);
    
    // Test 7: Get All Orders Status
    console.log('\n7️⃣ Testing All Orders Status...');
    const allOrdersResponse = await axios.get(`${BASE_URL}/api/integration/all-orders-status`);
    console.log('✅ Total Orders:', allOrdersResponse.data.count);
    
    // Test 8: Dashboard Logs
    console.log('\n8️⃣ Testing Dashboard Logs...');
    const logsResponse = await axios.get(`${BASE_URL}/api/dashboard/logs?limit=5`);
    console.log('✅ Recent Logs:', logsResponse.data.count, 'entries');
    
    // Test 9: API Endpoints Info
    console.log('\n9️⃣ Testing API Endpoints Info...');
    const endpointsResponse = await axios.get(`${BASE_URL}/api/dashboard/endpoints`);
    console.log('✅ Endpoints documented:', Object.keys(endpointsResponse.data.data).length, 'categories');
    
    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📊 Test Summary:');
    console.log('   - Health Check: ✅');
    console.log('   - System Status: ✅');
    console.log('   - Configuration: ✅');
    console.log('   - Webhook Test: ✅');
    console.log('   - Order Processing: ✅');
    console.log('   - Status Tracking: ✅');
    console.log('   - Dashboard: ✅');
    console.log('   - API Documentation: ✅');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests, testOrder };
