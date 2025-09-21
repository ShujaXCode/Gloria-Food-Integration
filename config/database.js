const mongoose = require('mongoose');
const logger = require('../utils/logger');

class DatabaseConnection {
  constructor() {
    this.isConnected = false;
    this.connectionRetries = 0;
    this.maxRetries = 5;
  }

  async connect() {
    try {
      if (this.isConnected) {
        logger.info('MongoDB already connected');
        return true;
      }

      console.log('🔄 Connecting to MongoDB...');
      
      // MongoDB connection string
      const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://writeshuja46:shuja123@cluster0.ac7ag.mongodb.net/?retryWrites=true&w=majority';
      
      // Set up connection events
      mongoose.connection.on('connected', () => {
        console.log('✅ MongoDB connected successfully');
        logger.info('MongoDB connected successfully');
        this.isConnected = true;
        this.connectionRetries = 0;
      });

      mongoose.connection.on('error', (err) => {
        console.error('❌ MongoDB connection error:', err.message);
        logger.error('MongoDB connection error:', err);
        this.isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        console.log('⚠️ MongoDB disconnected');
        logger.warn('MongoDB disconnected');
        this.isConnected = false;
        
        // Attempt to reconnect
        if (this.connectionRetries < this.maxRetries) {
          this.connectionRetries++;
          console.log(`Attempting to reconnect... (${this.connectionRetries}/${this.maxRetries})`);
          setTimeout(() => this.connect(), 5000);
        }
      });

      // Connect to MongoDB
      await mongoose.connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 10
      });
      
      return true;
    } catch (error) {
      console.error('❌ Failed to connect to MongoDB:', error.message);
      logger.error('Failed to connect to MongoDB:', error);
      
      if (this.connectionRetries < this.maxRetries) {
        this.connectionRetries++;
        console.log(`Retrying connection... (${this.connectionRetries}/${this.maxRetries})`);
        setTimeout(() => this.connect(), 5000);
      }
      
      return false;
    }
  }

  async disconnect() {
    try {
      await mongoose.disconnect();
      this.isConnected = false;
      console.log('MongoDB disconnected');
      logger.info('MongoDB disconnected');
    } catch (error) {
      console.error('Error disconnecting from MongoDB:', error.message);
      logger.error('Error disconnecting from MongoDB:', error);
    }
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      readyState: mongoose.connection.readyState,
      retries: this.connectionRetries
    };
  }
}

module.exports = new DatabaseConnection();
