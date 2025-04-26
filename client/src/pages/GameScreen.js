import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getGame,
  startGameSelection,
  selectWinnerOrTaskPlayer,
  updatePlayerStatus
} from '../services/api';
import './GameScreen.css'; // Добавим файл стилей позже

// Импорт компонента
import FingerPlacementArea from '../components/FingerPlacementArea';
import AnimationCanvas from '../components/AnimationCanvas';
import TaskDisplay from '../components/TaskDisplay';
import WinnerDisplay from '../components/WinnerDisplay';
import Button from '../components/Button'; // Импортируем Button

// Placeholder компоненты для разных стадий игры (создадим их позже)
// import WinnerDisplay from '../components/WinnerDisplay';

function GameScreen() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [gameData, setGameData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Добавляем состояние для задачи, которая будет отображаться (из БД или AI)
  const [currentDisplayTask, setCurrentDisplayTask] = useState(null);
  const [feedbackMessage, setFeedbackMessage] = useState(null);
  const feedbackTimeoutRef = useRef(null);

  // Используем useCallback для мемоизации функции, чтобы избежать лишних вызовов useEffect
  const fetchGameData = useCallback(async () => {
    setError(null);
    try {
      // Используем функцию getGame из сервиса
      const data = await getGame(gameId);
      setGameData(data);
      // При первоначальной загрузке устанавливаем задачу для отображения
      setCurrentDisplayTask(data.currentTask); // currentTask будет null если игра только началась
    } catch (err) {
      console.error('Error fetching game data:', err);
      setError(err.message || 'Не удалось загрузить данные игры.');
      if (err.response?.status === 404) { 
          // Можно добавить обработку 404
      }
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  // Загрузка данных при монтировании компонента
  useEffect(() => {
    setLoading(true); // Устанавливаем loading перед запросом
    fetchGameData();
    // TODO: WebSocket или polling
  }, [fetchGameData]); // Используем мемоизированную функцию в зависимостях

  // Очистка таймаута при размонтировании
  useEffect(() => {
      return () => {
          if (feedbackTimeoutRef.current) {
              clearTimeout(feedbackTimeoutRef.current);
          }
      };
  }, []);

  // --- Рендеринг в зависимости от состояния --- 

  if (loading) {
    return <div className="game-container status-message">Загрузка игры...</div>;
  }

  if (error) {
    return <div className="game-container status-message error-message">Ошибка: {error}</div>;
  }

  if (!gameData) {
    // Это состояние не должно возникать, если loading=false и нет ошибки, но на всякий случай
    return <div className="game-container status-message">Нет данных об игре.</div>;
  }

  // --- Отображение контента в зависимости от статуса игры --- 
  const renderGameContent = () => {
    switch (gameData.status) {
      case 'waiting':
        return (
          <div>
            <h2>Ожидание игроков...</h2>
            {/* Используем FingerPlacementArea */}
            <FingerPlacementArea 
              expectedPlayers={gameData.numPlayers}
              onReadyToStart={handleReadyToStart} 
            />
          </div>
        );
      case 'selecting':
        return (
          <AnimationCanvas 
            players={gameData.players} 
            onSelectionTrigger={handlePerformSelection}
          />
        );
      case 'task_assigned':
        return (
          <TaskDisplay 
            // Передаем задачу для отображения из состояния
            task={currentDisplayTask} 
            selectedPlayerFingerId={gameData.winnerFingerId}
            onAction={handlePlayerAction} 
            eliminationEnabled={gameData.eliminationEnabled}
            // Передаем лимит времени, если он есть и выбывание включено
            taskTimeLimit={gameData.eliminationEnabled ? gameData.taskTimeLimit : null}
          />
        );
      case 'finished':
        return (
          <div>
            {/* Используем WinnerDisplay */}
            <WinnerDisplay 
              winnerFingerId={gameData.winnerFingerId} 
              mode={gameData.mode} 
            />
            <Button onClick={() => navigate('/')} variant="primary" className="new-game-button">
              Новая игра
            </Button>
          </div>
        );
      default:
        return <div className="status-message">Неизвестный статус игры: {gameData.status}</div>;
    }
  };

 // --- Обработчики действий (заглушки, реализуем позже) --- 

  // Вызывается, когда все пальцы на месте (из FingerPlacementArea)
  const handleReadyToStart = async (fingers) => {
      setLoading(true);
      setError(null);
      try {
          // Используем startGameSelection из сервиса
          const updatedGame = await startGameSelection(gameId, fingers);
          setGameData(updatedGame);
      } catch (err) {
          console.error("Error starting selection:", err);
          setError(err.message || 'Ошибка при старте выбора.');
      } finally {
          setLoading(false);
      }
  };

  // Обновляем обработчик выбора
  const handlePerformSelection = async () => {
    setLoading(true);
    setError(null);
    setCurrentDisplayTask(null); // Очищаем предыдущую задачу перед запросом
    try {
        const response = await selectWinnerOrTaskPlayer(gameId);
        setGameData(response.game); // Обновляем основное состояние игры
        
        // Устанавливаем задачу для отображения
        if (response.aiGeneratedTask) {
            // Если пришла AI задача
            setCurrentDisplayTask(response.aiGeneratedTask);
        } else {
            // Иначе используем задачу из обновленного gameData (может быть null)
            setCurrentDisplayTask(response.game.currentTask);
        }
    } catch (err) {
        console.error("Error performing selection:", err);
        setError(err.message || 'Ошибка при выборе.');
    } finally {
        setLoading(false);
    }
  };

  // Обновляем обработчик действия игрока
  const handlePlayerAction = async (action) => {
      const playerFingerId = gameData?.winnerFingerId; // Сохраняем ID игрока перед запросом
      if (!gameData || gameData.status !== 'task_assigned' || playerFingerId === null) return;
      
      setLoading(true);
      setError(null);
      setCurrentDisplayTask(null); 
      // Очищаем предыдущий таймаут сообщения, если он был
      if (feedbackTimeoutRef.current) {
          clearTimeout(feedbackTimeoutRef.current);
          feedbackTimeoutRef.current = null;
          setFeedbackMessage(null); // И сбрасываем сообщение сразу
      }

      try {
          const updatedGame = await updatePlayerStatus(gameId, playerFingerId, action);
          setGameData(updatedGame);
          
          // Показываем сообщение о выбывании
          if (action === 'eliminate') {
              const message = `Игрок #${playerFingerId} выбывает!`;
              setFeedbackMessage(message);
              // Устанавливаем таймаут для скрытия сообщения
              feedbackTimeoutRef.current = setTimeout(() => {
                  setFeedbackMessage(null);
                  feedbackTimeoutRef.current = null;
              }, 3000); // Показываем 3 секунды
          } 
          // else if (action === 'complete_task') { ... можно добавить сообщение об успешном выполнении ... }
          
      } catch (err) {
          console.error("Error updating player status:", err);
          setError(err.message || 'Ошибка при обновлении статуса игрока.');
      } finally {
          setLoading(false);
      }
  };


  return (
    <div className="game-container">
       {/* Отображаем сообщение обратной связи поверх всего */}
       {feedbackMessage && (
           <div className="feedback-message show"> 
               {feedbackMessage}
           </div>
       )}
       
      {/* Можно добавить общий заголовок или навигацию */} 
      {renderGameContent()}
    </div>
  );
}

export default GameScreen; 