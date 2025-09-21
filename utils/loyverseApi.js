const axios = require('axios');
const logger = require('./logger');

class LoyverseAPI {
  constructor() {
    this.baseURL = 'https://api.loyverse.com/v1.0'; // Fixed base URL
    this.accessToken = process.env.LOYVERSE_ACCESS_TOKEN;
    this.locationId = process.env.LOYVERSE_LOCATION_ID;
    
    if (!this.accessToken) {
      logger.warn('Loyverse access token not configured');
    }
    
    if (!this.locationId) {
      logger.warn('Loyverse location ID not configured');
    }
    
    logger.info('Loyverse API initialized with base URL:', this.baseURL);
  }

  // Convert numeric ID to UUID format
  convertToUUID(numericId) {
    // Create a deterministic UUID from numeric ID
    const hash = this.hashCode(numericId.toString());
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = (hash + Math.random() * 16) % 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    return uuid;
  }

  // Simple hash function for deterministic UUID generation
  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  // Get headers for API requests
  getHeaders() {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };
  }

  // Sanitize text to remove Arabic characters
  sanitizeText(text) {
    if (!text) return '';
    // Replace Arabic characters with English equivalents or remove them
    return text.replace(/[\u0600-\u06FF]/g, '').trim() || 'Item Note';
  }

  // Get payment type ID for CASH payments
  async getCashPaymentTypeId() {
    try {
      console.log('Fetching payment types from Loyverse...');
      const response = await axios.get(`${this.baseURL}/payment_types`, {
        headers: this.getHeaders(),
        timeout: 10000 // 10 second timeout
      });
      
      console.log('Payment types response:', JSON.stringify(response.data, null, 2));
      
      // Find the CASH payment type
      const cashPaymentType = response.data.payment_types?.find(pt => pt.type === 'CASH');
      
      if (cashPaymentType) {
        console.log(`Found CASH payment type ID: ${cashPaymentType.id}`);
        return cashPaymentType.id;
      } else {
        console.log('No CASH payment type found, using first available payment type');
        return response.data.payment_types?.[0]?.id || null;
      }
    } catch (error) {
      console.error('Error fetching payment types:', error.response?.data || error.message);
      
      // Fallback to hardcoded payment type ID if network fails
      console.log('Using fallback payment type ID due to network error');
      return '80dd8827-fe24-4864-adeb-391a790211cf'; // This is the CASH payment type ID from previous successful calls
    }
  }

  // Smart payment method detection based on customer name and order type
  async getSmartPaymentTypeId(orderData) {
    try {
      console.log('=== SMART PAYMENT DETECTION CALLED ===');
      console.log('Determining smart payment method for order:', orderData.id);
      console.log('Order type:', orderData.orderType || orderData.type);
      console.log('Customer first name:', orderData.customer?.name || orderData.client_first_name);
      
      // Only apply smart detection for pickup orders
      const orderType = orderData.orderType || orderData.type;
      if (orderType !== 'pickup') {
        console.log('Order is not pickup, using default CASH payment method');
        return await this.getCashPaymentTypeId();
      }
      
      // Extract first name from original GloriaFood payload (not processed customer name)
      const firstName = orderData.client_first_name || '';
      console.log('Fetching payment types from Loyverse for pickup order...');
      
      // Get all payment types from Loyverse
      const response = await axios.get(`${this.baseURL}/payment_types`, {
        headers: this.getHeaders(),
        timeout: 10000
      });
      
      console.log('Payment types response:', JSON.stringify(response.data, null, 2));
      
      if (response.data.payment_types && response.data.payment_types.length > 0) {
        // Look for payment method with exact name match
        const matchingPaymentType = response.data.payment_types.find(pt => 
          pt.name === firstName
        );
        
        if (matchingPaymentType) {
          console.log(`Found matching payment method "${firstName}" in Loyverse with ID: ${matchingPaymentType.id}`);
          return matchingPaymentType.id;
        } else {
          console.log(`Payment method "${firstName}" not found in Loyverse - defaulting to CASH`);
          return await this.getCashPaymentTypeId();
        }
      } else {
        console.log('No payment types found in Loyverse - defaulting to CASH');
        return await this.getCashPaymentTypeId();
      }
      
    } catch (error) {
      console.error('Error in smart payment detection:', error);
      console.log('Falling back to default CASH payment method');
      return await this.getCashPaymentTypeId();
    }
  }

  // Find or create customer in Loyverse
  async findOrCreateCustomer(customerData) {
    try {
      console.log('Finding/creating customer:', JSON.stringify(customerData, null, 2));
      
      // First, search for existing customer by phone or email
      if (customerData.phone || customerData.email) {
        console.log(`Searching for customer with phone: ${customerData.phone} and email: ${customerData.email}`);
        
        // Get all customers from Loyverse
        const searchResponse = await axios.get(`${this.baseURL}/customers`, {
          headers: this.getHeaders()
        });
        
        console.log('All customers response:', JSON.stringify(searchResponse.data, null, 2));
        
        if (searchResponse.data.customers && searchResponse.data.customers.length > 0) {
          // Search for exact match by phone or email
          const exactMatch = searchResponse.data.customers.find(customer => {
            const phoneMatch = customerData.phone && customer.phone === customerData.phone;
            const emailMatch = customerData.email && customer.email && customer.email.toLowerCase() === customerData.email.toLowerCase();
            return phoneMatch || emailMatch;
          });
          
          if (exactMatch) {
            console.log(`Found exact match: ${exactMatch.name} (ID: ${exactMatch.id})`);
            return exactMatch;
          } else {
            console.log('No exact match found, will create new customer');
          }
        }
      }
      
      // If not found, create new customer
      console.log('Creating new customer...');
      const newCustomer = await this.createCustomer(customerData);
      console.log(`Created new customer: ${newCustomer.name} (ID: ${newCustomer.id})`);
      return newCustomer;
      
    } catch (error) {
      console.error('Error finding/creating customer:', error.response?.data || error.message);
      return null;
    }
  }

  // Print receipt automatically - COMMENTED OUT FOR NOW
  // async printReceipt(receiptId) {
  //   try {
  //     console.log(`Sending receipt ${receiptId} to printer...`);
  //     
  //     // Method 1: Use Loyverse Print API (if available)
  //     try {
  //       const printResponse = await axios.post(`${this.baseURL}/receipts/${receiptId}/print`, {}, {
  //         headers: this.getHeaders()
  //       });
  //       console.log(`Receipt ${receiptId} sent to printer via Loyverse API`);
  //       return printResponse.data;
  //     } catch (loyversePrintError) {
  //       console.log('Loyverse print API not available, trying alternative method...');
  //       
  //       // Method 2: Use POS Device Print API
  //       try {
  //         const posPrintResponse = await axios.post(`${this.baseURL}/pos_devices/print`, {
  //           receipt_id: receiptId,
  //           store_id: this.locationId
  //         }, {
  //           headers: this.getHeaders()
  //         });
  //         console.log(`Receipt ${receiptId} sent to POS printer`);
  //         return posPrintResponse.data;
  //       } catch (posPrintError) {
  //         console.log('POS print API not available, using webhook notification...');
  //         
  //         // Method 3: Send print notification via webhook
  //         await this.sendPrintNotification(receiptId);
  //         return { message: 'Print notification sent' };
  //       }
  //     }
  //     
  //   } catch (error) {
  //     console.error(`Error printing receipt ${receiptId}:`, error.response?.data || error.message);
  //     throw error;
  //   }
  // }

  // Send print notification (fallback method) - COMMENTED OUT FOR NOW
  // async sendPrintNotification(receiptId) {
  //   try {
  //     console.log(`Sending print notification for receipt ${receiptId}...`);
  //     
  //     // This could be a webhook to your POS system or a print service
  //     const notificationData = {
  //       receipt_id: receiptId,
  //       store_id: this.locationId,
  //       action: 'print_receipt',
  //       timestamp: new Date().toISOString()
  //     };
  //     
  //     // You can implement this to send to your POS system
  //     console.log('Print notification data:', JSON.stringify(notificationData, null, 2));
  //     
  //     return { success: true, message: 'Print notification sent' };
  //     
  //   } catch (error) {
  //     console.error('Error sending print notification:', error.message);
  //     throw error;
  //   }
  // }

  // Create a new item in Loyverse
  async createItem(itemData) {
    try {
      logger.info(`Creating item in Loyverse: ${itemData.name}`);
      
            const itemPayload = {
        // Let Loyverse generate its own ID
        item_name: itemData.name,
        description: itemData.instructions || itemData.name,
        category_id: null,
        track_stock: false,
        sold_by_weight: false,
        is_composite: false,
        use_production: false,
        primary_supplier_id: null,
        tax_ids: [],
        modifiers_ids: [],
        form: "SQUARE",
        color: "GREY",
        variants: [
          {
            sku: itemData.id, // Use the provided SKU
            cost: parseFloat((itemData.price * 0.6).toFixed(2)), // Estimate cost as 60% of price
            default_pricing_type: "FIXED",
            default_price: itemData.price
          }
        ]
      };

      console.log('=== ITEM CREATION DEBUG ===');
      console.log('Item payload being sent to Loyverse:', JSON.stringify(itemPayload, null, 2));
      console.log('Loyverse API URL:', `${this.baseURL}/items`);
      console.log('Headers being sent:', JSON.stringify(this.getHeaders(), null, 2));
      console.log('================================');

      const response = await axios.post(`${this.baseURL}/items`, itemPayload, {
        headers: this.getHeaders()
      });

      logger.info(`Item created successfully: ${response.data.id}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to create item in Loyverse: ${error.message}`);
      
      console.log('=== ITEM CREATION ERROR ===');
      if (error.response) {
        console.log('Status:', error.response.status);
        console.log('Status Text:', error.response.statusText);
        console.log('Response Data:', JSON.stringify(error.response.data, null, 2));
      } else {
        console.log('No response object in error:', error.message);
      }
      console.log('===============================');
      
      throw error;
    }
  }

  // Create a new receipt (order) in Loyverse
  async createReceipt(orderData) {
    try {
      logger.info(`Creating receipt in Loyverse for order ${orderData.id}`);
      
      // First, ensure all items exist and get their variant IDs
      const lineItemsWithVariants = [];
      
      // First, process all regular items (skip delivery fees for now)
      const deliveryFeeItems = [];
      
      for (const item of orderData.items) {
        console.log(`Processing item: ${item.name} (GloriaFood ID: ${item.id})`);
        console.log(`Item data:`, JSON.stringify(item, null, 2));
        
        // Skip delivery fees for now - we'll process them at the end
        if (item.sku === 'DELIVERY_FEE' || item.name === 'DELIVERY_FEE' || item.type === 'delivery_fee') {
          console.log(`Found delivery fee: ${item.name} (${item.price} PKR) - will process at the end`);
          deliveryFeeItems.push(item);
          continue; // Skip the normal item processing
        }
        
        // Find or create the item using SKU
        console.log(`🔍 DEBUG: Looking up item with SKU: ${item.sku} (type: ${typeof item.sku})`);
        console.log(`🔍 DEBUG: Item details:`, JSON.stringify(item, null, 2));
        const existingItem = await this.findItemBySKU(item.sku);
        console.log(`🔍 DEBUG: Found item result:`, existingItem ? `${existingItem.name} (ID: ${existingItem.id})` : 'null');
        
        if (existingItem) {
          console.log(`Found existing item: ${existingItem.name} (Loyverse ID: ${existingItem.id})`);
          console.log(`Existing item data:`, JSON.stringify(existingItem, null, 2));
          
          // Find the variant that matches the SKU
          if (existingItem.variants && existingItem.variants.length > 0) {
            const variant = existingItem.variants.find(v => v.sku === item.sku.toString());
            if (!variant) {
              console.log(`No variant found with SKU ${item.sku} for item ${existingItem.name}`);
              continue;
            }
            const variantId = variant.variant_id;
            // Always use GloriaFood price for accuracy - it already includes size modifiers
            let finalPrice = item.price;
            
            console.log(`Using GloriaFood price: ${finalPrice} (Loyverse default price: ${variant.default_price || variant.stores?.[0]?.price})`);
            console.log(`Using variant ID: ${variantId}`);
            console.log(`Item data:`, JSON.stringify(item, null, 2));
            
            lineItemsWithVariants.push({
              variant_id: variantId,
              quantity: item.quantity || 1,
              unit_price: finalPrice,
              total_price: finalPrice * (item.quantity || 1),
              line_note: item.instructions || ''
            });
          } else {
            console.log(`No variants found for item: ${existingItem.name}`);
            // Fallback to using item_id if no variants
            lineItemsWithVariants.push({
              variant_id: existingItem.variants[0].id,
              quantity: item.quantity || 1,
              unit_price: item.price,
              total_price: item.total_price || (item.price * (item.quantity || 1)),
              line_note: item.instructions || ''
            });
          }
        } else {
          console.log(`Item "${item.name}" not found in Loyverse. Skipping item creation.`);
          // Skip this item - don't create new items
          console.log(`Skipping item: ${item.name} (GloriaFood ID: ${item.id})`);
          // You can choose to:
          // 1. Skip the item entirely
          // 2. Use a default/generic item
          // 3. Log an error and continue
          
          // Option 1: Skip the item (recommended)
          continue;
          
          // Option 2: Use a default item (uncomment if needed)
          // const defaultItem = await this.findItemByName("Default Item");
          // if (defaultItem && defaultItem.variants && defaultItem.variants.length > 0) {
          //   lineItemsWithVariants.push({
          //     variant_id: defaultItem.variants[0].variant_id,
          //     quantity: item.quantity,
          //     unit_price: item.price,
          //     total_price: item.total_price,
          //     note: `Original: ${item.name} - ${item.instructions || ''}`
          //   });
          // }
        }
      }
      
      // Get the smart payment type ID based on customer name and order type
      console.log('=== ABOUT TO CALL SMART PAYMENT DETECTION ===');
      console.log('Order data being passed:', JSON.stringify(orderData, null, 2));
      let paymentTypeId = await this.getSmartPaymentTypeId(orderData);
      
      if (!paymentTypeId) {
        console.log('No payment type ID available, using fallback');
        // Use the hardcoded fallback payment type ID
        paymentTypeId = '80dd8827-fe24-4864-adeb-391a790211cf';
        console.log(`Using fallback payment type ID: ${paymentTypeId}`);
      }
      
      // Create or find customer in Loyverse
      let customerId = null;
      
      // Map GloriaFood customer data to our expected format
      // ALWAYS construct full name from original GloriaFood fields
      const firstName = orderData.client_first_name || '';
      const lastName = orderData.client_last_name || '';
      let customerName;
      
      if (firstName && lastName) {
        customerName = `${firstName} ${lastName}`;
      } else if (firstName) {
        customerName = firstName;
      } else if (lastName) {
        customerName = lastName;
      } else {
        customerName = 'Unknown Customer';
      }
      
      const customerData = {
        name: customerName,
        phone: orderData.customer?.phone || orderData.client_phone,
        email: orderData.customer?.email || orderData.client_email,
        address: orderData.customer?.address || orderData.client_address
      };
      
      // Skip customer creation - include customer info in receipt notes instead
      console.log('Skipping customer creation - will include customer info in receipt notes');
      
      // Build receipt notes with order details and customer info
      let receiptNotes = '';
      if (orderData.instructions) {
        receiptNotes += `Order Notes: ${orderData.instructions}\n`;
      }
      if (orderData.orderType || orderData.type) {
        receiptNotes += `Order Type: ${(orderData.orderType || orderData.type).toUpperCase()}\n`;
      }
      
      // Add customer information to receipt notes
      if (customerData.name) {
        receiptNotes += `Customer Name: ${customerData.name}\n`;
      }
      if (customerData.phone) {
        receiptNotes += `Customer Phone: ${customerData.phone}\n`;
      }
      if (customerData.email) {
        receiptNotes += `Customer Email: ${customerData.email}\n`;
      }
      if (customerData.address) {
        receiptNotes += `Delivery Address: ${customerData.address}\n`;
      }
      
      
      // Add order-level instructions if available
      if (orderData.notes && orderData.notes.trim()) {
        receiptNotes += `Order Instructions: ${orderData.notes.trim()}\n`;
      }
      
      // Add order ID for duplicate detection
      receiptNotes += `Order ID: ${orderData.id}\n`;
      
      // Now process delivery fees at the end
      for (const item of deliveryFeeItems) {
        console.log(`Processing delivery fee at the end: ${item.name} (${item.price} PKR)`);
        
        // Try to find an existing delivery fee item in Loyverse
        const deliveryFeeItem = await this.findItemByName('Delivery Fee');
        
        if (deliveryFeeItem && deliveryFeeItem.variants && deliveryFeeItem.variants.length > 0) {
          // Use existing delivery fee item
          const variant = deliveryFeeItem.variants[0];
          lineItemsWithVariants.push({
            variant_id: variant.variant_id,
            quantity: item.quantity,
            unit_price: item.price, // Use GloriaFood price
            total_price: item.price * item.quantity,
            line_note: 'Delivery Fee'
          });
          console.log(`Using existing delivery fee item: ${deliveryFeeItem.item_name}`);
        } else {
          // Create a new delivery fee item
          console.log(`Creating new delivery fee item in Loyverse`);
          const newDeliveryFeeItem = await this.createItem({
            name: 'Delivery Fee',
            price: item.price,
            id: 'DELIVERY_FEE'
          });
          
          if (newDeliveryFeeItem && newDeliveryFeeItem.variants && newDeliveryFeeItem.variants.length > 0) {
            const variant = newDeliveryFeeItem.variants[0];
            lineItemsWithVariants.push({
              variant_id: variant.variant_id,
              quantity: item.quantity,
              unit_price: item.price,
              total_price: item.price * item.quantity,
              line_note: 'Delivery Fee'
            });
          }
        }
      }
      
      // Delivery fees are now handled as line items, no surcharge needed
      
      // Now create the receipt with proper variant IDs, payment type ID, and customer
      const receiptData = {
        store_id: this.locationId,
        order: orderData.id.toString(),
        source: `GloriaFood - ${orderData.orderType || orderData.type || 'pickup'}`,
        receipt_date: orderData.timestamp || new Date().toISOString(),
        line_items: lineItemsWithVariants,
        payments: [{
          payment_type_id: paymentTypeId,
          money: orderData.total
        }],
        // customer_id: customerId, // Removed - no customer creation
        note: receiptNotes.trim(),
        status: 'open'
      };
      
      // No surcharge needed - delivery fees are now line items
      
      console.log('=== RECEIPT CREATION DEBUG ===');
      console.log('Receipt notes being sent:', receiptNotes);
      console.log('Receipt data being sent to Loyverse:', JSON.stringify(receiptData, null, 2));
      console.log('Loyverse API URL:', `${this.baseURL}/receipts`);
      console.log('Headers being sent:', JSON.stringify(this.getHeaders(), null, 2));
      console.log('================================');
      
      const response = await axios.post(`${this.baseURL}/receipts`, receiptData, {
        headers: this.getHeaders()
      });
      
      // Log the full response to see the structure
      console.log('=== LOYVERSE RECEIPT RESPONSE ===');
      console.log('Full response:', JSON.stringify(response.data, null, 2));
      console.log('================================');
      
      // Loyverse returns receipt_number, not id
      const receiptId = response.data.receipt_number || response.data.id || response.data.receipt_id || response.data.number;
      
      logger.info(`Created receipt in Loyverse: ${receiptId}`);
      
      // Automatically print the receipt - COMMENTED OUT FOR NOW
      // try {
      //   await this.printReceipt(receiptId);
      //   logger.info(`Receipt ${receiptId} sent to printer`);
      // } catch (printError) {
      //   logger.warn(`Failed to print receipt ${receiptId}:`, printError.message);
      //   // Don't fail the whole process if printing fails
      // }
      
      return response.data;
    } catch (error) {
      logger.error(`Failed to create receipt in Loyverse for order ${orderData.id}:`, error.message);
      
      // Log detailed error information
      console.log('=== RECEIPT CREATION ERROR ===');
      console.log('Order Data:', JSON.stringify(orderData, null, 2));
      console.log('Environment:', process.env.NODE_ENV);
      console.log('Node Version:', process.version);
      console.log('Loyverse Access Token:', process.env.LOYVERSE_ACCESS_TOKEN ? 'SET' : 'NOT SET');
      console.log('Loyverse Location ID:', process.env.LOYVERSE_LOCATION_ID ? 'SET' : 'NOT SET');
      console.log('Base URL:', this.baseURL);
      if (error.response) {
        console.log('Status:', error.response.status);
        console.log('Status Text:', error.response.statusText);
        console.log('Response Data:', JSON.stringify(error.response.data, null, 2));
        console.log('Response Headers:', JSON.stringify(error.response.headers, null, 2));
        console.log('Request URL:', error.config?.url);
        console.log('Request Method:', error.config?.method);
        console.log('Request Data:', JSON.stringify(error.config?.data, null, 2));
        console.log('Request Headers:', JSON.stringify(error.config?.headers, null, 2));
      } else {
        console.log('No response object in error:', error.message);
      }
      console.log('===============================');
      
      throw error;
    }
  }

  // Format order data for Loyverse API
  formatOrderForLoyverse(orderData) {
    try {
      logger.info(`Formatting order ${orderData.id} for Loyverse`);
      
      const receipt = {
        store_id: this.locationId, // Changed from location_id to store_id
        order: orderData.id.toString(), // Added order field
        source: 'GloriaFood Integration', // Updated source name
        receipt_date: orderData.timestamp || new Date().toISOString(),
        line_items: [],
        payments: [{
          payment_type: orderData.paymentMethod || 'CASH',
          amount: orderData.total
        }],
        customer_id: null, // Will be set after customer creation
        notes: receiptNotes.trim(),
        status: 'open'
      };

      // Add line items with correct format
      orderData.items.forEach(item => {
        receipt.line_items.push({
          item_id: item.loyverse_item_id || null,
          name: item.name,
          quantity: item.quantity,
          unit_price: item.price || item.unit_price,
          total_price: (item.price || item.unit_price) * item.quantity,
          notes: item.instructions || item.notes || ''
        });
      });

      logger.info(`Formatted order ${orderData.id} for Loyverse:`, JSON.stringify(receipt, null, 2));
      return receipt;
    } catch (error) {
      logger.error('Failed to format order for Loyverse:', error.message);
      throw error;
    }
  }

  // Process items for all order items in Loyverse (create if not found, update if exists)
  async processOrderItems(orderData) {
    try {
      logger.info(`Processing items for order ${orderData.id} in Loyverse`);
      
      const processedItems = [];
      
      for (const item of orderData.items) {
        try {
          // Check if item already exists
          const existingItem = await this.findItemByName(item.name, item.id);
          
          if (existingItem) {
            // Item exists - use existing ID
            logger.info(`Item already exists: ${existingItem.id}`);
            processedItems.push({
              ...item,
              loyverse_item_id: existingItem.id,
              status: 'existing'
            });
          } else {
            // Create new item
            const newItem = await this.createItem(item);
            logger.info(`Created new item: ${newItem.id}`);
            processedItems.push({
              ...item,
              loyverse_item_id: newItem.id,
              status: 'created'
            });
          }
        } catch (error) {
          logger.error(`Failed to process item ${item.name}:`, error.message);
          // Continue with other items
          processedItems.push({
            ...item,
            status: 'failed',
            error: error.message
          });
        }
      }
      
      return processedItems;
    } catch (error) {
      logger.error('Failed to process order items:', error.message);
      return orderData.items.map(item => ({ ...item, status: 'failed', error: error.message }));
    }
  }

  // Check if item needs updating
  itemNeedsUpdate(existingItem, newItem) {
    // Check if price, description, or other fields have changed
    const priceChanged = existingItem.variants[0]?.default_price !== newItem.price;
    const descriptionChanged = existingItem.description !== (newItem.instructions || newItem.name);
    
    return priceChanged || descriptionChanged;
  }

  // Update existing item in Loyverse
  async updateItem(itemId, itemData) {
    try {
      logger.info(`Updating item ${itemId} in Loyverse`);
      
      const updatePayload = {
        item_name: itemData.name,
        description: itemData.instructions || itemData.name
      };

      console.log('=== ITEM UPDATE DEBUG ===');
      console.log('Update payload being sent to Loyverse:', JSON.stringify(updatePayload, null, 2));
      console.log('Loyverse API URL:', `${this.baseURL}/items/${itemId}`);
      console.log('Headers being sent:', JSON.stringify(this.getHeaders(), null, 2));
      console.log('================================');

      const response = await axios.put(`${this.baseURL}/items/${itemId}`, updatePayload, {
        headers: this.getHeaders()
      });

      logger.info(`Item updated successfully: ${response.data.id}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to update item in Loyverse: ${error.message}`);
      
      console.log('=== ITEM UPDATE ERROR ===');
      if (error.response) {
        console.log('Status:', error.response.status);
        console.log('Status Text:', error.response.statusText);
        console.log('Response Data:', JSON.stringify(error.response.data, null, 2));
      } else {
        console.log('No response object in error:', error.message);
      }
      console.log('===============================');
      
      throw error;
    }
  }

  // Find item by ID or name in Loyverse
  async findItemByName(itemName, itemId = null) {
    try {
      // First try to find by ID if we have one
      if (itemId) {
        try {
          const response = await axios.get(`${this.baseURL}/items/${itemId}`, {
            headers: this.getHeaders()
          });
          if (response.data) {
            logger.info(`Found item by ID: ${itemId}`);
            return response.data;
          }
        } catch (idError) {
          // Item not found by ID, continue with name search
          logger.info(`Item not found by ID ${itemId}, searching by name`);
        }
      }

      // Search by name if ID search failed or no ID provided
      const response = await axios.get(`${this.baseURL}/items`, {
        headers: this.getHeaders(),
        params: {
          search: itemName
        }
      });
      
      if (response.data.items && response.data.items.length > 0) {
        // Find exact match
        const exactMatch = response.data.items.find(item => 
          item.item_name.toLowerCase() === itemName.toLowerCase()
        );
        return exactMatch || null;
      }
      
      return null;
    } catch (error) {
      logger.error(`Failed to search for item ${itemName}:`, error.message);
      return null;
    }
  }

  // Find item by SKU in Loyverse
  async findItemBySKU(sku) {
    try {
      logger.info(`Searching for item in Loyverse by SKU: ${sku}`);
      
      // Fetch all items since Loyverse API SKU search is broken
      const response = await axios.get(`${this.baseURL}/items`, {
        headers: this.getHeaders()
      });

      if (response.data && response.data.items && response.data.items.length > 0) {
        // Search locally for the item with the matching SKU
        for (const item of response.data.items) {
          if (item.variants && item.variants.length > 0) {
            for (const variant of item.variants) {
              if (variant.sku === sku.toString()) {
                logger.info(`Found item in Loyverse by SKU: ${item.name} (SKU: ${sku}) - Item ID: ${item.id}`);
                console.log(`🔍 DEBUG: Found item for SKU ${sku}: ${item.name} (ID: ${item.id})`);
                return item;
              }
            }
          }
        }
      }

      logger.info(`No item found in Loyverse with SKU: ${sku}`);
      return null;
    } catch (error) {
      logger.error(`Error searching for item by SKU in Loyverse:`, error.response?.data || error.message);
      return null;
    }
  }

  // Find customer by phone number
  async findCustomerByPhone(phone) {
    try {
      logger.info(`Searching for customer with phone: ${phone}`);
      
      const response = await axios.get(`${this.baseURL}/customers`, {
        headers: this.getHeaders(),
        params: {
          phone: phone
        }
      });
      
      logger.info('Customer search response received');
      const customers = response.data.customers || [];
      
      if (customers.length > 0) {
        logger.info(`Found existing customer: ${customers[0].id}`);
        return customers[0];
      }
      
      logger.info('No existing customer found');
      return null;
    } catch (error) {
      logger.error(`Failed to find customer by phone ${phone}:`, error.message);
      return null;
    }
  }

  // Create new customer
  async createCustomer(customerData) {
    try {
      const customerPayload = {
        name: customerData.name || `${customerData.first_name || ''} ${customerData.last_name || ''}`.trim() || 'Unknown Customer',
        first_name: customerData.first_name || customerData.name.split(' ')[0] || '',
        last_name: customerData.last_name || customerData.name.split(' ').slice(1).join(' ') || '',
        phone: customerData.phone,
        email: customerData.email,
        address: customerData.address || '',
        notes: `Created from GloriaFood order`
      };

      logger.info('Creating new customer in Loyverse');
      console.log('=== CUSTOMER CREATION DEBUG ===');
      console.log('Customer payload being sent to Loyverse:', JSON.stringify(customerPayload, null, 2));
      console.log('Loyverse API URL:', `${this.baseURL}/customers`);
      console.log('Headers being sent:', JSON.stringify(this.getHeaders(), null, 2));
      console.log('================================');
      
      const response = await axios.post(`${this.baseURL}/customers`, customerPayload, {
        headers: this.getHeaders()
      });
      
      logger.info(`Created new customer: ${response.data.id}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to create customer:', error.message);
      
      // Log detailed error information
      console.log('=== CUSTOMER CREATION ERROR ===');
      if (error.response) {
        console.log('Status:', error.response.status);
        console.log('Status Text:', error.response.statusText);
        console.log('Response Data:', JSON.stringify(error.response.data, null, 2));
        console.log('Full Error Response:', JSON.stringify(error.response, null, 2));
      } else {
        console.log('No response object in error:', error.message);
      }
      console.log('===============================');
      
      throw error;
    }
  }

  // Get products from Loyverse
  async getProducts() {
    try {
      logger.info('Retrieving products from Loyverse');
      
      const response = await axios.get(`${this.baseURL}/items`, {
        headers: this.getHeaders()
      });
      
      logger.info('Retrieved products from Loyverse');
      return response.data.items || [];
    } catch (error) {
      logger.error('Failed to retrieve products from Loyverse:', error.message);
      throw error;
    }
  }

  // Get locations from Loyverse
  async getLocations() {
    try {
      logger.info('Retrieving locations from Loyverse');
      
      const response = await axios.get(`${this.baseURL}/stores`, {
        headers: this.getHeaders()
      });
      
      logger.info('Retrieved locations from Loyverse');
      return response.data.stores || [];
    } catch (error) {
      logger.error('Failed to retrieve locations from Loyverse:', error.message);
      throw error;
    }
  }

  // Update receipt status
  async updateReceiptStatus(receiptId, status) {
    try {
      const response = await axios.patch(`${this.baseURL}/receipts/${receiptId}`, {
        status: status
      }, {
        headers: this.getHeaders()
      });
      
      logger.info(`Updated receipt ${receiptId} status to ${status}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to update receipt ${receiptId} status:`, error.message);
      throw error;
    }
  }

  // Get receipt by receipt number/ID from Loyverse
  async getReceiptById(receiptNumber) {
    try {
      logger.info(`Getting receipt from Loyverse: ${receiptNumber}`);
      
      const response = await axios.get(`${this.baseURL}/receipts/${receiptNumber}`, {
        headers: this.getHeaders()
      });
      
      if (response.data) {
        logger.info(`Found receipt in Loyverse: ${receiptNumber}`);
        return response.data;
      }
      
      return null;
    } catch (error) {
      if (error.response?.status === 404) {
        logger.info(`Receipt not found in Loyverse: ${receiptNumber}`);
        return null; // Receipt not found
      }
      logger.error(`Error getting receipt ${receiptNumber} from Loyverse:`, error.response?.data || error.message);
      throw error;
    }
  }

  // Find receipt by external reference (order ID)
  async findReceiptByExternalId(externalId) {
    try {
      logger.info(`Searching for receipt with external reference: ${externalId}`);
      
      // Search for receipts with the order ID in notes
      const response = await axios.get(`${this.baseURL}/receipts`, {
        headers: this.getHeaders(),
        params: {
          limit: 100 // Get recent receipts
        }
      });

      if (response.data && response.data.receipts && response.data.receipts.length > 0) {
        // Search for receipt with Order ID in notes
        for (const receipt of response.data.receipts) {
          if (receipt.notes && receipt.notes.includes(`Order ID: ${externalId}`)) {
            logger.info(`Found existing receipt: ${receipt.receipt_number} for order: ${externalId}`);
            return receipt;
          }
        }
      }

      logger.info(`No existing receipt found for order: ${externalId}`);
      return null;
    } catch (error) {
      logger.error(`Error searching for receipt by external ID ${externalId}:`, error.response?.data || error.message);
      return null;
    }
  }
}

module.exports = LoyverseAPI;
