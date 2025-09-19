# Setup JSONBin.io for External Storage

## Why we need this:
- Vercel's serverless environment has a read-only file system
- We can't update the `export_items_menu.json` file on Vercel
- JSONBin.io provides free JSON storage that works with Vercel

## Setup Steps:

### 1. Create JSONBin.io Account
1. Go to https://jsonbin.io/
2. Sign up for a free account
3. Create a new bin

### 2. Get Your Credentials
1. Copy your **Bin ID** (looks like: `507f1f77bcf86cd799439011`)
2. Copy your **Master Key** (looks like: `$2a$10$...`)

### 3. Add Environment Variables to Vercel
1. Go to your Vercel dashboard
2. Select your project: `gloria-food-integration`
3. Go to Settings → Environment Variables
4. Add these variables:

```
JSONBIN_ID = your-bin-id-here
JSONBIN_API_KEY = your-master-key-here
```

### 4. Upload Your Current Mapping Data
1. Copy the contents of your `export_items_menu.json` file
2. Go to your JSONBin.io bin
3. Paste the JSON data
4. Save it

### 5. Test the Setup
The system will now:
- ✅ Load mapping data from JSONBin.io in production
- ✅ Save new item mappings to JSONBin.io
- ✅ Work exactly like your local setup
- ✅ Persist data between deployments

## Benefits:
- ✅ **Persistent storage** - Data survives deployments
- ✅ **Real-time updates** - New items are saved immediately
- ✅ **Free** - JSONBin.io free tier is sufficient
- ✅ **Reliable** - Works with Vercel's serverless environment
