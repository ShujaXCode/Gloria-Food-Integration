const Promo = require('../models/Promo');
const axios = require('axios');
const logger = require('../utils/logger');

class PromoService {
  constructor() {
    this.baseURL = 'https://api.loyverse.com/v1.0';
    this.accessToken = process.env.LOYVERSE_ACCESS_TOKEN;
    this.locationId = process.env.LOYVERSE_LOCATION_ID;
  }

  getHeaders() {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Create or update a promo cart discount based on GloriaFood item
   * @param {Object} gloriaFoodItem - The promo_cart item from GloriaFood
   * @returns {Object} - The created/updated promo
   */
  async createOrUpdatePromoCart(gloriaFoodItem) {
    try {
      logger.info(`Processing promo cart item: ${gloriaFoodItem.name} (ID: ${gloriaFoodItem.id})`);
      
      // Use type_id as the stable identifier instead of id
      const gloriaFoodItemId = gloriaFoodItem.type_id || gloriaFoodItem.id;
      console.log(gloriaFoodItemId ,'gloriaFoodItemId fucking gloriaFoodItemId (using type_id)')
      let existingPromo = await Promo.findOne({ 
        gloriaFoodItemId: gloriaFoodItemId 
      });
      console.log(existingPromo ,'existingPromo fucking existingPromo')

      const promoData = {
        name: gloriaFoodItem.name,
        type: 'FIXED_PERCENT',
        discountPercent: gloriaFoodItem.cart_discount_rate * 100, // Convert 0.05 to 5 (percentage)
        gloriaFoodItemId: gloriaFoodItemId, // Use type_id as stable identifier
        gloriaFoodPromoName: gloriaFoodItem.name,
        stores: [this.locationId]
      };

      if (existingPromo) {
        logger.info(`Updating existing promo: ${existingPromo.name}`);
        
        // Store the existing Loyverse ID before updating
        const existingLoyverseId = existingPromo.loyverseDiscountId;
        
        // Update existing promo in MongoDB (but preserve the Loyverse ID)
        Object.assign(existingPromo, promoData);
        existingPromo.loyverseDiscountId = existingLoyverseId; // Restore the Loyverse ID
        await existingPromo.save();

        // Update in Loyverse if it has a Loyverse ID
        console.log(existingPromo ,'existingPromo.loyverseDiscountId fucking existingPromo.loyverseDiscountId')
        if (existingPromo.loyverseDiscountId) {
          await this.updateLoyverseDiscount(existingPromo);
        } else {
          // Create in Loyverse if it doesn't have an ID
          const loyverseDiscount = await this.createLoyverseDiscount(existingPromo);
          existingPromo.loyverseDiscountId = loyverseDiscount.id;
          await existingPromo.save();
        }

        logger.info(`Updated promo: ${existingPromo.name}`);
        return existingPromo;
      } else {
        logger.info(`Creating new promo: ${gloriaFoodItem.name}`);
        
        // Create new promo in MongoDB
        const newPromo = new Promo(promoData);
        await newPromo.save();

        // Create in Loyverse
        const loyverseDiscount = await this.createLoyverseDiscount(newPromo);
        newPromo.loyverseDiscountId = loyverseDiscount.id;
        await newPromo.save();

        logger.info(`Created new promo: ${newPromo.name} with Loyverse ID: ${loyverseDiscount.id}`);
        return newPromo;
      }
    } catch (error) {
      logger.error(`Error processing promo cart: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a discount in Loyverse
   * @param {Object} promo - The promo object from MongoDB
   * @returns {Object} - The created Loyverse discount
   */
  async createLoyverseDiscount(promo) {
    try {
      const discountData = {
        type: promo.type,
        name: promo.name,
        discount_percent: promo.discountPercent, // Already in percentage format (5, not 0.05)
        stores: promo.stores,
        restricted_access: promo.restrictedAccess || false
      };

      logger.info(`Creating Loyverse discount:`, JSON.stringify(discountData, null, 2));

      const response = await axios.post(
        `${this.baseURL}/discounts`,
        discountData,
        { headers: this.getHeaders() }
      );

      logger.info(`Created Loyverse discount:`, response.data);
      return response.data;
    } catch (error) {
      logger.error(`Error creating Loyverse discount: ${error.message}`);
      if (error.response) {
        logger.error(`Error response data:`, JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  /**
   * Update a discount in Loyverse
   * @param {Object} promo - The promo object from MongoDB
   * @returns {Object} - The updated Loyverse discount
   */
  async updateLoyverseDiscount(promo) {
    try {
      const discountData = {
        id: promo.loyverseDiscountId,
        type: promo.type,
        name: promo.name,
        discount_percent: promo.discountPercent,
        stores: promo.stores,
        restricted_access: promo.restrictedAccess || false
      };

      logger.info(`Updating Loyverse discount:`, JSON.stringify(discountData, null, 2));

      const response = await axios.post(
        `${this.baseURL}/discounts`,
        discountData,
        { headers: this.getHeaders() }
      );

      logger.info(`Updated Loyverse discount:`, response.data);
      return response.data;
    } catch (error) {
      logger.error(`Error updating Loyverse discount: ${error.message}`);
      if (error.response) {
        logger.error(`Error response data:`, JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  /**
   * Find a promo by GloriaFood item ID
   * @param {string} gloriaFoodItemId - The GloriaFood item ID
   * @returns {Object|null} - The promo or null if not found
   */
  async findPromoByGloriaFoodId(gloriaFoodItemId) {
    try {
      return await Promo.findOne({ gloriaFoodItemId });
    } catch (error) {
      logger.error(`Error finding promo by GloriaFood ID: ${error.message}`);
      throw error;
    }
  }
}

module.exports = PromoService;
