import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CustomerData {
  name: string;
  phone: string;
  city?: string;
  cityRef?: string;
  warehouse?: string;
  warehouseRef?: string;
}

const CUSTOMER_DATA_KEY = '@customer_data';

/**
 * Сохранить данные клиента
 */
export const saveCustomerData = async (data: CustomerData): Promise<void> => {
  try {
    await AsyncStorage.setItem(CUSTOMER_DATA_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Error saving customer data:', error);
    throw error;
  }
};

/**
 * Загрузить данные клиента
 */
export const loadCustomerData = async (): Promise<CustomerData | null> => {
  try {
    const data = await AsyncStorage.getItem(CUSTOMER_DATA_KEY);
    if (data) {
      return JSON.parse(data) as CustomerData;
    }
    return null;
  } catch (error) {
    console.error('Error loading customer data:', error);
    return null;
  }
};

/**
 * Удалить данные клиента
 */
export const clearCustomerData = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(CUSTOMER_DATA_KEY);
  } catch (error) {
    console.error('Error clearing customer data:', error);
    throw error;
  }
};

