import { API_URL } from '../config/api';

/**
 * Проверяет доступность сервера
 * @returns Promise<boolean> - true если сервер доступен, false если нет
 */
export const checkServerHealth = async (): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 секунд timeout
    
    const response = await fetch(`${API_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error: any) {
    console.error('Server health check failed:', error);
    return false;
  }
};

/**
 * Получает понятное сообщение об ошибке подключения
 */
export const getConnectionErrorMessage = (): string => {
  return `Не вдалося підключитися до сервера.\n\nПеревірте:\n1. Сервер запущений на ${API_URL}\n2. Пристрій і комп'ютер в одній мережі\n3. Фаєрвол не блокує з'єднання\n4. IP адрес правильний (може змінитися)`;
};



