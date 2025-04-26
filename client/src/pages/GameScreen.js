import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getGame,
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
  const animationIntervalRef = useRef(null); // Ref для интервала анимации

  // Новые состояния для анимации выбора
  const [isSelecting, setIsSelecting] = useState(false); 
  const [highlightedIndex, setHighlightedIndex] = useState(null);
  const [placedFingers, setPlacedFingers] = useState([]); // Сохраняем пальцы

  const fetchGameData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true); // Управляем показом лоадера
    setError(null);
    try {
      const data = await getGame(gameId);
      setGameData(data);
      setCurrentDisplayTask(data.currentTask); 
      // Если игра уже в процессе выбора при загрузке (маловероятно, но возможно)
      if (data.status === 'selecting' && !isSelecting) {
         // Здесь можно подумать, нужно ли возобновлять анимацию
         // Пока просто отобразим, что идет выбор
      }
      // Сбросим анимацию если статус сменился с selecting
      if (data.status !== 'selecting' && isSelecting) {
          setIsSelecting(false);
          setHighlightedIndex(null);
          if (animationIntervalRef.current) {
              clearTimeout(animationIntervalRef.current);
              animationIntervalRef.current = null;
          }
      }
    } catch (err) {
      console.error('Error fetching game data:', err);
      setError(err.message || 'Не удалось загрузить данные игры.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [gameId, isSelecting]); // Добавили isSelecting в зависимости

  useEffect(() => {
    fetchGameData();
  }, [fetchGameData]); 

  useEffect(() => {
      return () => {
          if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
          if (animationIntervalRef.current) clearTimeout(animationIntervalRef.current); // Очищаем интервал
      };
  }, []);

  // Логика анимации мерцания
  useEffect(() => {
    if (!isSelecting || !placedFingers.length) {
      if (animationIntervalRef.current) {
        clearTimeout(animationIntervalRef.current); // Используем clearTimeout для рекурсивного setTimeout
        animationIntervalRef.current = null;
      }
      setHighlightedIndex(null); 
      return;
    }

    console.log("Starting selection animation...");
    let currentIndex = 0;
    let intervalTime = 300; 
    let cycles = 0;
    const totalCycles = 15 + Math.floor(Math.random() * 10); 
    const accelerationPoint = Math.floor(totalCycles * 0.4); 

    // Функция для одного шага анимации
    const step = () => {
        setHighlightedIndex(currentIndex % placedFingers.length);
      
        currentIndex++;
        cycles++;

        // Ускорение
        if (cycles > accelerationPoint && intervalTime > 50) {
            intervalTime = Math.max(50, intervalTime * 0.85); 
        }
      
        // Остановка анимации или следующий шаг
        if (cycles >= totalCycles) {
            console.log("Animation finished. Selecting player...");
            const winnerIndex = Math.floor(Math.random() * placedFingers.length);
            const winnerFinger = placedFingers[winnerIndex];
            setHighlightedIndex(winnerIndex); 
            handlePerformSelection(winnerFinger.fingerId); 
        } else {
            // Запускаем следующий таймаут с текущим (возможно, измененным) интервалом
            animationIntervalRef.current = setTimeout(step, intervalTime);
        }
    };

    // Запускаем первый шаг
    animationIntervalRef.current = setTimeout(step, intervalTime);

    // Очистка при размонтировании или изменении isSelecting/placedFingers
    return () => {
      if (animationIntervalRef.current) {
        clearTimeout(animationIntervalRef.current); // Используем clearTimeout
        animationIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, [isSelecting, placedFingers]);

  if (loading && !gameData) { // Показываем лоадер только при первой загрузке
    return <div className="game-container status-message">Загрузка игры...</div>;
  }

  if (error) {
    return <div className="game-container status-message error-message">Ошибка: {error}</div>;
  }

  if (!gameData && !loading) { // Если не грузится и данных нет
    return <div className="game-container status-message">Нет данных об игре.</div>;
  }
  
  // Обработчик готовности (когда все пальцы поставлены)
  const handleReadyToStart = (fingers) => {
      console.log("All fingers placed:", fingers);
      setPlacedFingers(fingers); // Сохраняем информацию о пальцах
      setIsSelecting(true); // Запускаем анимацию выбора
      // Не вызываем API здесь, API будет вызван после анимации
  };

  // Выполняем выбор победителя/задания на бэкенде ПОСЛЕ анимации
  const handlePerformSelection = async (selectedFingerId) => {
    setLoading(true); // Показываем лоадер пока идет запрос
    setError(null);
    setCurrentDisplayTask(null); 
    try {
        // Передаем ID выбранного пальца (если режим "задание")
        // Бэкенд сам решит, использовать ли ID или выбрать случайно (для режима "победитель")
        const response = await selectWinnerOrTaskPlayer(gameId, selectedFingerId); 
        setGameData(response.game); 
        
        if (response.aiGeneratedTask) {
            setCurrentDisplayTask(response.aiGeneratedTask);
        } else {
            setCurrentDisplayTask(response.game.currentTask);
        }
        // Анимация уже завершилась, подсветка на победителе осталась
        // isSelecting должен стать false после обновления gameData (сделаем в fetchGameData)

    } catch (err) {
        console.error("Error performing selection:", err);
        setError(err.message || 'Ошибка при выборе.');
        setIsSelecting(false); // Сбрасываем анимацию в случае ошибки
        setHighlightedIndex(null);
    } finally {
        // setLoading(false); // Лоадер сбросится при обновлении gameData в fetchGameData
        // Вызовем fetchGameData без лоадера, чтобы обновить статус и сбросить isSelecting
        fetchGameData(false); 
    }
  };
  
    // Обработчик действия игрока (выполнить/провалить/выбыть)
    const handlePlayerAction = async (action) => {
      const playerFingerId = gameData?.winnerFingerId; 
      if (!gameData || (gameData.status !== 'task_assigned' && gameData.status !== 'selecting') || playerFingerId === null) return; // Добавили selecting, т.к. результат теперь на этом экране
      
      setLoading(true);
      setError(null);
      setCurrentDisplayTask(null); 
      if (feedbackTimeoutRef.current) {
          clearTimeout(feedbackTimeoutRef.current);
          feedbackTimeoutRef.current = null;
          setFeedbackMessage(null); 
      }

      try {
          const updatedGame = await updatePlayerStatus(gameId, playerFingerId, action);
          setGameData(updatedGame);
          
          if (action === 'eliminate') {
              const message = `Игрок #${playerFingerId} выбывает!`;
              setFeedbackMessage(message);
              feedbackTimeoutRef.current = setTimeout(() => {
                  setFeedbackMessage(null);
                  feedbackTimeoutRef.current = null;
                  // После сообщения о выбывании, возможно, нужно снова запросить данные игры
                  // чтобы перейти к следующему раунду или завершению
                  fetchGameData(false); 
              }, 3000); 
          } else {
             // Если действие не выбывание, просто обновляем данные
             fetchGameData(false); 
          }
          
      } catch (err) {
          console.error("Error updating player status:", err);
          setError(err.message || 'Ошибка при обновлении статуса игрока.');
      } finally {
          setLoading(false); // Убираем лоадер после всех действий
      }
  };

  // --- Рендеринг контента ---
  const renderGameContent = () => {
      if (!gameData) return null; // На всякий случай

      // Состояния, когда отображается FingerPlacementArea
      const showFingerArea = gameData.status === 'waiting' || isSelecting || gameData.status === 'selecting';
      // Состояние, когда отображается результат выбора (задание или победитель)
      const showSelectionResult = (gameData.status === 'task_assigned' || gameData.status === 'finished') && !isSelecting;

      return (
          <>
              {showFingerArea && (
                  <div>
                      {/* Показываем заголовок в зависимости от состояния */}
                      <h2>{isSelecting ? 'Выбираем...' : 'Ожидание игроков...'}</h2>
                      <FingerPlacementArea 
                          expectedPlayers={gameData.numPlayers}
                          onReadyToStart={handleReadyToStart} 
                          // Передаем доп. пропсы для анимации
                          isSelecting={isSelecting} 
                          highlightedIndex={highlightedIndex}
                          placedFingersData={placedFingers} // Передаем данные о пальцах
                          disabled={isSelecting || gameData.status !== 'waiting'} // Блокируем во время выбора
                      />
                  </div>
              )}

              {/* Показываем результат выбора ПОД областью пальцев */}
              {showSelectionResult && gameData.status === 'task_assigned' && (
                  <TaskDisplay 
                      task={currentDisplayTask} 
                      selectedPlayerFingerId={gameData.winnerFingerId}
                      onAction={handlePlayerAction} 
                      eliminationEnabled={gameData.eliminationEnabled}
                      taskTimeLimit={gameData.eliminationEnabled ? gameData.taskTimeLimit : null}
                  />
              )}

              {showSelectionResult && gameData.status === 'finished' && (
                 <div>
                     <WinnerDisplay 
                        winnerFingerId={gameData.winnerFingerId} 
                        mode={gameData.mode} 
                     />
                     <Button onClick={() => navigate('/')} variant="primary" className="new-game-button">
                        Новая игра
                     </Button>
                 </div>
              )}

              {/* Убираем старую логику рендеринга по статусам, так как все объединено */}
              {/* {gameData.status === 'waiting' && ... } */}
              {/* {gameData.status === 'selecting' && ... } -> заменено на isSelecting */}
              {/* {gameData.status === 'task_assigned' && ... } -> теперь показывается вместе с finger area или после */}
              {/* {gameData.status === 'finished' && ... } -> теперь показывается вместе с finger area или после */}
          </>
      );
  };


  return (
    <div className="game-container">
       {/* Отображаем сообщение обратной связи поверх всего */}
       {feedbackMessage && (
           <div className={`feedback-message ${feedbackMessage ? 'show' : ''}`}> 
               {feedbackMessage}
           </div>
       )}
       
       {/* Показываем лоадер поверх, если loading=true и это не фоновое обновление */}
       {loading && <div className="loading-overlay">Загрузка...</div>}

       {renderGameContent()}
    </div>
  );
}

export default GameScreen; 