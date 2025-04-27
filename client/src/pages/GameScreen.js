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
  // const [highlightedIndex, setHighlightedIndex] = useState(null); // Заменяем на ID
  const [highlightedFingerId, setHighlightedFingerId] = useState(null);
  // const [placedFingers, setPlacedFingers] = useState([]); // Больше не нужно, управляется внутри FingerPlacementArea

  // --- Состояние и Ref для таймера задания --- 
  const [timeLeft, setTimeLeft] = useState(null);
  const timerRef = useRef(null);
  // --- Ref для хранения ID игрока, выполняющего задание ---
  const taskPlayerFingerIdRef = useRef(null);
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

  // --- НОВЫЙ ОБРАБОТЧИК: Поднятие пальца ---
  const handleFingerLift = useCallback(async (liftedFingerId) => {
      console.log(`GameScreen: handleFingerLift called for fingerId: ${liftedFingerId}`);
      // Игру не трогаем, если она уже завершена или если палец поднят в состоянии waiting
      if (!gameData || gameData.status === 'finished' || gameData.status === 'waiting') {
          console.log(`GameScreen: Ignoring finger lift in status: ${gameData?.status}`);
          return;
      }

      // Проверяем, был ли этот игрок активен (избегаем двойного вызова)
      const player = gameData.players.find(p => p.fingerId === liftedFingerId);
      if (!player || player.status !== 'active') {
          console.log(`GameScreen: Ignoring finger lift for non-active player: ${liftedFingerId}, status: ${player?.status}`);
          return; // Игрок уже неактивен
      }

      // Показываем временный лоадер/сообщение
      // setLoading(true); // Возможно, лоадер здесь не нужен, т.к. обновление быстрое
      setError(null);
      setFeedbackMessage(`Игрок #${liftedFingerId} убрал палец...`);
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);

      try {
          const updatedGame = await updatePlayerStatus(gameId, liftedFingerId, 'lifted_finger');
          setGameData(updatedGame);
          // Очищаем сообщение сразу, т.к. результат виден по статусу игрока
          setFeedbackMessage(null); 

          // Если статус стал waiting (т.е. выбор прервался), останавливаем анимацию
          if (updatedGame.status === 'waiting') {
              console.log("Selection interrupted by finger lift, stopping animation.");
              setIsSelecting(false);
              setHighlightedFingerId(null);
              if (animationIntervalRef.current) {
                  clearTimeout(animationIntervalRef.current);
                  animationIntervalRef.current = null;
              }
          }
          // Если статус стал finished, WinnerDisplay отобразится автоматически

      } catch (err) {
          console.error("Error updating player status after finger lift:", err);
          const errorMsg = err.message || 'Ошибка при обработке поднятия пальца.';
          // Не сбрасываем feedbackMessage при ошибке, чтобы пользователь видел ее
          setError(errorMsg);
          setFeedbackMessage(`Ошибка: ${errorMsg}`);
      } finally {
          // setLoading(false);
      }
  }, [gameId, gameData]); // Зависит от gameData для проверки статуса
  // ----------------------------------------

  // --- Обработчик действия игрока --- 
  // Переносим сюда, чтобы он был определен до использования в useEffect таймера
  const handlePlayerAction = useCallback(async (action) => { 
    // --- Захватываем данные из feedbackMessage ДО изменения состояния ---
    const currentFeedback = feedbackMessage; 
    // --- Используем Ref для получения ID игрока задания --- 
    const playerFingerId = taskPlayerFingerIdRef.current; 
    // -----------------------------------------------------------------

    // --- Более строгая проверка перед выполнением --- 
    if (!gameData || playerFingerId === undefined || playerFingerId === null) {
        console.error("handlePlayerAction: Aborting. Invalid context. GameData:", gameData, "FeedbackMsg:", currentFeedback, "Action:", action);
        return; // Прерываем выполнение, если контекст неверный
    }
    // --------------------------------------------------

    // Используем захваченный playerFingerId и продолжаем...
    setFeedbackMessage(null); // Сразу скрываем уведомление
    if (timerRef.current) {
       clearInterval(timerRef.current);
       timerRef.current = null;
    }
    setTimeLeft(null); // Сбрасываем таймер в состоянии
    
    setLoading(true);
    setError(null);
    if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
        feedbackTimeoutRef.current = null;
    }

    try {
        // Используем захваченный playerFingerId
        const updatedGame = await updatePlayerStatus(gameId, playerFingerId, action);
        setGameData(updatedGame);
        
        // --- Проверка на завершение игры ПОСЛЕ обновления --- 
        if (updatedGame.status === 'finished') {
            // Если игра закончилась этим действием, сразу убираем сообщение
            if (feedbackTimeoutRef.current) {
                clearTimeout(feedbackTimeoutRef.current);
                feedbackTimeoutRef.current = null;
            }
            setFeedbackMessage(null);
            setLoading(false); // Убираем лоадер, т.к. обработка завершена
            taskPlayerFingerIdRef.current = null; // Сбрасываем ID игрока задания
            return; // Выходим, так как дальнейшая логика feedbackMessage не нужна
        }
        // ------------------------------------------------------
        
        // Упрощенная проверка для показа сообщения (только если игра не завершена)
        if (action === 'eliminate' || action === 'complete_task') {
            const message = action === 'eliminate'
                ? `Игрок #${playerFingerId} выбывает!`
                : `Игрок #${playerFingerId} отметил выполнение.`; 
            setFeedbackMessage(message); // Показываем временное подтверждение
            feedbackTimeoutRef.current = setTimeout(async () => { 
                setFeedbackMessage(null);
                feedbackTimeoutRef.current = null;
                try {
                    await fetchGameData(false); // Запрашиваем финальное состояние
                } catch (fetchErr) {
                    console.error("Error fetching game data after action:", fetchErr);
                    setError(fetchErr.message || 'Ошибка загрузки состояния после действия.')
                }
                setLoading(false); // Убираем лоадер ПОСЛЕ обновления
            }, 2000); 
        } else {
           // Эта ветка маловероятна для действий с заданием
           try {
               await fetchGameData(false); 
           } catch (fetchErr) {
               console.error("Error fetching game data after action (no msg branch):", fetchErr);
               setError(fetchErr.message || 'Ошибка загрузки состояния после действия.')
           }
           setLoading(false); // Убираем лоадер
        }
        
    } catch (err) {
        console.error("Error updating player status:", err);
        const errorMsg = err.message || 'Ошибка при обновлении статуса игрока.';
        setError(errorMsg);
        setFeedbackMessage(`Ошибка обновления: ${errorMsg}`); 
        setLoading(false); // Убираем лоадер при ошибке
    }

  // Убираем feedbackMessage и добавляем комментарий для линтера
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, fetchGameData, gameData]); 
  // --- Конец переноса handlePlayerAction --- 

  // --- ОБРАБОТЧИК ЗАВЕРШЕНИЯ ВЫБОРА (ПОСЛЕ АНИМАЦИИ) ---
  // useCallback, т.к. используется в useEffect анимации
  const handlePerformSelection = useCallback(async (selectedFingerId) => {
    setLoading(true);
    setError(null);
    setFeedbackMessage(null); // Очищаем предыдущее сообщение ('Выбран #X...')
    setHighlightedFingerId(selectedFingerId); // Держим подсветку на выбранном
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
        setHighlightedFingerId(null);
    } finally {
        // Запрашиваем данные еще раз, чтобы убедиться в актуальности всего состояния
        await fetchGameData(false); 
        setIsSelecting(false); 
        setHighlightedFingerId(null); // Сбрасываем подсветку
        setLoading(false); // Убираем лоадер после fetchGameData
    }
  }, [gameId, fetchGameData]); // Добавили зависимости
  // ----------------------------------------------------

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
    // и есть ID игрока задания
    const isTaskMessage = feedbackMessage?.type === 'task';
    const timeLimit = feedbackMessage?.taskTimeLimit;
    const elimination = feedbackMessage?.eliminationEnabled;
    const currentPlayerId = feedbackMessage?.playerFingerId; // Получаем ID из сообщения

    // Обновляем Ref с ID игрока задания
    if (isTaskMessage && currentPlayerId !== undefined) {
        taskPlayerFingerIdRef.current = currentPlayerId;
    } else if (!isTaskMessage) {
         taskPlayerFingerIdRef.current = null; // Сбрасываем, если не задание
    }

    // Запускаем таймер, если все условия соблюдены
    if (isTaskMessage && elimination && timeLimit > 0 && taskPlayerFingerIdRef.current !== null) {
      setTimeLeft(timeLimit); // Устанавливаем начальное время

      timerRef.current = setInterval(() => {
        setTimeLeft(prevTime => {
          if (prevTime <= 1) {
            clearInterval(timerRef.current);
            timerRef.current = null;
            console.log('Time is up! Eliminating player.');
            // Вызываем выбывание для текущего игрока задания
            // Используем ID из Ref, так как feedbackMessage может уже сброситься
            if (taskPlayerFingerIdRef.current !== null) {
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
    console.log("GameScreen: Animation useEffect triggered. isSelecting:", isSelecting, "gameData.status:", gameData?.status);
    // Добавляем проверку статуса
    if (!isSelecting || !gameData || gameData.status !== 'selecting' || !gameData.players) {
      console.log("GameScreen: Animation useEffect cleanup or aborting.", { isSelecting, status: gameData?.status });
      if (animationIntervalRef.current) {
        clearTimeout(animationIntervalRef.current); // Используем clearTimeout для рекурсивного setTimeout
        animationIntervalRef.current = null;
      }
      setHighlightedFingerId(null);
      return;
    }

    // Фильтруем активных игроков НА МОМЕНТ НАЧАЛА АНИМАЦИИ
    const activePlayersForAnimation = gameData.players.filter(p => p.status === 'active');
    console.log(`Starting selection animation with ${activePlayersForAnimation.length} active players...`);
    if (activePlayersForAnimation.length === 0) {
         console.warn("Animation started with 0 active players. Aborting.");
         setIsSelecting(false); // Останавливаем, если нет игроков
         return;
    }

    let currentIndex = 0;
    let intervalTime = 300; 
    let cycles = 0;
    const totalCycles = 10 + Math.floor(Math.random() * 6) * activePlayersForAnimation.length; // Зависит от числа игроков
    const accelerationPoint = Math.floor(totalCycles * 0.4); 

    // Функция для одного шага анимации
    const step = () => {
        // Получаем fingerId подсвечиваемого игрока из *отфильтрованного* массива
        const playerToHighlight = activePlayersForAnimation[currentIndex % activePlayersForAnimation.length];
        setHighlightedFingerId(playerToHighlight.fingerId);
      
        currentIndex++;
        cycles++;

        // Ускорение
        if (cycles > accelerationPoint && intervalTime > 50) {
            intervalTime = Math.max(50, intervalTime * 0.85); 
        }
      
        // Остановка анимации или следующий шаг
        if (cycles >= totalCycles) {
            console.log("Animation finished. Selecting player...");
            // Выбираем случайного из активных игроков
            const winnerIndex = Math.floor(Math.random() * activePlayersForAnimation.length);
            const winnerPlayer = activePlayersForAnimation[winnerIndex];
            setHighlightedFingerId(winnerPlayer.fingerId); // Финальная подсветка
            // --- Добавляем визуальный индикатор --- 
            setFeedbackMessage(`Выбран #${winnerPlayer?.fingerId}. Вызов API...`);
            handlePerformSelection(winnerPlayer.fingerId);
        } else {
            // Запускаем следующий таймаут с текущим (возможно, измененным) интервалом
            animationIntervalRef.current = setTimeout(step, intervalTime);
        }
    };

    // Запускаем первый шаг, если есть активные игроки
    animationIntervalRef.current = setTimeout(step, intervalTime);

    // Очистка при размонтировании или изменении isSelecting/placedFingers
    return () => {
      if (animationIntervalRef.current) {
        clearTimeout(animationIntervalRef.current); // Используем clearTimeout
        animationIntervalRef.current = null;
      }
    };
    // Зависим от isSelecting и gameData (для получения players)
    // handlePerformSelection добавлена, т.к. используется внутри
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelecting, gameData, handlePerformSelection]);

  // --- ОБРАБОТЧИК ГОТОВНОСТИ К ВЫБОРУ (обернут в useCallback) ---
  const handleReadyToSelect = useCallback(async (fingers) => {
      console.log("GameScreen: handleReadyToSelect called with fingers:", fingers);
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
          
          setGameData(updatedGame);
          setIsSelecting(true); 
          
      } catch (err) {
          console.error("GameScreen: Error calling startGameSelection API:", err);
          setError(err.message || 'Ошибка при старте фазы выбора.');
          setIsSelecting(false);
      } finally {
           setLoading(false); // Убираем лоадер
      }
  }, [gameId]); // Добавляем зависимость gameId
  // --------------------------------------

  // --- Обработчик свайпа во время задания ---
  const handleSwipeAction = useCallback((direction, fingerId) => {
      console.log(`GameScreen: handleSwipeAction called. Direction: ${direction}, FingerId: ${fingerId}`);

      // Проверяем, что игра в статусе задания и свайп сделал нужный игрок
      if (gameData?.status !== 'task_assigned') {
          console.warn("Swipe detected but game not in task_assigned status.");
          return;
      }

      if (fingerId !== taskPlayerFingerIdRef.current) {
           console.warn(`Swipe detected from wrong fingerId: ${fingerId}. Expected: ${taskPlayerFingerIdRef.current}`);
           return;
      }

      // Определяем действие на основе направления
      const action = direction === 'right' ? 'complete_task' : 'eliminate';

      // Проверяем, разрешено ли выбывание для свайпа влево
      if (action === 'eliminate' && !gameData.eliminationEnabled) {
          console.warn("Swipe left detected but elimination is disabled.");
          // Можно показать короткое сообщение пользователю?
          return;
      }

      console.log(`Calling handlePlayerAction('${action}') for fingerId ${fingerId}...`);
      handlePlayerAction(action); // Вызываем основной обработчик

  }, [gameData, handlePlayerAction]); // Зависит от gameData (для статуса и eliminationEnabled) и handlePlayerAction
  // --------------------------------------

  if (error) {
    return <div className="game-container status-message error-message">Ошибка: {error}</div>;
  }

  if (!gameData && !loading) {
    return <div className="game-container status-message">Нет данных об игре.</div>;
  }

  // --- Рендеринг контента ---
  const renderGameContent = () => {
      if (!gameData) return null; 

      // Область пальцев показываем всегда, кроме finished
      const showFingerArea = gameData.status !== 'finished';
      // Определяем, когда показывать задание - БОЛЬШЕ НЕ НУЖНО
      // const showTask = gameData.status === 'task_assigned' && !isSelecting; 
      // Определяем, когда показывать победителя
      const showWinner = gameData.status === 'finished'; // Не зависим от isSelecting

      let title = 'Ожидание игроков...';
      if (isSelecting) {
          title = 'Выбираем...';
      } else if (gameData.status === 'task_assigned') {
          title = `Задание для #${gameData.winnerFingerId}...`;
      } else if (gameData.status === 'waiting' && gameData.players?.length > 0) {
          // Определяем, есть ли активные пальцы, которых меньше ожидаемого
          const activeTouchesCount = document.querySelectorAll('.finger-circle.status-active').length;
          const expectedActiveCount = gameData.players.filter(p => p.status === 'active').length;

          // Если вернулись в waiting после прерывания выбора/задания
          if (activeTouchesCount < expectedActiveCount) {
              title = 'Кто-то убрал палец! Ждем возвращения...';
          } else {
              title = 'Ожидание готовности...';
          }
      }

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

              {/* Сообщение с заданием отображается через feedbackMessage */} 

              {/* 2. Показываем Область пальцев (если нужно) */} 
              {showFingerArea && (
                  <div className="finger-area-container"> {/* Добавим контейнер для возможного позиционирования */} 
                      {/* Заголовок меняется */} 
                      <h2>{title}</h2>
                      <FingerPlacementArea 
                          expectedPlayers={gameData.numPlayers}
                          // Передаем новые пропсы
                          gameStatus={gameData.status}
                          gamePlayers={gameData.players}
                          onFingerLift={handleFingerLift}
                          onReadyToSelect={handleReadyToSelect}
                          isSelecting={isSelecting}
                          onSwipeAction={handleSwipeAction} // <-- Передаем новый обработчик
                          highlightedFingerId={highlightedFingerId}
                          // disabled больше не нужен
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
       {loading && <div className="loading-overlay">Загрузка...</div>} {/* Показываем лоадер */} 
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
                      {/* --- Кнопки действий удалены --- */} 
                      {/* Подсказка о свайпах теперь в FingerPlacementArea */} 
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