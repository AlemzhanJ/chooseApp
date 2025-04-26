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
  
  // Новые состояния для анимации мерцания
  const [isBlinkingAnimationActive, setIsBlinkingAnimationActive] = useState(false);
  const [highlightedFingerId, setHighlightedFingerId] = useState(null); // Будем использовать fingerId

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

  // --- Эффект для анимации мерцания --- 
  useEffect(() => {
    if (!isBlinkingAnimationActive) return;

    // Получаем ID активных игроков
    const activePlayerFingers = gameData?.players
        ?.filter(p => p.status === 'active')
        ?.map(p => p.fingerId)
        || [];

    if (activePlayerFingers.length === 0) {
      console.warn("Blinking animation started with no active players.");
      setIsBlinkingAnimationActive(false);
      // Возможно, нужно вызвать handlePerformSelection, чтобы завершить раунд/игру
      // handlePerformSelection(); 
      return;
    }
    
    // Если остался только один игрок, он победитель
    if (activePlayerFingers.length === 1) {
        console.log("Only one player left, selecting immediately.");
        setIsBlinkingAnimationActive(false);
        setHighlightedFingerId(null); // Сбрасываем подсветку
        handlePerformSelection(); // Вызываем выбор на бэкенде
        return;
    }

    let currentIndex = 0;
    let intervalTime = 300; // Начальный интервал (медленно)
    const minIntervalTime = 50; // Минимальный интервал (быстро)
    const acceleration = 0.9; // Коэффициент ускорения
    const totalDuration = 5000; // Общая примерная длительность анимации (5 секунд)
    let elapsedTime = 0;

    let animationTimeoutId = null;

    const blinkStep = () => {
      // Обновляем подсвеченный палец
      setHighlightedFingerId(activePlayerFingers[currentIndex % activePlayerFingers.length]);

      // Увеличиваем индекс
      currentIndex++;

      // Уменьшаем интервал для ускорения
      intervalTime = Math.max(minIntervalTime, intervalTime * acceleration);
      elapsedTime += intervalTime;
      
      // Планируем следующий шаг или завершаем
      if (elapsedTime < totalDuration && isBlinkingAnimationActive) {
        animationTimeoutId = setTimeout(blinkStep, intervalTime);
      } else {
        // Анимация завершена
        setIsBlinkingAnimationActive(false);
        setHighlightedFingerId(null); // Сбрасываем подсветку
        // Выбираем победителя на бэкенде
        handlePerformSelection(); 
      }
    };

    // Запускаем первый шаг
    animationTimeoutId = setTimeout(blinkStep, intervalTime);

    // Очистка при размонтировании или остановке анимации
    return () => {
      if (animationTimeoutId) {
        clearTimeout(animationTimeoutId);
      }
      setHighlightedFingerId(null); // Убираем подсветку при очистке
    };

  // Зависимости: запускаем эффект при старте анимации или изменении активных игроков
  }, [isBlinkingAnimationActive, gameData?.players, handlePerformSelection]); 


  // --- ОБРАБОТЧИКИ --- 
  // Переносим обработчики сюда, ДО условных рендеров
  // Оборачиваем все в useCallback для стабильности ссылок

  // Вызывается, когда все пальцы на месте (из FingerPlacementArea)
  const handleReadyToStart = useCallback(async (fingers) => {
      setLoading(true);
      setError(null);
      setHighlightedFingerId(null); // Сбрасываем подсветку перед стартом
      try {
          // Используем startGameSelection из сервиса
          // Важно: передаем fingers в API
          const updatedGame = await startGameSelection(gameId, fingers); 
          setGameData(updatedGame); // Обновляем gameData

          // Проверяем, можно ли начать анимацию
          const activePlayers = updatedGame.players?.filter(p => p.status === 'active');
          if (updatedGame.status === 'selecting' && activePlayers && activePlayers.length > 0) {
              // Запускаем анимацию мерцания
              setIsBlinkingAnimationActive(true);
          } else {
              // Если статус не тот или нет активных игроков
              console.warn('Cannot start animation. Status:', updatedGame.status, 'Active players:', activePlayers?.length);
          }
      } catch (err) {
          console.error("Error starting selection:", err);
          setError(err.message || 'Ошибка при старте выбора.');
      } finally {
          setLoading(false);
      }
  // Зависимости: gameId и функции установки состояния
  }, [gameId, setLoading, setError, setHighlightedFingerId, setGameData, setIsBlinkingAnimationActive]); 

  // Обработчик выбора (уже обернут)
  const handlePerformSelection = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCurrentDisplayTask(null); // Очищаем предыдущую задачу перед запросом
    try {
        const response = await selectWinnerOrTaskPlayer(gameId);
        setGameData(response.game); // Обновляем основное состояние игры
        
        // Устанавливаем задачу для отображения
        if (response.aiGeneratedTask) {
            setCurrentDisplayTask(response.aiGeneratedTask);
        } else {
            setCurrentDisplayTask(response.game.currentTask);
        }
    } catch (err) {
        console.error("Error performing selection:", err);
        setError(err.message || 'Ошибка при выборе.');
    } finally {
        setLoading(false);
    }
  // Зависимости для useCallback
  }, [gameId, setLoading, setError, setCurrentDisplayTask, setGameData]);

  // Обработчик действия игрока
  const handlePlayerAction = useCallback(async (action) => {
      // Используем gameData из замыкания useCallback
      const playerFingerId = gameData?.winnerFingerId;
      if (!gameData || gameData.status !== 'task_assigned' || playerFingerId === null) return;
      
      setLoading(true);
      setError(null);
      setCurrentDisplayTask(null); 
      // Очищаем предыдущий таймаут сообщения, если он был
      if (feedbackTimeoutRef.current) {
          clearTimeout(feedbackTimeoutRef.current);
          feedbackTimeoutRef.current = null;
          setFeedbackMessage(null); 
      }

      try {
          const updatedGame = await updatePlayerStatus(gameId, playerFingerId, action);
          setGameData(updatedGame);
          
          // Показываем сообщение о выбывании
          if (action === 'eliminate') {
              const message = `Игрок #${playerFingerId} выбывает!`;
              setFeedbackMessage(message);
              feedbackTimeoutRef.current = setTimeout(() => {
                  setFeedbackMessage(null);
                  feedbackTimeoutRef.current = null;
              }, 3000); 
          } 
          
      } catch (err) {
          console.error("Error updating player status:", err);
          setError(err.message || 'Ошибка при обновлении статуса игрока.');
      } finally {
          setLoading(false);
      }
  // Зависимости: gameId, gameData (для доступа к winnerFingerId и status), функции состояния
  }, [gameId, gameData, setLoading, setError, setCurrentDisplayTask, setFeedbackMessage, setGameData]);

  // Обработчик удаления пальца во время анимации
  const handleFingerRemovedDuringAnimation = useCallback(async (removedFingerId) => {
      console.log(`Finger ${removedFingerId} removed during animation.`);
            
      setLoading(true);
      setError(null);

      try {
          const updatedGame = await updatePlayerStatus(gameId, removedFingerId, 'eliminate');
          setGameData(updatedGame); 
          
          const message = `Игрок #${removedFingerId} выбывает (убрал палец)!`;
          setFeedbackMessage(message);
          if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
          feedbackTimeoutRef.current = setTimeout(() => {
              setFeedbackMessage(null);
              feedbackTimeoutRef.current = null;
          }, 3000);
          
          const remainingActivePlayers = updatedGame.players?.filter(p => p.status === 'active').length || 0;
          
          if (remainingActivePlayers <= 1) {
              console.log('Less than 2 players remaining after elimination, ending selection.');
              setIsBlinkingAnimationActive(false); 
              setHighlightedFingerId(null);
              // Вызываем handlePerformSelection, чтобы бэкенд определил победителя/завершил игру
              // handlePerformSelection должен быть доступен здесь
              handlePerformSelection(); 
          } else {
              console.log('Continuing animation with remaining players.');
          }

      } catch (err) {
          console.error("Error eliminating player during animation:", err);
          setError(err.message || 'Ошибка при исключении игрока.');
          setIsBlinkingAnimationActive(false); 
          setHighlightedFingerId(null);
      } finally {
          setLoading(false);
      }
  // Зависимости: gameId, функции состояния, handlePerformSelection
  }, [gameId, setLoading, setError, setGameData, setFeedbackMessage, setIsBlinkingAnimationActive, setHighlightedFingerId, handlePerformSelection]);

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
        // Отображаем FingerPlacementArea и когда ждем, и когда идет анимация
        if (!isBlinkingAnimationActive) {
          // Обычное состояние ожидания
          return (
            <div>
              <h2>Ожидание игроков...</h2>
              <FingerPlacementArea 
                expectedPlayers={gameData.numPlayers}
                onReadyToStart={handleReadyToStart} 
                // Передаем пустой массив, если пальцев еще нет или игра только началась
                placedFingers={gameData.players?.filter(p => p.status === 'active').map(p => p.fingerData) || []} 
              />
            </div>
          );
        } else {
          // Состояние активной анимации мерцания
          return (
            <div>
              <h2>Выбираем...</h2> {/* Или другой текст */} 
              <FingerPlacementArea 
                expectedPlayers={gameData.numPlayers}
                // В режиме анимации блокируем добавление новых и готовность
                onReadyToStart={() => {}} 
                isAnimating={true} // Указываем, что идет анимация
                highlightedFingerId={highlightedFingerId} // Передаем ID подсвеченного пальца
                onFingerRemoved={handleFingerRemovedDuringAnimation} // Новый обработчик
                placedFingers={gameData.players?.filter(p => p.status === 'active').map(p => p.fingerData) || []} // Передаем текущие пальцы
              />
            </div>
          );
        }
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