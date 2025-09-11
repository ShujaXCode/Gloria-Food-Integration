# GloriaFood-Loyverse Integration

A Node.js/Express application that automatically syncs online orders from GloriaFood to Loyverse POS, eliminating the need for manual order entry.

## Features

- **Real-time Order Sync**: Automatically processes incoming orders from GloriaFood webhooks
- **Customer Management**: Creates or finds customers in Loyverse automatically
- **Order Processing**: Converts GloriaFood orders to Loyverse receipts with full details
- **Error Handling**: Comprehensive error handling with retry mechanisms
- **Monitoring Dashboard**: Built-in dashboard for monitoring integration status
- **Logging**: Detailed logging for debugging and monitoring
- **Security**: Webhook signature verification and rate limiting

## Prerequisites

- Node.js 16.0.0 or higher
- GloriaFood account with API access
- Loyverse account with API access
- Valid API keys and credentials

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd gloriafood-loyverse-integration
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
   # Server Configuration
   PORT=3000
   NODE_ENV=development
   
   # GloriaFood API Configuration
   GLORIAFOOD_API_URL=https://api.gloriafood.com
   GLORIAFOOD_API_KEY=your_actual_api_key
   GLORIAFOOD_WEBHOOK_SECRET=your_webhook_secret
   
   # Loyverse API Configuration
   LOYVERSE_API_URL=https://api.loyverse.com
   LOYVERSE_ACCESS_TOKEN=your_actual_access_token
   LOYVERSE_LOCATION_ID=your_location_id
   
   # Integration Settings
   AUTO_CREATE_CUSTOMERS=true
   SYNC_MENU_ITEMS=false
   RETRY_ATTEMPTS=3
   RETRY_DELAY=5000
   ```

4. **Start the application**
   ```bash
   # Development mode with auto-restart
   npm run dev
   
   # Production mode
   npm start
   ```

## Configuration

### GloriaFood Setup

1. **Get API Key**: Obtain your API key from GloriaFood dashboard
2. **Configure Webhook**: Set up webhook URL in GloriaFood to point to:
   ```
   https://your-domain.com/api/gloriafood/webhook
   ```
3. **Set Webhook Secret**: Configure a secret for webhook signature verification

### Loyverse Setup

1. **Get Access Token**: Generate an access token from Loyverse dashboard
2. **Get Location ID**: Note your location ID where orders should be created
3. **Test Connection**: Use the test endpoint to verify connectivity

## API Endpoints

### Health Check
- `GET /health` - Server health status

### GloriaFood Integration
- `POST /api/gloriafood/webhook` - Webhook endpoint for incoming orders
- `GET /api/gloriafood/orders/:orderId` - Get order details from GloriaFood
- `GET /api/gloriafood/menu` - Get menu items from GloriaFood
- `POST /api/gloriafood/test-webhook` - Send test webhook data

### Loyverse Integration
- `POST /api/loyverse/receipts` - Create receipt in Loyverse
- `GET /api/loyverse/products` - Get products from Loyverse
- `GET /api/loyverse/locations` - Get locations from Loyverse
- `POST /api/loyverse/customers` - Create customer in Loyverse
- `GET /api/loyverse/customers/search` - Find customer by phone
- `PATCH /api/loyverse/receipts/:receiptId/status` - Update receipt status
- `GET /api/loyverse/test-connection` - Test Loyverse connectivity

### Order Processing
- `POST /api/integration/process-order` - Process order from GloriaFood to Loyverse
- `GET /api/integration/order-status/:orderId` - Get order processing status
- `POST /api/integration/retry-order/:orderId` - Retry failed order
- `POST /api/integration/manual-sync` - Manual order synchronization
- `GET /api/integration/all-orders-status` - Get all order statuses
- `DELETE /api/integration/clear-completed-orders` - Clean up completed orders

### Dashboard & Monitoring
- `GET /api/dashboard/status` - System status and health
- `GET /api/dashboard/logs` - Recent application logs
- `GET /api/dashboard/logs/errors` - Error logs only
- `GET /api/dashboard/endpoints` - API endpoint documentation
- `GET /api/dashboard/config` - Current configuration status

## Usage Examples

### Testing the Integration

1. **Test Webhook**
   ```bash
   curl -X POST http://localhost:3000/api/gloriafood/test-webhook
   ```

2. **Test Loyverse Connection**
   ```bash
   curl http://localhost:3000/api/loyverse/test-connection
   ```

3. **Check System Status**
   ```bash
   curl http://localhost:3000/api/dashboard/status
   ```

### Manual Order Processing

```bash
curl -X POST http://localhost:3000/api/integration/process-order \
  -H "Content-Type: application/json" \
  -d '{
    "id": "ORDER-123",
    "customer": {
      "name": "John Doe",
      "phone": "+1234567890",
      "email": "john@example.com",
      "address": "123 Main St"
    },
    "items": [
      {
        "name": "Pizza Margherita",
        "quantity": 1,
        "unit_price": 15.00,
        "total_price": 15.00
      }
    ],
    "subtotal": 15.00,
    "tax": 1.50,
    "total": 16.50,
    "order_type": "delivery",
    "notes": "Extra cheese please"
  }'
```

## Webhook Configuration

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
  "order_id": "12345",
  "customer": {
    "name": "Customer Name",
    "phone": "+1234567890",
    "email": "customer@email.com",
    "address": "Delivery Address"
  },
  "items": [
    {
      "name": "Item Name",
      "quantity": 1,
      "unit_price": 10.00,
      "total_price": 10.00,
      "modifiers": ["Extra", "Sauce"]
    }
  ],
  "subtotal": 10.00,
  "tax": 1.00,
  "total": 11.00,
  "order_type": "delivery",
  "notes": "Customer notes"
}
```

## Error Handling

The application includes comprehensive error handling:

- **Retry Mechanism**: Failed orders are automatically retried with exponential backoff
- **Logging**: All errors are logged with detailed information
- **Status Tracking**: Order processing status is tracked and can be monitored
- **Manual Retry**: Failed orders can be manually retried via API

## Monitoring & Logs

### Log Files
- `logs/combined.log` - All application logs
- `logs/error.log` - Error logs only

### Dashboard Features
- Real-time system status
- Order processing queue status
- API connectivity status
- Configuration validation
- Recent logs and errors

## Security Features

- **Rate Limiting**: API endpoints are rate-limited to prevent abuse
- **Webhook Verification**: Webhook signatures are verified when configured
- **CORS Protection**: Cross-origin requests are controlled
- **Helmet Security**: Security headers are automatically applied

## Production Deployment

### Environment Variables
- Set `NODE_ENV=production`
- Use strong, unique secrets for webhook verification
- Configure proper logging levels

### Process Management
- Use PM2 or similar process manager
- Set up proper monitoring and alerting
- Configure log rotation

### SSL/TLS
- Use HTTPS in production
- Configure proper SSL certificates
- Update webhook URLs to use HTTPS

## Troubleshooting

### Common Issues

1. **Webhook Not Receiving Orders**
   - Check webhook URL configuration in GloriaFood
   - Verify webhook secret matches
   - Check server logs for errors

2. **Orders Not Creating in Loyverse**
   - Verify Loyverse API credentials
   - Check location ID configuration
   - Review order data format

3. **Customer Creation Fails**
   - Ensure `AUTO_CREATE_CUSTOMERS=true`
   - Check customer data completeness
   - Verify Loyverse customer API permissions

### Debug Mode
Enable debug logging by setting:
```env
LOG_LEVEL=debug
```

## Support

For issues and questions:
1. Check the logs at `/api/dashboard/logs`
2. Verify configuration at `/api/dashboard/config`
3. Test API connectivity at `/api/dashboard/status`

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

---

**Note**: This integration is designed for restaurant use cases. Test thoroughly in a development environment before deploying to production.
