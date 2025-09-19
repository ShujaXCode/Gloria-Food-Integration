#!/usr/bin/env node

/**
 * Script to upload mapping data to JSONBin.io
 * Usage: node upload-to-jsonbin.js
 */

const fs = require('fs');
const axios = require('axios');
const config = require('./config/apiConfig');

async function uploadToJSONBin() {
  try {
    console.log('=== UPLOADING MAPPING DATA TO JSONBIN.IO ===');
    
    // Check if credentials are provided
    if (!process.env.JSONBIN_API_KEY || !process.env.JSONBIN_BIN_ID) {
      console.log('Please set environment variables:');
      console.log('export JSONBIN_API_KEY="your_api_key_here"');
      console.log('export JSONBIN_BIN_ID="your_bin_id_here"');
      console.log('');
      console.log('Or create a new bin at https://jsonbin.io/');
      return;
    }

    // Load the mapping data from local file
    const mappingFilePath = './export_items_menu.json';
    if (!fs.existsSync(mappingFilePath)) {
      console.error('Mapping file not found:', mappingFilePath);
      return;
    }

    const rawData = fs.readFileSync(mappingFilePath, 'utf8');
    const mappingData = JSON.parse(rawData);
    
    console.log(`Loaded ${mappingData.length} items from ${mappingFilePath}`);

    // Upload to JSONBin.io
    const response = await axios.put(
      `https://api.jsonbin.io/v3/b/${process.env.JSONBIN_BIN_ID}`,
      mappingData,
      {
        headers: {
          'X-Master-Key': process.env.JSONBIN_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Successfully uploaded to JSONBin.io!');
    console.log('Bin ID:', process.env.JSONBIN_BIN_ID);
    console.log('Version:', response.data.version);
    console.log('URL:', `https://jsonbin.io/${process.env.JSONBIN_BIN_ID}`);
    
  } catch (error) {
    console.error('❌ Failed to upload to JSONBin.io:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.log('💡 Check your JSONBIN_API_KEY');
    } else if (error.response?.status === 404) {
      console.log('💡 Check your JSONBIN_BIN_ID or create a new bin at https://jsonbin.io/');
    }
  }
}

uploadToJSONBin();
