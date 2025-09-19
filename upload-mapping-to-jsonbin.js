const fs = require('fs');
const axios = require('axios');
const apiConfig = require('./config/apiConfig');

class JSONBinUploader {
  constructor() {
    this.jsonbin = apiConfig.jsonbin;
  }

  async uploadMappingData() {
    try {
      console.log('🚀 Starting upload to JSONBin.io...\n');
      
      // Load the current mapping data from local file
      const mappingFilePath = '/Users/macos/Desktop/Upwork lead/export_items_menu.json';
      console.log('📖 Reading mapping file from:', mappingFilePath);
      
      const rawData = fs.readFileSync(mappingFilePath, 'utf8');
      const mappingData = JSON.parse(rawData);
      
      console.log(`📋 Loaded ${mappingData.length} items from local file`);
      console.log('🔄 Uploading to JSONBin.io...\n');

      // Upload to JSONBin.io
      const response = await axios.put(`${this.jsonbin.baseURL}/b/${this.jsonbin.binId}`, mappingData, {
        headers: {
          'X-Master-Key': this.jsonbin.apiKey,
          'X-Access-Key': this.jsonbin.accessKey,
          'Content-Type': 'application/json'
        },
        timeout: 15000 // 15 second timeout
      });

      console.log('📤 Upload response:', JSON.stringify(response.data, null, 2));
      
      if (response.data) {
        console.log('✅ Successfully uploaded to JSONBin.io!');
        console.log(`📊 Uploaded ${mappingData.length} items`);
        console.log(`🔗 Bin ID: ${this.jsonbin.binId}`);
        console.log(`📅 Uploaded at: ${new Date().toISOString()}`);
        
        // Verify the upload by fetching the data back
        console.log('\n🔍 Verifying upload...');
        await this.verifyUpload();
        
        return true;
      } else {
        throw new Error('Upload failed - no response data');
      }
      
    } catch (error) {
      console.error('❌ Failed to upload to JSONBin.io:', error.response?.data || error.message);
      return false;
    }
  }

  async verifyUpload() {
    try {
      const response = await axios.get(`${this.jsonbin.baseURL}/b/${this.jsonbin.binId}/latest`, {
        headers: {
          'X-Master-Key': this.jsonbin.apiKey,
          'X-Access-Key': this.jsonbin.accessKey
        },
        timeout: 10000
      });

      if (response.data && response.data.record) {
        const recordCount = response.data.record.length;
        console.log(`✅ Verification successful: ${recordCount} items found in JSONBin.io`);
        
        // Show some sample items
        console.log('\n📋 Sample items from JSONBin.io:');
        response.data.record.slice(0, 3).forEach((item, index) => {
          console.log(`   ${index + 1}. ${item.Name} (SKU: ${item.SKU})`);
        });
        
        return true;
      } else {
        throw new Error('No data found in verification response');
      }
    } catch (error) {
      console.error('❌ Verification failed:', error.message);
      return false;
    }
  }

  async testConnection() {
    try {
      console.log('🔍 Testing JSONBin.io connection...');
      
      const response = await axios.get(`${this.jsonbin.baseURL}/b/${this.jsonbin.binId}`, {
        headers: {
          'X-Master-Key': this.jsonbin.apiKey,
          'X-Access-Key': this.jsonbin.accessKey
        },
        timeout: 10000
      });

      if (response.data) {
        console.log('✅ JSONBin.io connection successful!');
        console.log(`📊 Bin ID: ${this.jsonbin.binId}`);
        console.log(`📅 Created: ${response.data.createdAt}`);
        console.log(`📅 Updated: ${response.data.updatedAt}`);
        return true;
      } else {
        throw new Error('No response data');
      }
    } catch (error) {
      console.error('❌ JSONBin.io connection failed:', error.response?.data || error.message);
      return false;
    }
  }
}

// Main execution
async function main() {
  try {
    console.log('🚀 JSONBin.io Mapping Data Uploader\n');
    
    const uploader = new JSONBinUploader();
    
    // Test connection first
    console.log('Step 1: Testing connection...');
    const connectionOk = await uploader.testConnection();
    
    if (!connectionOk) {
      console.log('\n❌ Connection test failed. Please check your credentials.');
      process.exit(1);
    }
    
    console.log('\nStep 2: Uploading mapping data...');
    const uploadSuccess = await uploader.uploadMappingData();
    
    if (uploadSuccess) {
      console.log('\n🎉 Upload completed successfully!');
      console.log('✅ Your mapping data is now available on JSONBin.io');
      console.log('🔄 The system will now use JSONBin.io as the primary source');
      process.exit(0);
    } else {
      console.log('\n❌ Upload failed. Please check the error messages above.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
  }
}

main();
