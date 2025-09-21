require('dotenv').config();
const mongoose = require('mongoose');

async function testConnection() {
  try {
    console.log('🔌 Testing MongoDB connection...');
    
    const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://writeshuja46:SHuja4646@cluster0.ac7ag.mongodb.net/?retryWrites=true&w=majority';
    
    console.log('🔗 Using MongoDB URI:', mongoUri.replace(/\/\/.*@/, '//***:***@'));
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    
    console.log('✅ Successfully connected to MongoDB!');
    console.log('📊 Connection state:', mongoose.connection.readyState);
    console.log('🏠 Database name:', mongoose.connection.name);
    
    // Test a simple operation
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('📁 Available collections:', collections.map(c => c.name));
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    
    if (error.message.includes('authentication failed')) {
      console.log('\n💡 Authentication failed. Possible solutions:');
      console.log('1. Check if the username/password are correct');
      console.log('2. Make sure the user has read/write permissions');
      console.log('3. Verify the database name in the connection string');
      console.log('4. Check if the MongoDB cluster is running');
    }
    
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

testConnection();
