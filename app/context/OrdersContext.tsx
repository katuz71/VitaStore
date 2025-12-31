import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { API_URL } from '../config/api';

export interface Product {
  id: number;
  name: string;
  price: number;
  image: string;
  description?: string;
  category?: string;
  // New fields
  weight?: string;
  composition?: string;
  usage?: string;
  pack_sizes?: string[];  // Changed to array to match backend
  old_price?: number;  // For discount logic
  unit?: string;  // Measurement unit (e.g., "шт", "г", "мл")
}

export type OrderItem = {
  id: number;
  name: string;
  price: number;
  image: string;
  quantity: number;
  packSize: string; // Changed to string to support "30", "60"
};

export type Order = {
  id: string;
  date: string;
  items: OrderItem[];
  total: number;
  city?: string;
  warehouse?: string;
  phone?: string;
  name?: string;
  user_name?: string; // Added for server sync
};

interface OrdersContextType {
  // Product Data
  products: Product[];
  fetchProducts: () => Promise<void>;
  isLoading: boolean;
  
  // Order Data
  orders: Order[];
  addOrder: (order: Order) => void;
  removeOrder: (id: string) => void;
  clearOrders: () => void;
}

const OrdersContext = createContext<OrdersContextType>({
  products: [],
  fetchProducts: async () => {},
  isLoading: false,
  orders: [],
  addOrder: () => {},
  removeOrder: () => {},
  clearOrders: () => {},
});

export const OrdersProvider = ({ children }: { children: ReactNode }) => {
  // --- PRODUCTS STATE ---
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchProducts = async () => {
    try {
      setIsLoading(true);
      console.log("Fetching products from:", `${API_URL}/products`);
      const response = await fetch(`${API_URL}/products`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log("Products response:", data);
      // Ensure data is always an array
      if (Array.isArray(data)) {
        console.log("Products loaded:", data.length);
        setProducts(data);
      } else {
        console.warn("API returned non-array data, using empty array");
        setProducts([]);
      }
    } catch (error: any) {
      console.error("Error fetching products:", error);
      console.error("Error details:", {
        message: error.message,
        name: error.name,
        type: typeof error,
        stack: error.stack
      });
      
      // More detailed error logging
      if (error.message?.includes('Network request failed') || error.message?.includes('Failed to fetch')) {
        console.error("Network error - Server may not be running");
        console.error("Please check:");
        console.error("1. Server is running on", API_URL);
        console.error("2. Device and computer are on the same network");
        console.error("3. Firewall is not blocking the connection");
      } else if (error.message?.includes('timeout')) {
        console.error("Request timeout - Server is too slow to respond");
      }
      
      // Ensure products is always an array even on error
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Load products on startup
  useEffect(() => {
    fetchProducts();
  }, []);

  // --- ORDERS STATE ---
  const [orders, setOrders] = useState<Order[]>([]);

  const addOrder = (order: Order) => {
    setOrders((prev) => [order, ...prev]);
  };

  const removeOrder = (id: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== id));
  };

  const clearOrders = () => {
    setOrders([]);
  };

  return (
    <OrdersContext.Provider value={{ 
      products, fetchProducts, isLoading,
      orders, addOrder, removeOrder, clearOrders 
    }}>
      {children}
    </OrdersContext.Provider>
  );
};

export const useOrders = () => useContext(OrdersContext);
