# Local Development Setup with JSONBin.io

## 🔧 **Update Your Local Environment:**

### 1. **Create/Update your `.env` file:**

Create a `.env` file in your project root with these variables:

```env
# Loyverse API Configuration
LOYVERSE_ACCESS_TOKEN=your_loyverse_access_token_here
LOYVERSE_LOCATION_ID=your_loyverse_location_id_here

# JSONBin.io Configuration
JSONBIN_ID=68cd1ce7d0ea881f4082f202
JSONBIN_API_KEY=$2a$10$9SK02VE3u.mo2fRZooEUOu1C9nr5DGrhii3TbVIUVSnxtYFrQ4tAO

# Environment
NODE_ENV=development
```

### 2. **Upload Your Current Mapping Data:**

1. Go to your JSONBin.io bin: https://jsonbin.io/b/68cd1ce7d0ea881f4082f202
2. Copy the contents of your `export_items_menu.json` file
3. Paste it into the JSONBin.io editor
4. Save it

### 3. **Test Locally:**

```bash
# Start your local server
npm start

# Test with a webhook
curl -X POST http://localhost:8080/api/gloriafood/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "count": 1,
    "orders": [
        {
            "id": 999999999,
            "type": "pickup",
            "client_first_name": "Test",
            "client_last_name": "Local",
            "client_phone": "+923001234999",
            "client_email": "test@example.com",
            "total_price": 1900,
            "sub_total_price": 1900,
            "instructions": "",
            "items": [
                {
                    "id": 999999999,
                    "name": "كبسة ابتاون بالدجاج",
                    "price": 1300,
                    "quantity": 1,
                    "instructions": "",
                    "type": "item",
                    "options": [
                        {
                            "id": 999999999,
                            "name": "وسط",
                            "price": 600,
                            "group_name": "Size",
                            "quantity": 1,
                            "type": "size"
                        }
                    ]
                }
            ]
        }
    ]
}'
```

## ✅ **Benefits:**

1. **Same Data Source** - Local and production use the same JSONBin.io storage
2. **Real-time Sync** - Changes made locally are visible in production
3. **Consistent Testing** - Test with the same data that production uses
4. **No File Conflicts** - No more issues with local vs production file differences

## 🔄 **How It Works:**

- **Development (NODE_ENV=development)** - Uses JSONBin.io for storage
- **Production (NODE_ENV=production)** - Uses JSONBin.io for storage
- **Both environments** - Share the same mapping data

## 📋 **Next Steps:**

1. Create your `.env` file with the variables above
2. Upload your current mapping data to JSONBin.io
3. Test locally with the curl command
4. Deploy to production when ready

This way you can test everything locally first, then deploy to production with confidence!
