import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
// Убираем прямой импорт axios
// import axios from 'axios'; 
// Импортируем нужную функцию из нашего API сервиса
import { createGame } from '../services/api'; 
import Button from '../components/Button'; // Импортируем Button
import './SettingsScreen.css'; // Добавим файл стилей

function SettingsScreen() {
  const navigate = useNavigate();
  const [numPlayers, setNumPlayers] = useState(2); // По умолчанию 2 игрока
  const [mode, setMode] = useState('simple'); // ('simple' | 'tasks')
  const [isTimedMode, setIsTimedMode] = useState(false); // Новый стейт для режима на время
  const [taskDifficulty, setTaskDifficulty] = useState('any'); // ('easy', 'medium', 'hard', 'any')
  const [useAiTasks, setUseAiTasks] = useState(false); // <--- Добавлено состояние для AI
  const [taskTimeLimit, setTaskTimeLimit] = useState(30); // <--- Добавлено состояние для времени (в секундах)
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleStartGame = async (e) => {
    e.preventDefault(); // Предотвращаем стандартную отправку формы
    setIsLoading(true);
    setError(null);

    const gameSettings = {
      numPlayers,
      mode,
      // Передаем настройки только для режима 'tasks'
      ...(mode === 'tasks' && { 
          eliminationEnabled: true, // Всегда включено для режима с заданиями
          taskDifficulty, 
          useAiTasks,
          // Добавляем время, только если включен режим на время
          ...(isTimedMode && { taskTimeLimit: parseInt(taskTimeLimit, 10) || 30 })
      }),
    };

    console.log('Sending game settings:', gameSettings); // Логируем настройки для отладки

    try {
      // Используем функцию из сервиса API
      const newGame = await createGame(gameSettings);
      if (newGame && newGame._id) {
        navigate(`/game/${newGame._id}`); // Переход на экран игры
      } else {
         setError('Не удалось получить ID игры от сервера.');
      }
    } catch (err) {
      // Обработка ошибок теперь может использовать сообщение из сервиса
      console.error('Error creating game:', err);
      setError(err.message || 'Ошибка при создании игры. Попробуйте еще раз.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="settings-container">
      <h1>Настройки Игры</h1>
      <form onSubmit={handleStartGame} className="settings-form">
        {/* Выбор режима */}
        <div className="form-group">
          <label>Режим игры:</label>
          <div className="radio-group">
            <label>
              <input
                type="radio"
                value="simple"
                checked={mode === 'simple'}
                onChange={(e) => setMode(e.target.value)}
              />
              Простой (выбрать одного)
            </label>
            <label>
              <input
                type="radio"
                value="tasks"
                checked={mode === 'tasks'}
                onChange={(e) => setMode(e.target.value)}
              />
              С заданиями
            </label>
          </div>
        </div>

        {/* Количество игроков */}
        <div className="form-group">
          <label htmlFor="numPlayers">Макс. игроков (пальцев):</label>
          <input
            type="number"
            id="numPlayers"
            min="2"
            max="10" // Ограничим макс. количество
            value={numPlayers}
            onChange={(e) => setNumPlayers(parseInt(e.target.value, 10))}
            required
          />
        </div>

        {/* Настройки для режима с заданиями */}
        {mode === 'tasks' && (
          <>
            {/* Чекбокс AI Заданий */}
            <div className="form-group checkbox-group ai-checkbox">
              <label htmlFor="useAiTasks">
                <input
                  type="checkbox"
                  id="useAiTasks"
                  checked={useAiTasks}
                  onChange={(e) => setUseAiTasks(e.target.checked)}
                />
                ✨ Использовать AI для генерации заданий?
              </label>
            </div>

            {/* Заменяем чекбокс выбывания на чекбокс режима на время */}
            <div className="form-group checkbox-group timed-mode-checkbox">
              <label htmlFor="isTimedMode">
                <input
                  type="checkbox"
                  id="isTimedMode"
                  checked={isTimedMode}
                  onChange={(e) => setIsTimedMode(e.target.checked)}
                />
                ⏱️ Ограничить время на задание?
              </label>
            </div>

            {/* Поле для ввода времени, появляется только если включен режим на время */}
            {isTimedMode && (
                 <div className="form-group">
                    <label htmlFor="taskTimeLimit">Время на задание (сек):</label>
                    <input
                      type="number"
                      id="taskTimeLimit"
                      min="5" // Минимум 5 секунд
                      max="300" // Максимум 5 минут
                      value={taskTimeLimit}
                      onChange={(e) => setTaskTimeLimit(e.target.value)}
                      required // Делаем обязательным, если включен режим на время
                    />
                 </div>
            )}

            <div className="form-group">
              <label htmlFor="taskDifficulty">Сложность заданий {useAiTasks ? '(для AI)' : '(из базы)'}:</label>
              <select
                id="taskDifficulty"
                value={taskDifficulty}
                onChange={(e) => setTaskDifficulty(e.target.value)}
              >
                <option value="any">Любая</option>
                <option value="easy">Легкая</option>
                <option value="medium">Средняя</option>
                <option value="hard">Сложная</option>
              </select>
            </div>
          </>
        )}

        {error && <p className="error-message">{error}</p>}

        <Button type="submit" variant="success" className="start-game-button" disabled={isLoading}>
          {isLoading ? 'Создание игры...' : 'Начать Игру!'}
        </Button>
      </form>
    </div>
  );
}

export default SettingsScreen; 