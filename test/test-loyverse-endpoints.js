const axios = require('axios');

const accessToken = 'f66d64e338b64aa889483446ecc99cda';

// Test different possible base URLs and endpoints
const testConfigs = [
  // Base URL variations
  {
    baseURL: 'https://api.loyverse.com',
    endpoints: ['/locations', '/v1/locations', '/stores', '/business/locations']
  },
  {
    baseURL: 'https://api.loyverse.com/v1',
    endpoints: ['/locations', '/stores', '/business/locations']
  },
  {
    baseURL: 'https://loyverse.com/api',
    endpoints: ['/locations', '/v1/locations', '/stores', '/business/locations']
  },
  {
    baseURL: 'https://loyverse.com/api/v1',
    endpoints: ['/locations', '/stores', '/business/locations']
  }
];

async function testLoyverseEndpoints() {
  console.log('🔍 **Testing Loyverse API Endpoints**\n');
  console.log(`Using Access Token: ${accessToken}\n`);

  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  };

  let workingConfig = null;

  for (const config of testConfigs) {
    console.log(`Testing Base URL: ${config.baseURL}`);
    
    for (const endpoint of config.endpoints) {
      const fullURL = `${config.baseURL}${endpoint}`;
      
      try {
        console.log(`  Testing: ${endpoint}`);
        
        const response = await axios.get(fullURL, { headers });
        
        console.log(`  ✅ SUCCESS: ${endpoint}`);
        console.log(`     Status: ${response.status}`);
        console.log(`     Data: ${JSON.stringify(response.data).substring(0, 100)}...`);
        
        workingConfig = {
          baseURL: config.baseURL,
          endpoint: endpoint,
          response: response.data
        };
        
        break; // Found working endpoint for this base URL
        
      } catch (error) {
        if (error.response) {
          console.log(`  ❌ FAILED: ${endpoint} - ${error.response.status} ${error.response.statusText}`);
        } else {
          console.log(`  ❌ FAILED: ${endpoint} - ${error.message}`);
        }
      }
    }
    
    if (workingConfig) {
      console.log(`\n🎉 **Found Working Configuration!**`);
      console.log(`Base URL: ${workingConfig.baseURL}`);
      console.log(`Endpoint: ${workingConfig.endpoint}`);
      break;
    }
    
    console.log('');
  }

  if (!workingConfig) {
    console.log('\n❌ **No working endpoints found!**');
    console.log('Possible issues:');
    console.log('1. Access token is invalid or expired');
    console.log('2. API endpoints have changed');
    console.log('3. Account needs API access enabled');
    console.log('4. Different API structure');
  } else {
    console.log('\n🚀 **Next Steps:**');
    console.log('1. Update your .env file with the working base URL');
    console.log('2. Test the integration again');
    console.log('3. Check if you need to create a location first');
  }

  return workingConfig;
}

// Test other endpoints if we found a working base URL
async function testAdditionalEndpoints(baseURL, workingEndpoint) {
  console.log('\n🔍 **Testing Additional Endpoints**\n');
  
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  };

  const endpoints = [
    '/items', '/v1/items', '/products', '/business/items',
    '/customers', '/v1/customers', '/business/customers',
    '/receipts', '/v1/receipts', '/orders', '/business/receipts'
  ];

  const workingEndpoints = {};

  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(`${baseURL}${endpoint}`, { headers });
      console.log(`✅ ${endpoint} - Status: ${response.status}`);
      workingEndpoints[endpoint] = true;
    } catch (error) {
      if (error.response?.status === 404) {
        console.log(`❌ ${endpoint} - Not Found`);
      } else {
        console.log(`❌ ${endpoint} - Error: ${error.response?.status || error.message}`);
      }
    }
  }

  return workingEndpoints;
}

// Run the tests
async function runTests() {
  try {
    const workingConfig = await testLoyverseEndpoints();
    
    if (workingConfig) {
      await testAdditionalEndpoints(workingConfig.baseURL, workingConfig.endpoint);
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  runTests();
}

module.exports = { testLoyverseEndpoints, testAdditionalEndpoints };
