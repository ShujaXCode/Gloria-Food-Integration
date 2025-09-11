#!/bin/bash

# GloriaFood-Loyverse Integration Startup Script

echo "🚀 Starting GloriaFood-Loyverse Integration..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please copy env.example to .env and configure your settings."
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Create logs directory if it doesn't exist
mkdir -p logs

# Check environment
if [ "$NODE_ENV" = "production" ]; then
    echo "🏭 Starting in PRODUCTION mode..."
    npm start
else
    echo "🔧 Starting in DEVELOPMENT mode..."
    npm run dev
fi
