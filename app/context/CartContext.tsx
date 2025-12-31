import React, { createContext, useContext, useState } from 'react';

export interface CartItem {
  id: number;
  name: string;
  price: number;
  image: string;
  quantity: number;
  packSize: string;
  unit?: string; // Unit of measurement (e.g., "шт", "г", "мл")
}

interface CartContextType {
  items: CartItem[];
  
  // ADDING: Supports both names
  addToCart: (product: any, quantity: number, packSize: string, customUnit?: string) => void;
  addItem: (product: any, quantity: number, packSize: string, customUnit?: string) => void;
  
  // REMOVING: Supports both names
  removeFromCart: (cartItemId: string) => void;
  removeItem: (cartItemId: string) => void;
  
  // QUANTITY MANAGEMENT: Match by id AND unit
  addOne: (id: number, unit: string) => void;
  removeOne: (id: number, unit: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  clearCart: () => void;
  totalPrice: number;
}

const CartContext = createContext<CartContextType>({
  items: [],
  addToCart: () => {},
  addItem: () => {},
  removeFromCart: () => {},
  removeItem: () => {},
  addOne: () => {},
  removeOne: () => {},
  updateQuantity: () => {},
  clearCart: () => {},
  totalPrice: 0,
});

export const CartProvider = ({ children }: { children: React.ReactNode }) => {
  const [items, setItems] = useState<CartItem[]>([]);

  // --- ADD LOGIC ---
  const addToCart = (product: any, quantity: number, packSize: string, customUnit?: string) => {
    // Determine the unit to use: customUnit (if provided) > product.unit > "шт"
    const unitToUse = customUnit || product.unit || "шт";
    // Use packSize if provided, otherwise use unitToUse as fallback
    const safePackSize = packSize || unitToUse;

    setItems((currentItems) => {
      // Find existing item by both id AND unit
      // An item is "the same" only if id matches AND unit matches
      const existingIndex = currentItems.findIndex(
        (item) => item.id === product.id && (item.unit || item.packSize || "шт") === unitToUse
      );

      if (existingIndex > -1) {
        const newItems = [...currentItems];
        newItems[existingIndex].quantity += quantity;
        return newItems;
      } else {
        return [
          ...currentItems,
          {
            id: product.id,
            name: product.name,
            price: product.price,
            image: product.image,
            quantity: quantity,
            packSize: safePackSize,
            unit: unitToUse, // Set unit field from customUnit or product.unit or "шт"
          },
        ];
      }
    });
  };

  // Alias for backward compatibility
  const addItem = addToCart;

  // --- REMOVE LOGIC ---
  const removeFromCart = (cartItemId: string) => {
    // We expect ID to be a string like "1-30" (id-packSize)
    // If the old code sends just a number (e.g. 1), we try to filter by ID loosely
    setItems((prev) => prev.filter((item) => {
        const compositeId = `${item.id}-${item.packSize}`;
        // If the input matches the composite ID, remove it
        if (compositeId === cartItemId) return false;
        // If the input matches just the numeric ID (legacy support), remove it
        if (String(item.id) === String(cartItemId)) return false;
        
        return true;
    }));
  };

  // Alias for backward compatibility
  const removeItem = removeFromCart;

  // --- QUANTITY MANAGEMENT (Match by id AND unit) ---
  const addOne = (id: number, unit: string) => {
    setItems((prev) =>
      prev.map((item) => {
        // Match by BOTH id AND unit (or packSize if unit not set)
        const itemUnit = item.unit || item.packSize || "шт";
        if (item.id === id && itemUnit === unit) {
          return { ...item, quantity: item.quantity + 1 };
        }
        return item;
      })
    );
  };

  const removeOne = (id: number, unit: string) => {
    setItems((prev) => {
      const result = prev.map((item) => {
        // Match by BOTH id AND unit (or packSize if unit not set)
        const itemUnit = item.unit || item.packSize || "шт";
        if (item.id === id && itemUnit === unit) {
          const newQuantity = item.quantity - 1;
          // If quantity would be 0 or less, return null to filter out
          if (newQuantity <= 0) {
            return null;
          }
          return { ...item, quantity: newQuantity };
        }
        return item;
      });
      // Filter out null items (removed)
      return result.filter((item): item is CartItem => item !== null);
    });
  };

  const updateQuantity = (cartItemId: string, quantity: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (`${item.id}-${item.packSize}` === cartItemId) {
          return { ...item, quantity: Math.max(0, quantity) };
        }
        return item;
      })
    );
  };

  const clearCart = () => setItems([]);

  const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <CartContext.Provider value={{ 
      items, 
      addToCart, addItem, 
      removeFromCart, removeItem, 
      addOne, removeOne,
      updateQuantity, clearCart, totalPrice 
    }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
