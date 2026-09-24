import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';

const CartContext = createContext(null);

const CART_STORAGE_KEY = 'smart_stationery_cart';

export const CartProvider = ({ children }) => {
  const [cartItems, setCartItems] = useState(() => {
    try {
      const stored = localStorage.getItem(CART_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // State for handling shop conflicts
  const [shopConflict, setShopConflict] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    } catch (e) {
      console.error('Failed to persist cart items to localStorage', e);
    }
  }, [cartItems]);

  /**
   * Identifies the current active shop for the cart
   */
  const cartShop = useMemo(() => {
    if (cartItems.length === 0) return null;
    return {
      id: cartItems[0].shopId,
      name: cartItems[0].shopName,
    };
  }, [cartItems]);

  /**
   * Add a product to the cart with single-shop and stock validation
   * @param {Object} product - Product object from API
   * @param {number} quantity - Quantity to add
   * @returns {Object} { success: boolean, conflict?: boolean, reason?: string, currentShop?: Object, newShop?: Object }
   */
  const addToCart = (product, quantity = 1) => {
    const stock = Number(product.current_stock ?? 999);
    const shopId = product.shop_id || product.shop?.id || product.shop;
    const shopName = product.shop_name || product.shop?.name || 'Campus Merchant';

    if (stock <= 0) {
      return { success: false, reason: 'OUT_OF_STOCK', message: 'Item is currently out of stock.' };
    }

    // Check for single shop restriction
    if (cartItems.length > 0 && cartItems[0].shopId !== shopId) {
      const conflictData = {
        currentShop: { id: cartItems[0].shopId, name: cartItems[0].shopName },
        newShop: { id: shopId, name: shopName },
        pendingProduct: product,
        pendingQuantity: quantity,
      };
      setShopConflict(conflictData);
      return {
        success: false,
        conflict: true,
        ...conflictData,
        message: `Your cart contains items from ${cartItems[0].shopName}. Clear current cart to add items from ${shopName}?`,
      };
    }

    setCartItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.productId === product.id);
      if (existingIndex > -1) {
        const updated = [...prev];
        const existingItem = updated[existingIndex];
        const desiredQty = existingItem.quantity + quantity;
        const cappedQty = Math.min(desiredQty, stock);
        updated[existingIndex] = {
          ...existingItem,
          quantity: cappedQty,
          current_stock: stock,
        };
        return updated;
      }

      const initialQty = Math.min(Math.max(1, quantity), stock);
      const newItem = {
        productId: product.id,
        shopId: shopId,
        shopName: shopName,
        productName: product.name,
        price: parseFloat(product.price || 0),
        quantity: initialQty,
        current_stock: stock,
        unit: product.unit_display || product.unit || 'Piece',
        image: product.image || null,
      };
      return [...prev, newItem];
    });

    return { success: true };
  };

  /**
   * Clears the cart and immediately adds the product from the new shop
   */
  const forceAddToCart = (product, quantity = 1) => {
    setCartItems([]);
    setShopConflict(null);
    const stock = Number(product.current_stock ?? 999);
    const shopId = product.shop_id || product.shop?.id || product.shop;
    const shopName = product.shop_name || product.shop?.name || 'Campus Merchant';

    if (stock <= 0) return { success: false, reason: 'OUT_OF_STOCK' };

    const initialQty = Math.min(Math.max(1, quantity), stock);
    const newItem = {
      productId: product.id,
      shopId: shopId,
      shopName: shopName,
      productName: product.name,
      price: parseFloat(product.price || 0),
      quantity: initialQty,
      current_stock: stock,
      unit: product.unit_display || product.unit || 'Piece',
      image: product.image || null,
    };
    setCartItems([newItem]);
    return { success: true };
  };

  const cancelShopConflict = () => {
    setShopConflict(null);
  };

  const removeFromCart = (productId) => {
    setCartItems((prev) => prev.filter((item) => item.productId !== productId));
  };

  const updateQuantity = (productId, newQuantity) => {
    if (newQuantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCartItems((prev) =>
      prev.map((item) => {
        if (item.productId === productId) {
          const maxStock = item.current_stock || 999;
          const capped = Math.min(newQuantity, maxStock);
          return { ...item, quantity: capped };
        }
        return item;
      })
    );
  };

  const clearCart = () => {
    setCartItems([]);
    setShopConflict(null);
  };

  const itemCount = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
  }, [cartItems]);

  const cartTotal = useMemo(() => {
    return cartItems.reduce((sum, item) => {
      const price = parseFloat(item.price || 0);
      return sum + price * (item.quantity || 1);
    }, 0);
  }, [cartItems]);

  const value = {
    cartItems,
    cartShop,
    shopConflict,
    addToCart,
    forceAddToCart,
    cancelShopConflict,
    removeFromCart,
    updateQuantity,
    clearCart,
    itemCount,
    cartTotal,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export default CartContext;
