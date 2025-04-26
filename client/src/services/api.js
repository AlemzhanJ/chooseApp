import axios from 'axios';

// Базовый URL для API берется из proxy в package.json при разработке,
// но для production может потребоваться явное указание.
// const API_URL = process.env.REACT_APP_API_URL || '/api'; 

// Настройка экземпляра axios (опционально, но полезно для заголовков и т.д.)
const apiClient = axios.create({
  // baseURL: API_URL, // Можно использовать базовый URL
  headers: {
    'Content-Type': 'application/json',
  },
});

// TODO: Добавить функции для каждого эндпоинта

// --- Game API --- 

export const createGame = async (settings) => {
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

export const selectWinnerOrTaskPlayer = async (gameId) => {
  try {
    // POST запрос без тела
    const response = await apiClient.post(`/api/games/${gameId}/select`);
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
    // Передаем сложность как query parameter
    const response = await apiClient.get('/api/tasks/random', {
      params: { difficulty: difficulty === 'any' ? undefined : difficulty }, // не передаем 'any'
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

// Экспортируем функции, а не сам клиент
// export default apiClient; 