# Deployment Guide

This guide will help you deploy the GloriaFood-Loyverse Integration to production.

## Prerequisites

- Node.js 16+ installed on your server
- Domain name with SSL certificate
- GloriaFood API credentials
- Loyverse API credentials
- Server with at least 1GB RAM and 10GB storage

## Step 1: Server Setup

### Ubuntu/Debian
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Install Nginx
sudo apt install nginx -y

# Install Certbot for SSL
sudo apt install certbot python3-certbot-nginx -y
```

### CentOS/RHEL
```bash
# Update system
sudo yum update -y

# Install Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Install PM2
sudo npm install -g pm2

# Install Nginx
sudo yum install nginx -y

# Install Certbot
sudo yum install certbot python3-certbot-nginx -y
```

## Step 2: Application Deployment

```bash
# Create application directory
sudo mkdir -p /opt/gloriafood-integration
sudo chown $USER:$USER /opt/gloriafood-integration
cd /opt/gloriafood-integration

# Clone your repository
git clone <your-repo-url> .

# Install dependencies
npm install --production

# Create environment file
cp env.example .env
nano .env
```

## Step 3: Environment Configuration

Edit the `.env` file with your production settings:

```env
# Server Configuration
PORT=3000
NODE_ENV=production

# GloriaFood API Configuration
GLORIAFOOD_API_URL=https://api.gloriafood.com
GLORIAFOOD_API_KEY=your_production_api_key
GLORIAFOOD_WEBHOOK_SECRET=your_strong_webhook_secret

# Loyverse API Configuration
LOYVERSE_API_URL=https://api.loyverse.com
LOYVERSE_ACCESS_TOKEN=your_production_access_token
LOYVERSE_LOCATION_ID=your_location_id

# Integration Settings
AUTO_CREATE_CUSTOMERS=true
SYNC_MENU_ITEMS=false
RETRY_ATTEMPTS=3
RETRY_DELAY=5000

# Logging
LOG_LEVEL=info
LOG_FILE=logs/app.log
```

## Step 4: Process Management with PM2

Create a PM2 ecosystem file:

```bash
nano ecosystem.config.js
```

Add this content:

```javascript
module.exports = {
  apps: [{
    name: 'gloriafood-integration',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
```

Start the application:

```bash
# Start the application
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Set PM2 to start on boot
pm2 startup
```

## Step 5: Nginx Configuration

Create Nginx configuration:

```bash
sudo nano /etc/nginx/sites-available/gloriafood-integration
```

Add this content:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    
    # Proxy to Node.js application
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Logs
    access_log /var/log/nginx/gloriafood-integration.access.log;
    error_log /var/log/nginx/gloriafood-integration.error.log;
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/gloriafood-integration /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Step 6: SSL Certificate

```bash
# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Test auto-renewal
sudo certbot renew --dry-run
```

## Step 7: Firewall Configuration

```bash
# Allow HTTP, HTTPS, and SSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 22
sudo ufw enable
```

## Step 8: Monitoring and Logs

### PM2 Commands
```bash
# View application status
pm2 status

# View logs
pm2 logs gloriafood-integration

# Restart application
pm2 restart gloriafood-integration

# Monitor resources
pm2 monit
```

### Application Logs
```bash
# View application logs
tail -f logs/combined.log
tail -f logs/error.log

# View Nginx logs
sudo tail -f /var/log/nginx/gloriafood-integration.access.log
sudo tail -f /var/log/nginx/gloriafood-integration.error.log
```

## Step 9: Webhook Configuration

1. **GloriaFood Dashboard**:
   - Go to Settings > Integrations > Webhooks
   - Add webhook URL: `https://your-domain.com/api/gloriafood/webhook`
   - Set webhook secret (must match your .env file)
   - Select events: New Order, Order Updated, Order Cancelled

2. **Test Webhook**:
   ```bash
   curl -X POST https://your-domain.com/api/gloriafood/test-webhook
   ```

## Step 10: Health Checks

Test your deployment:

```bash
# Health check
curl https://your-domain.com/health

# System status
curl https://your-domain.com/api/dashboard/status

# Configuration check
curl https://your-domain.com/api/dashboard/config
```

## Step 11: Backup and Maintenance

### Backup Script
Create a backup script:

```bash
nano /opt/gloriafood-integration/backup.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/opt/backups/gloriafood-integration"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup application files
tar -czf $BACKUP_DIR/app_$DATE.tar.gz --exclude=node_modules --exclude=logs .

# Backup logs
tar -czf $BACKUP_DIR/logs_$DATE.tar.gz logs/

# Backup environment file
cp .env $BACKUP_DIR/env_$DATE

# Clean old backups (keep last 7 days)
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
find $BACKUP_DIR -name "env_*" -mtime +7 -delete

echo "Backup completed: $DATE"
```

Make it executable:
```bash
chmod +x backup.sh
```

### Cron Job for Backups
```bash
crontab -e
```

Add this line for daily backups at 2 AM:
```
0 2 * * * /opt/gloriafood-integration/backup.sh
```

## Troubleshooting

### Common Issues

1. **Application won't start**:
   ```bash
   pm2 logs gloriafood-integration
   tail -f logs/error.log
   ```

2. **Webhook not receiving orders**:
   - Check webhook URL in GloriaFood
   - Verify webhook secret
   - Check application logs

3. **Orders not creating in Loyverse**:
   - Verify API credentials
   - Check location ID
   - Review order data format

4. **High memory usage**:
   - Monitor with `pm2 monit`
   - Restart application if needed
   - Check for memory leaks

### Performance Tuning

1. **Increase PM2 instances** (if you have multiple CPU cores):
   ```javascript
   instances: 'max'  // Use all CPU cores
   ```

2. **Adjust Node.js memory**:
   ```javascript
   max_memory_restart: '2G'  // Increase memory limit
   ```

3. **Enable Nginx caching** for static endpoints

## Security Considerations

1. **Keep dependencies updated**:
   ```bash
   npm audit
   npm update
   ```

2. **Regular security updates**:
   ```bash
   sudo apt update && sudo apt upgrade
   ```

3. **Monitor logs** for suspicious activity

4. **Use strong secrets** for webhook verification

## Support

For deployment issues:
1. Check application logs
2. Verify configuration
3. Test API connectivity
4. Review system resources

---

**Note**: This is a production deployment guide. Always test in a staging environment first.
