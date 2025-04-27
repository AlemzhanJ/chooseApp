import axios from 'axios';

// Пытаемся получить URL API из переменных окружения.
// Если его нет (например, при локальной разработке без .env файла или если он не установлен на Vercel),
// используем localhost.
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// Логируем, какой URL используется, для отладки (будет видно в консоли браузера)
console.log("API Client using baseURL:", API_URL);

// Настройка экземпляра axios (опционально, но полезно для заголовков и т.д.)
const apiClient = axios.create({
  baseURL: API_URL, // Устанавливаем базовый URL
  headers: {
    'Content-Type': 'application/json',
  },
});

// TODO: Добавить функции для каждого эндпоинта

// --- Game API --- 

export const createGame = async (settings) => {
  // Пути теперь должны быть относительными от baseURL, т.е. /api/games
  try {
    const response = await apiClient.post('/api/games', settings);
    return response.data;
  } catch (error) {
    console.error('API Error (createGame):', error.response || error.message);
    throw error.response?.data || new Error('Ошибка при создании игры');
  }
};

export const getGame = async (gameId) => {
  try {
    const response = await apiClient.get(`/api/games/${gameId}`);
    return response.data;
  } catch (error) {
    console.error('API Error (getGame):', error.response || error.message);
    throw error.response?.data || new Error('Ошибка при загрузке игры');
  }
};

export const startGameSelection = async (gameId, fingers) => {
  try {
    const response = await apiClient.put(`/api/games/${gameId}/start`, { fingers });
    return response.data;
  } catch (error) {
    console.error('API Error (startGameSelection):', error.response || error.message);
    throw error.response?.data || new Error('Ошибка при старте выбора');
  }
};

export const selectWinnerOrTaskPlayer = async (gameId, selectedFingerId) => {
  try {
    const response = await apiClient.post(`/api/games/${gameId}/select`, { selectedFingerId });
    return response.data;
  } catch (error) {
    console.error('API Error (selectWinnerOrTaskPlayer):', error.response || error.message);
    throw error.response?.data || new Error('Ошибка при выполнении выбора');
  }
};

export const updatePlayerStatus = async (gameId, fingerId, action) => {
  try {
    const response = await apiClient.put(`/api/games/${gameId}/players/${fingerId}`, { action });
    return response.data;
  } catch (error) {
    console.error('API Error (updatePlayerStatus):', error.response || error.message);
    throw error.response?.data || new Error('Ошибка при обновлении статуса игрока');
  }
};

// --- Task API --- 

export const getRandomTask = async (difficulty = 'any') => {
  try {
    const response = await apiClient.get('/api/tasks/random', {
      params: { difficulty: difficulty === 'any' ? undefined : difficulty }, 
    });
    return response.data;
  } catch (error) {
    console.error('API Error (getRandomTask):', error.response || error.message);
    throw error.response?.data || new Error('Ошибка при получении задания');
  }
};

export const addTask = async (taskData) => {
  try {
    const response = await apiClient.post('/api/tasks', taskData);
    return response.data;
  } catch (error) {
    console.error('API Error (addTask):', error.response || error.message);
    throw error.response?.data || new Error('Ошибка при добавлении задания');
  }
};

// --- НОВАЯ ФУНКЦИЯ УДАЛЕНИЯ --- 
export const deleteGameAPI = async (gameId) => {
  try {
    // Используем метод DELETE и правильный путь с /api
    await apiClient.delete(`/api/games/${gameId}`);
    console.log(`Game ${gameId} deletion requested successfully.`);
    // Для DELETE обычно не ожидается тело ответа, кроме кодов 204 или 404/500
  } catch (error) {
    console.error(`Error deleting game ${gameId}:`, error.response?.data || error.message);
    // Можно не пробрасывать ошибку дальше, если удаление в фоне не критично
    // throw error; 
  }
};

// Экспортируем функции, а не сам клиент
// export default apiClient; 