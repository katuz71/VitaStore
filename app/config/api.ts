// API Configuration
// В продакшене используйте переменные окружения или конфигурацию сборки
// Для разработки: замените на локальный IP вашего компьютера (например, '192.168.1.161')
// Узнать локальный IP: ipconfig (Windows) или ifconfig (Mac/Linux)

// ⚠️ TEMPORARY: Forced to use production URL for testing
// TODO: Revert to environment-based logic after testing

// Определяем API URL в зависимости от окружения
const getApiUrl = (): string => {
  // В продакшене используем переменную окружения или константу
  // if (process.env.EXPO_PUBLIC_API_URL) {
  //   return process.env.EXPO_PUBLIC_API_URL;
  // }
  
  // Для разработки используем локальный IP
  // ВАЖНО: Замените на ваш локальный IP для тестирования на реальном устройстве
  // const DEV_API_URL = 'http://192.168.1.161:8001';
  
  // В продакшене (при сборке) используйте ваш домен
  const PROD_API_URL = 'https://dikoros.store';
  
  // Определяем окружение (можно настроить через переменные окружения Expo)
  // const isProduction = process.env.NODE_ENV === 'production' || 
  //                      process.env.EXPO_PUBLIC_ENVIRONMENT === 'production';
  
  // FORCED: Always return production URL for testing
  return PROD_API_URL;
  
  // return isProduction ? PROD_API_URL : DEV_API_URL;
};

export const API_URL = getApiUrl();




