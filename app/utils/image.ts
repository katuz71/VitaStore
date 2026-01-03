import { API_URL } from '../config/api';

export const getImageUrl = (path: string | null | undefined) => {
  if (!path) return 'https://via.placeholder.com/300'; // Заглушка
  if (path.startsWith('http')) return path; // Уже полная ссылка
  // Если это локальный путь, склеиваем с адресом сервера
  return `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
};

