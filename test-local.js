// Test script for local development with JSONBin.io
const axios = require('axios');

const testWebhook = async () => {
  try {
    console.log('Testing local webhook with JSONBin.io...');
    
    const response = await axios.post('http://localhost:8080/api/gloriafood/webhook', {
      count: 1,
      orders: [
        {
          id: 999999999,
          type: "pickup",
          client_first_name: "Test",
          client_last_name: "Local",
          client_phone: "+923001234999",
          client_email: "test@example.com",
          total_price: 1900,
          sub_total_price: 1900,
          instructions: "",
          items: [
            {
              id: 999999999,
              name: "كبسة ابتاون بالدجاج",
              price: 1300,
              quantity: 1,
              instructions: "",
              type: "item",
              options: [
                {
                  id: 999999999,
                  name: "وسط",
                  price: 600,
                  group_name: "Size",
                  quantity: 1,
                  type: "size"
                }
              ]
            }
          ]
        }
      ]
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Success!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
};

// Run the test
testWebhook();
