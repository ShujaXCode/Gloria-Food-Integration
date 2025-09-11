# GloriaFood-Loyverse Integration

A Node.js/Express application that automatically syncs online orders from GloriaFood to Loyverse POS, eliminating the need for manual order entry.

## 🚀 Features

- **Real-time Order Sync**: Automatically processes incoming orders from GloriaFood webhooks
- **Customer Management**: Creates or finds customers in Loyverse automatically
- **Order Processing**: Converts GloriaFood orders to Loyverse receipts with full details
- **Item Mapping**: Finds existing items in Loyverse by name (no new item creation)
- **Automatic Printing**: Prints receipts automatically after creation
- **Error Handling**: Comprehensive error handling with detailed logging
- **Security**: Webhook signature verification and rate limiting

## 📋 Prerequisites

- Node.js 16.0.0 or higher
- GloriaFood account with API access
- Loyverse account with API access
- Valid API keys and credentials

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/ShujaXCode/Gloria-Food-Integration.git
   cd Gloria-Food-Integration
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` file with your actual API credentials:
   ```env
   # GloriaFood API Configuration
   GLORIAFOOD_RESTAURANT_TOKEN=your_restaurant_token_here
   GLORIAFOOD_AUTHENTICATE_KEY=your_authenticate_key_here
   GLORIAFOOD_WEBHOOK_SECRET=your_webhook_secret_here
   GLORIAFOOD_MASTER_KEY=your_master_key_here
   GLORIAFOOD_RESTAURANT_ID=your_restaurant_id_here

   # Loyverse API Configuration
   LOYVERSE_ACCESS_TOKEN=your_loyverse_access_token_here
   LOYVERSE_LOCATION_ID=your_location_id_here

   # Server Configuration
   NODE_ENV=production
   PORT=3000
   ```

4. **Start the application**
   ```bash
   # Development mode with auto-restart
   npm run dev
   
   # Production mode
   npm start
   ```

## 🔧 Configuration

### GloriaFood Setup

1. **Get API Credentials**: Obtain your credentials from GloriaFood dashboard
2. **Configure Webhook**: Set up webhook URL in GloriaFood to point to:
   ```
   https://your-domain.com/api/gloriafood/webhook
   ```
3. **Set Webhook Secret**: Configure a secret for webhook signature verification

### Loyverse Setup

1. **Get Access Token**: Generate an access token from Loyverse dashboard
2. **Get Location ID**: Note your location ID where orders should be created
3. **Create Menu Items**: Ensure your menu items exist in Loyverse (items are matched by name)

## 📡 API Endpoints

### Health Check
- `GET /health` - Server health status

### GloriaFood Integration
- `POST /api/gloriafood/webhook` - Webhook endpoint for incoming orders
- `GET /api/gloriafood/orders/:orderId` - Get order details from GloriaFood
- `GET /api/gloriafood/menu` - Get menu items from GloriaFood
- `POST /api/gloriafood/test-webhook` - Send test webhook data

### Integration
- `POST /api/integration/create-loyverse-receipt` - Create receipt from GloriaFood payload
- `GET /api/integration/status` - Get integration status

## 🧪 Testing

### Test Webhook
```bash
curl -X POST http://localhost:3000/api/gloriafood/test-webhook
```

### Test Receipt Creation
```bash
curl -X POST http://localhost:3000/api/integration/create-loyverse-receipt \
  -H "Content-Type: application/json" \
  -d '{
    "id": "ORDER-123",
    "customer": {
      "name": "John Doe",
      "phone": "+1234567890",
      "email": "john@example.com"
    },
    "items": [
      {
        "name": "Coffee",
        "quantity": 1,
        "price": 15.00,
        "total_item_price": 15.00
      }
    ],
    "total_price": 15.00,
    "type": "pickup"
  }'
```

## 🌐 Webhook Configuration

### GloriaFood Webhook Setup

1. Log into your GloriaFood dashboard
2. Go to Settings > Integrations > Webhooks
3. Add new webhook with URL: `https://your-domain.com/api/gloriafood/webhook`
4. Select events: "New Order", "Order Updated", "Order Cancelled"
5. Set webhook secret and save

### Webhook Payload Structure

The webhook expects data in this format:
```json
{
  "count": 1,
  "orders": [
    {
      "id": 12345,
      "client_first_name": "Customer Name",
      "client_last_name": "Last Name",
      "client_phone": "+1234567890",
      "client_email": "customer@email.com",
      "total_price": 25.00,
      "type": "pickup",
      "items": [
        {
          "name": "Coffee",
          "quantity": 1,
          "price": 15.00,
          "total_item_price": 15.00,
          "instructions": "Extra hot"
        }
      ]
    }
  ]
}
```

## 🚀 Deployment

### Vercel (Recommended)

1. **Connect GitHub**: Link your repository to Vercel
2. **Set Environment Variables**: Add all your API credentials in Vercel dashboard
3. **Deploy**: Automatic deployment on git push
4. **Update Webhook**: Point GloriaFood webhook to your Vercel URL

### Environment Variables for Production
```env
GLORIAFOOD_RESTAURANT_TOKEN=your_actual_token
GLORIAFOOD_AUTHENTICATE_KEY=your_actual_key
GLORIAFOOD_WEBHOOK_SECRET=your_actual_secret
GLORIAFOOD_MASTER_KEY=your_actual_master_key
GLORIAFOOD_RESTAURANT_ID=your_actual_restaurant_id
LOYVERSE_ACCESS_TOKEN=your_actual_access_token
LOYVERSE_LOCATION_ID=your_actual_location_id
NODE_ENV=production
PORT=3000
```

## 🔍 How It Works

1. **Order Received**: GloriaFood sends webhook to your server
2. **Customer Handling**: System finds existing customer or creates new one in Loyverse
3. **Item Mapping**: Finds existing items in Loyverse by name (exact match)
4. **Receipt Creation**: Creates receipt in Loyverse with all order details
5. **Automatic Printing**: Prints receipt automatically
6. **Logging**: All actions are logged for monitoring

## 📊 Monitoring

### Logs
- All operations are logged to console and files
- Error logs are separated for easy debugging
- Webhook requests are logged with full details

### Health Check
```bash
curl https://your-domain.com/health
```

## 🔒 Security Features

- **Rate Limiting**: API endpoints are rate-limited to prevent abuse
- **Webhook Verification**: Webhook signatures are verified when configured
- **CORS Protection**: Cross-origin requests are controlled
- **Helmet Security**: Security headers are automatically applied

## 🐛 Troubleshooting

### Common Issues

1. **Webhook Not Receiving Orders**
   - Check webhook URL configuration in GloriaFood
   - Verify webhook secret matches
   - Check server logs for errors

2. **Orders Not Creating in Loyverse**
   - Verify Loyverse API credentials
   - Check location ID configuration
   - Ensure items exist in Loyverse (matched by name)

3. **Customer Creation Fails**
   - Check customer data completeness
   - Verify Loyverse customer API permissions

### Debug Mode
Enable debug logging by setting:
```env
LOG_LEVEL=debug
```

## 📁 Project Structure

```
├── server.js                 # Main application entry point
├── routes/
│   ├── gloriaFood.js        # GloriaFood webhook and API routes
│   └── integration.js       # Integration testing routes
├── services/
│   ├── gloriaFoodService.js # GloriaFood API service
│   └── enhancedIntegrationService.js # Core integration logic
├── utils/
│   ├── loyverseApi.js       # Loyverse API client
│   └── logger.js            # Logging configuration
├── config/
│   └── apiConfig.js         # API configuration
└── logs/                    # Application logs
```

## 🎯 Key Features

- ✅ **No New Item Creation**: Only uses existing items in Loyverse
- ✅ **Automatic Customer Management**: Creates/finds customers automatically
- ✅ **Real-time Processing**: Processes orders as they come in
- ✅ **Automatic Printing**: Prints receipts immediately after creation
- ✅ **Comprehensive Logging**: Full audit trail of all operations
- ✅ **Error Handling**: Robust error handling with detailed messages
- ✅ **Production Ready**: Deployed and tested on Vercel

## 📄 License

MIT License - see LICENSE file for details.

---

**Note**: This integration is designed for restaurant use cases. Test thoroughly in a development environment before deploying to production.

## 🆘 Support

For issues and questions:
1. Check the logs for detailed error messages
2. Verify all environment variables are set correctly
3. Test individual API endpoints
4. Check GloriaFood and Loyverse API connectivity