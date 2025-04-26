import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getGame,
  selectWinnerOrTaskPlayer,
  updatePlayerStatus,
  startGameSelection,
  deleteGameAPI
} from '../services/api';
import './GameScreen.css'; // Добавим файл стилей позже

// Импорт компонента
import FingerPlacementArea from '../components/FingerPlacementArea';
// import AnimationCanvas from '../components/AnimationCanvas'; // Эта строка уже закомментирована, но видимо остался старый импорт
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
  // const [currentDisplayTask, setCurrentDisplayTask] = useState(null); // Удаляем это состояние
  const [feedbackMessage, setFeedbackMessage] = useState(null); // Теперь может быть string или { type: 'task', ... }
  const feedbackTimeoutRef = useRef(null);
  const animationIntervalRef = useRef(null); // Ref для интервала анимации

  // Новые состояния для анимации выбора
  const [isSelecting, setIsSelecting] = useState(false); 
  const [highlightedIndex, setHighlightedIndex] = useState(null);
  const [placedFingers, setPlacedFingers] = useState([]); // Сохраняем пальцы

  // --- Состояние и Ref для таймера задания --- 
  const [timeLeft, setTimeLeft] = useState(null);
  const timerRef = useRef(null);
  // -----------------------------------------

  const gameDataRef = useRef(gameData); // Используем ref для доступа к последнему gameData в cleanup

  // Обновляем ref при изменении gameData
  useEffect(() => {
      gameDataRef.current = gameData;
  }, [gameData]);

  const fetchGameData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true); // Управляем показом лоадера
    setError(null);
    try {
      const data = await getGame(gameId);
      setGameData(data);
      // setCurrentDisplayTask(data.currentTask); // Удаляем присваивание
      // Если игра уже в процессе выбора при загрузке (маловероятно, но возможно)
      if (data.status === 'selecting' && !isSelecting) {
         // Здесь можно подумать, нужно ли возобновлять анимацию
         // Пока просто отобразим, что идет выбор
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

  // --- Обработчик действия игрока --- 
  // Переносим сюда, чтобы он был определен до использования в useEffect таймера
  const handlePlayerAction = useCallback(async (action) => { 
    const playerFingerId = feedbackMessage?.type === 'task' 
                           ? feedbackMessage.playerFingerId 
                           : gameData?.winnerFingerId;
                           
    if (!gameData || !playerFingerId) return;
    
    const currentFeedback = feedbackMessage;
    setFeedbackMessage(null); 
    if (timerRef.current) {
       clearInterval(timerRef.current);
       timerRef.current = null;
    }
    setTimeLeft(null);
    
    setLoading(true);
    setError(null);
    if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
        feedbackTimeoutRef.current = null;
    }

    try {
        const updatedGame = await updatePlayerStatus(gameId, playerFingerId, action);
        setGameData(updatedGame);
        
        if (action === 'eliminate' || (action === 'complete_task' && currentFeedback?.type === 'task')) {
            const message = action === 'eliminate'
                ? `Игрок #${playerFingerId} выбывает!`
                : `Игрок #${playerFingerId} отметил выполнение.`; 
            setFeedbackMessage(message);
            feedbackTimeoutRef.current = setTimeout(() => {
                setFeedbackMessage(null);
                feedbackTimeoutRef.current = null;
                fetchGameData(false); 
            }, 2000); 
        } else {
           fetchGameData(false); 
        }
        
    } catch (err) {
        console.error("Error updating player status:", err);
        const errorMsg = err.message || 'Ошибка при обновлении статуса игрока.';
        setError(errorMsg);
        setFeedbackMessage(`Ошибка обновления: ${errorMsg}`); 
    } finally {
        setLoading(false); 
    }
  }, [gameId, fetchGameData, gameData, feedbackMessage]);
  // --- Конец переноса handlePlayerAction --- 

  useEffect(() => {
      return () => {
          // --- Логика удаления игры при выходе --- 
          const currentGameData = gameDataRef.current; // Получаем последнее состояние
          if (currentGameData && currentGameData.status === 'finished') {
              console.log(`GameScreen unmounting. Game ${gameId} is finished. Requesting deletion...`);
              // Вызываем API удаления (fire-and-forget)
              deleteGameAPI(gameId);
          }
          // -------------------------------------
          
          // Очистка других таймеров/интервалов
          if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
          if (animationIntervalRef.current) clearTimeout(animationIntervalRef.current); 
          if (timerRef.current) clearInterval(timerRef.current); 
      };
  // Пустой массив зависимостей, чтобы cleanup сработал только один раз при размонтировании
  // gameId и gameDataRef доступны благодаря замыканию и ref
  }, [gameId]); 

  // --- Эффект для таймера задания --- 
  useEffect(() => {
    // Запускаем таймер только если feedbackMessage - это задание с лимитом
    const isTaskMessage = feedbackMessage?.type === 'task';
    const timeLimit = feedbackMessage?.taskTimeLimit;
    const elimination = feedbackMessage?.eliminationEnabled;
    
    if (isTaskMessage && elimination && timeLimit > 0) {
      setTimeLeft(timeLimit); // Устанавливаем начальное время

      timerRef.current = setInterval(() => {
        setTimeLeft(prevTime => {
          if (prevTime <= 1) {
            clearInterval(timerRef.current);
            timerRef.current = null;
            console.log('Time is up! Eliminating player.');
            // Вызываем выбывание для текущего игрока задания
            if (feedbackMessage?.playerFingerId !== undefined) {
                handlePlayerAction('eliminate'); 
            }
            return 0;
          }
          return prevTime - 1;
        });
      }, 1000); 

      // Очистка
      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };
    } else {
      // Если таймер не нужен, убедимся, что он очищен и время сброшено
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setTimeLeft(null); 
    }
    // Зависимости: сам объект feedbackMessage (чтобы реагировать на его появление/смену) и handlePlayerAction
  }, [feedbackMessage, handlePlayerAction]);
  // ----------------------------------

  // Логика анимации мерцания
  useEffect(() => {
    console.log("GameScreen: Animation useEffect triggered. isSelecting:", isSelecting, "placedFingers:", placedFingers);
    if (!isSelecting || !placedFingers || placedFingers.length === 0) { // Добавил проверку placedFingers
      console.log("GameScreen: Animation useEffect cleanup or aborting. isSelecting:", isSelecting, "placedFingers length:", placedFingers?.length);
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
            // --- Добавляем визуальный индикатор --- 
            setFeedbackMessage(`Выбран #${winnerFinger?.fingerId}. Вызов API...`);
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

  if (error) {
    return <div className="game-container status-message error-message">Ошибка: {error}</div>;
  }

  if (!gameData && !loading) { // Если данных нет, но загрузка уже прошла (или была убрана), показываем сообщение
    return <div className="game-container status-message">Нет данных об игре.</div>;
  }

  // Обработчик готовности (когда все пальцы поставлены)
  const handleReadyToStart = async (fingers) => {
      console.log("GameScreen: handleReadyToStart called with fingers:", fingers);
      if (!fingers || fingers.length === 0) {
          console.error("GameScreen: Received empty fingers data!");
          return; 
      }
      
      setLoading(true); // Показываем лоадер пока идет запрос к бэкенду
      setError(null);
      try {
          // --- Вызываем API для смены статуса на 'selecting' --- 
          console.log("GameScreen: Calling startGameSelection API...");
          const updatedGame = await startGameSelection(gameId, fingers);
          console.log("GameScreen: startGameSelection API successful. New status:", updatedGame.status);
          
          // Сохраняем пальцы и запускаем анимацию ТОЛЬКО после успеха API
          setGameData(updatedGame); // Обновляем gameData сразу
          setPlacedFingers(fingers); // ПРАВИЛЬНО! Используем `fingers` с координатами из аргумента.
          setIsSelecting(true); 
          
      } catch (err) {
          console.error("GameScreen: Error calling startGameSelection API:", err);
          setError(err.message || 'Ошибка при старте фазы выбора.');
          // Не запускаем анимацию в случае ошибки
          setIsSelecting(false);
          setPlacedFingers([]);
      } finally {
           setLoading(false); // Убираем лоадер
      }
  };

  // Выполняем выбор победителя/задания на бэкенде ПОСЛЕ анимации
  const handlePerformSelection = async (selectedFingerId) => {
    setLoading(true); 
    setError(null);
    setFeedbackMessage(null); // Очищаем предыдущее сообщение
    try {
        const response = await selectWinnerOrTaskPlayer(gameId, selectedFingerId); 
        setGameData(response.game); 
        
        const taskData = response.aiGeneratedTask || response.game.currentTask;
        
        if (taskData && response.game.status === 'task_assigned') {
             // Устанавливаем feedbackMessage как объект задания
             setFeedbackMessage({
                 type: 'task',
                 taskData: taskData,
                 playerFingerId: response.game.winnerFingerId,
                 taskTimeLimit: response.game.eliminationEnabled ? response.game.taskTimeLimit : null,
                 eliminationEnabled: response.game.eliminationEnabled
             });
        } else if (response.game.status === 'finished') {
             // Статус finished, WinnerDisplay покажет победителя.
             // Убираем установку feedbackMessage, чтобы не было лишнего уведомления.
             // setFeedbackMessage(`Игра завершена! Победитель: #${response.game.winnerFingerId}`);
             // if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
             // feedbackTimeoutRef.current = setTimeout(() => setFeedbackMessage(null), 3000);
             setFeedbackMessage(null); // Убедимся, что сообщение сброшено
        } else {
            // Если статус не task_assigned и не finished (не должно быть, но на всякий случай)
            setFeedbackMessage(`Выбор завершен, статус: ${response.game.status}`);
             if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
             feedbackTimeoutRef.current = setTimeout(() => setFeedbackMessage(null), 3000);
        }

    } catch (err) {
        console.error("Error performing selection:", err);
        const errorMsg = err.message || 'Ошибка при выборе.';
        setError(errorMsg);
        setFeedbackMessage(`Ошибка API: ${errorMsg}`);
        setIsSelecting(false); 
        setHighlightedIndex(null);
    } finally {
        // Запрашиваем данные еще раз, чтобы убедиться в актуальности всего состояния
        // setLoading(true) будет вызван внутри fetchGameData
        await fetchGameData(false); 
        setIsSelecting(false); 
        setLoading(false); // Убираем лоадер после fetchGameData
    }
  };
  
  // --- Рендеринг контента ---
  const renderGameContent = () => {
      if (!gameData) return null; 

      // Область пальцев показываем всегда, кроме finished
      const showFingerArea = gameData.status !== 'finished';
      // Определяем, когда показывать задание - БОЛЬШЕ НЕ НУЖНО
      // const showTask = gameData.status === 'task_assigned' && !isSelecting; 
      // Определяем, когда показывать победителя
      const showWinner = gameData.status === 'finished' && !isSelecting;

      return (
          <>
              {/* 1. Показываем Задание (если есть) */} 
              {/* {showTask && (
                  <TaskDisplay 
                      task={currentDisplayTask} 
                      selectedPlayerFingerId={gameData.winnerFingerId}
                      onAction={handlePlayerAction} 
                      eliminationEnabled={gameData.eliminationEnabled}
                      taskTimeLimit={gameData.eliminationEnabled ? gameData.taskTimeLimit : null}
                  />
              )} */}

              {/* 2. Показываем Область пальцев (если нужно) */} 
              {showFingerArea && (
                  <div className="finger-area-container"> {/* Добавим контейнер для возможного позиционирования */} 
                      {/* Заголовок меняется */} 
                      <h2>{isSelecting ? 'Выбираем...' : (gameData.status === 'task_assigned' ? `Задание активно...` : 'Ожидание игроков...')}</h2>
                      <FingerPlacementArea 
                          expectedPlayers={gameData.numPlayers}
                          onReadyToStart={handleReadyToStart} 
                          isSelecting={isSelecting} 
                          highlightedIndex={highlightedIndex}
                          placedFingersData={placedFingers} 
                          // Блокируем, если идет выбор ИЛИ задание уже назначено
                          disabled={isSelecting || gameData.status === 'task_assigned' || gameData.status === 'finished'} 
                      />
                  </div>
              )}

              {/* 3. Показываем Победителя (если игра закончена) */} 
              {showWinner && (
                 <div className="winner-container"> {/* Добавим контейнер */} 
                     <WinnerDisplay 
                        winnerFingerId={gameData.winnerFingerId} 
                        mode={gameData.mode} 
                     />
                     <Button onClick={() => navigate('/')} variant="primary" className="new-game-button">
                        Новая игра
                     </Button>
                 </div>
              )}
          </>
      );
  };


  return (
    <div className="game-container">
       {/* --- Обновленный рендеринг feedbackMessage --- */} 
       {feedbackMessage && (
           <div className={`feedback-message ${feedbackMessage.type === 'task' ? 'task-notification' : 'simple-notification'} show`}> 
               {typeof feedbackMessage === 'string' ? (
                   <p>{feedbackMessage}</p>
               ) : feedbackMessage.type === 'task' ? (
                   <>
                      {/* Опциональный AI значок */} 
                      {feedbackMessage.taskData?.isAiGenerated && <div className="ai-badge small">✨ AI</div>}
                      {/* Заголовок задания */}
                      <p className="task-title">Задание для #{feedbackMessage.playerFingerId}:</p>
                      {/* Текст задания */} 
                      <p className="task-text-popup">{feedbackMessage.taskData?.text || 'Текст задания отсутствует'}</p>
                      {/* Таймер */} 
                      {timeLeft !== null && feedbackMessage.taskTimeLimit && (
                          <div className="timer-container-popup">
                              <div className="timer-bar-popup" style={{ width: `${(timeLeft / feedbackMessage.taskTimeLimit) * 100}%` }}></div>
                              <span className="timer-text-popup">{timeLeft} сек</span>
                          </div>
                      )}
                      {/* Кнопки действий */} 
                      <div className="task-actions-popup">
                          <Button 
                              onClick={() => handlePlayerAction('complete_task')}
                              variant="success" 
                              className="action-button small"
                              disabled={timeLeft === 0}
                          >
                              Да!
                          </Button>
                          {feedbackMessage.eliminationEnabled && (
                              <Button 
                                  onClick={() => handlePlayerAction('eliminate')}
                                  variant="danger" 
                                  className="action-button small"
                                  disabled={timeLeft === 0}
                              >
                                  Нет!
                              </Button>
                          )}
                      </div>
                   </>
               ) : null /* Обработка других типов сообщений, если нужно */}
           </div>
       )}
       {/* ----------------------------------------- */} 

      {renderGameContent()}
    </div>
  );
}

export default GameScreen; 