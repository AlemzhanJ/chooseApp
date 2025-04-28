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
  const [feedbackMessage, setFeedbackMessage] = useState(null); // Теперь может быть string или { type: 'task', ... } // Остается только для временных string сообщений
  const [currentTaskDetails, setCurrentTaskDetails] = useState(null); // { playerFingerId, taskData, taskTimeLimit, eliminationEnabled } | null
  const feedbackTimeoutRef = useRef(null);
  const animationIntervalRef = useRef(null); // Ref для интервала анимации

  // --- Состояния для отладки ответов API ---
  const [debugLastApiResponse, setDebugLastApiResponse] = useState(null);
  const [debugSelectionResponse, setDebugSelectionResponse] = useState(null);
  // -----------------------------------------

  // Новые состояния для анимации выбора
  const [isSelecting, setIsSelecting] = useState(false); 
  // const [highlightedIndex, setHighlightedIndex] = useState(null); // Заменяем на ID
  const [highlightedFingerId, setHighlightedFingerId] = useState(null);
  // const [placedFingers, setPlacedFingers] = useState([]); // Больше не нужно, управляется внутри FingerPlacementArea

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

  // --- НОВЫЙ ОБРАБОТЧИК: Поднятие пальца ---
  const handleFingerLift = useCallback(async (liftedFingerId) => {
      console.log(`GameScreen: handleFingerLift called for fingerId: ${liftedFingerId}`);
      // Игру не трогаем, если она уже завершена или если палец поднят в состоянии waiting (когда таймер еще не пошел)
      // Также игнорируем, если идет задание и палец принадлежит исполнителю задания (он должен быть на месте)
      if (!gameData || gameData.status === 'finished' || gameData.status === 'waiting' ||
          (gameData.status === 'task_assigned' && currentTaskDetails?.playerFingerId === liftedFingerId)) {
          console.log(`GameScreen: Ignoring finger lift in status: ${gameData?.status} or for task player: ${liftedFingerId}`);
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
          setError(errorMsg);
          setFeedbackMessage(`Ошибка: ${errorMsg}`);
      } finally {
          // setLoading(false);
      }
  }, [gameId, gameData, currentTaskDetails]); // Зависит от gameData для проверки статуса
  // ----------------------------------------

  // --- Обработчик действия игрока --- 
  // Переносим сюда, чтобы он был определен до использования в useEffect таймера
  const handlePlayerAction = useCallback(async (action, fingerIdOverride = null) => { // Добавлен fingerIdOverride
    // --- Получаем ID игрока: сначала из override, потом из деталей задания --- 
    const isTaskRelatedAction = action === 'eliminate' || action === 'complete_task';
    // Используем ?. для playerFingerId на случай если currentTaskDetails еще не успел очиститься
    const playerFingerId = fingerIdOverride !== null ? fingerIdOverride : currentTaskDetails?.playerFingerId; 
    // --------------------------------------------------------------------------

    // --- Добавляем лог для проверки рассинхронизации ID ---
    if (fingerIdOverride !== null && currentTaskDetails && currentTaskDetails.playerFingerId !== fingerIdOverride) {
        console.warn(`[handlePlayerAction] Discrepancy: fingerIdOverride=${fingerIdOverride} but currentTaskDetails.playerFingerId=${currentTaskDetails.playerFingerId}`);
    }
    // -----------------------------------------------------

    // --- Более строгая проверка перед выполнением --- 
    // Проверяем наличие ID, только если действие связано с заданием
    if (!gameData || (isTaskRelatedAction && (playerFingerId === undefined || playerFingerId === null))) {
        console.error("handlePlayerAction: Aborting. Invalid context.", { gameData, action, playerFingerId, currentTaskDetails, fingerIdOverride });
        return; // Прерываем выполнение, если контекст неверный
    }
    // --------------------------------------------------

    // Используем захваченный playerFingerId и продолжаем...
    // setFeedbackMessage(null); // Не сбрасываем общие уведомления здесь
    if (timerRef.current) {
       clearInterval(timerRef.current);
       timerRef.current = null;
    }
    setTimeLeft(null); // Сбрасываем таймер в состоянии
    
    setLoading(true); // Показываем лоадер для действия
    setError(null);
    if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
        feedbackTimeoutRef.current = null;
    }

    // --- Устанавливаем статус API вызова в pending ---
    setDebugLastApiResponse({ status: 'pending', action: action, fingerId: playerFingerId });
    // -----------------------------------------------
    try {
        // Используем ID игрока, полученный из override или currentTaskDetails
        console.log(`Calling updatePlayerStatus for player ${playerFingerId} with action ${action}`);
        const updatedGame = await updatePlayerStatus(gameId, playerFingerId, action);
        setGameData(updatedGame);
        // --- Сохраняем ответ API для отладки ---
        setDebugLastApiResponse({ status: 'success', response: updatedGame });
        // ---------------------------------------
        
        // --- ЯВНО Очищаем детали задания после успешного действия --- 
        if (isTaskRelatedAction) {
            setCurrentTaskDetails(null);
        }
        // ------------------------------------------------------

        // Показываем короткое сообщение и убираем лоадер
        if (action === 'eliminate' || action === 'complete_task') {
            const message = action === 'eliminate'
                ? `Игрок #${playerFingerId} выбывает!`
                : `Игрок #${playerFingerId} отметил выполнение.`;
            setFeedbackMessage(message);
            if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current); // Очищаем старый таймаут, если есть
            feedbackTimeoutRef.current = setTimeout(() => {
                setFeedbackMessage(null);
                feedbackTimeoutRef.current = null;
            }, 1500); // Показываем сообщение 1.5 секунды
        }
        setLoading(false); // Убираем лоадер сразу
        
    } catch (err) {
        console.error("Error updating player status:", err);
        // --- Сохраняем ошибку API для отладки ---
        const errorMsg = err.message || 'Unknown error in updatePlayerStatus';
        setDebugLastApiResponse({ status: 'error', message: errorMsg });
        // ---------------------------------------
        const errorMsgDisplay = err.message || 'Ошибка при обновлении статуса игрока.';
        setError(errorMsgDisplay);
        setFeedbackMessage(`Ошибка обновления: ${errorMsgDisplay}`); // Показываем ошибку
        setLoading(false); // Убираем лоадер при ошибке
    }

  // Зависимости: gameId, fetchGameData, gameData (для проверки статуса), currentTaskDetails (для очистки и получения ID по умолчанию)
  }, [gameId, fetchGameData, gameData, currentTaskDetails]); 
  // --- Конец переноса handlePlayerAction --- 

  // --- НОВЫЙ ОБРАБОТЧИК ДЛЯ ДЕЙСТВИЙ С ЗАДАНИЕМ ИЗ FINGER AREA ---
  const handleTaskAction = useCallback((action, taskPlayerFingerId) => {
    console.log(`GameScreen: handleTaskAction called with action: ${action}, fingerId: ${taskPlayerFingerId}`);
    // Сразу вызываем handlePlayerAction, передавая ID из FingerArea
    const backendAction = action === 'yes' ? 'complete_task' : 'eliminate';
    console.log(`Mapping FingerArea action '${action}' to backend action '${backendAction}' for fingerId ${taskPlayerFingerId}. Calling handlePlayerAction...`);
    handlePlayerAction(backendAction, taskPlayerFingerId); // <--- Передаем fingerId напрямую
  }, [handlePlayerAction]);
  // ------------------------------------------------------------

  // --- ОБРАБОТЧИК ЗАВЕРШЕНИЯ ВЫБОРА (ПОСЛЕ АНИМАЦИИ) ---
  // useCallback, т.к. используется в useEffect анимации
  const handlePerformSelection = useCallback(async (selectedFingerId) => {
    // setHighlightedFingerId(null); // <-- УДАЛЯЕМ СБРОС ЗДЕСЬ
    setLoading(true);
    setDebugSelectionResponse(null); // Сбрасываем предыдущий ответ
    setError(null);
    setFeedbackMessage(null); // Очищаем предыдущее сообщение ('Выбран #X...')
    try {
        console.log(`Calling selectWinnerOrTaskPlayer API with fingerId: ${selectedFingerId}...`);
        // Вызываем API, передавая выбранный ID
        const response = await selectWinnerOrTaskPlayer(gameId, selectedFingerId);
        console.log("API Response:", response);
        // --- Сохраняем ответ API для отладки ---
        setDebugSelectionResponse(response.game);
        // ---------------------------------------
        setGameData(response.game);
        
        const taskData = response.aiGeneratedTask || response.game.currentTask;
        const serverSelectedFingerId = response.game.winnerFingerId; // ID выбранного сервером

        // --- Устанавливаем подсветку и детали задания ПОСЛЕ ответа сервера ---
        if (response.game.status === 'task_assigned' || response.game.status === 'finished') {
            if (response.game.status === 'task_assigned' && taskData) {
                // Сначала детали, потом подсветка
                setCurrentTaskDetails({
                    playerFingerId: serverSelectedFingerId,
                    taskData: taskData,
                    taskTimeLimit: response.game.eliminationEnabled ? response.game.taskTimeLimit : null,
                    eliminationEnabled: response.game.eliminationEnabled
                });
            } else {
                setCurrentTaskDetails(null); // Сбрасываем детали, если игра закончилась
            }
            // Подсветка устанавливается в любом случае (task_assigned или finished)
            console.log(`Server selected fingerId: ${serverSelectedFingerId}. Highlighting.`);
            setHighlightedFingerId(serverSelectedFingerId); // <--- Перенесено сюда
            // Убеждаемся, что подсвечен именно тот, кого выбрал клиент (и подтвердил сервер)
            // Хотя сервер и так должен вернуть game.winnerFingerId === selectedFingerId
            if (serverSelectedFingerId !== selectedFingerId) {
                console.warn(`Discrepancy! Client selected ${selectedFingerId}, but server responded with winner ${serverSelectedFingerId}. Using server's choice.`);
            }
            setHighlightedFingerId(serverSelectedFingerId); // Устанавливаем подсветку по ответу сервера
        } else {
            // Если статус неожиданный, сбрасываем и детали, и подсветку
            setCurrentTaskDetails(null);
            setHighlightedFingerId(null);
            setFeedbackMessage(`Выбор завершен, статус: ${response.game.status}`);
            if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
            feedbackTimeoutRef.current = setTimeout(() => setFeedbackMessage(null), 3000);
        }
        // ----------------------------------------------------

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
        // Сбрасываем подсветку только если не finished и не task_assigned
        if (gameDataRef.current?.status !== 'finished' && gameDataRef.current?.status !== 'task_assigned') {
            setHighlightedFingerId(null);
        }
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
          setCurrentTaskDetails(null); // Сброс задания при размонтировании
      };
  // Пустой массив зависимостей, чтобы cleanup сработал только один раз при размонтировании
  // gameId и gameDataRef доступны благодаря замыканию и ref
  }, [gameId]); 

  // --- Эффект для таймера задания --- 
  useEffect(() => {
    // Запускаем таймер только если feedbackMessage - это задание с лимитом
    // Используем currentTaskDetails
    const taskDetails = currentTaskDetails;
    const timeLimit = taskDetails?.taskTimeLimit;
    const elimination = taskDetails?.eliminationEnabled;
    const playerFingerIdForTimer = taskDetails?.playerFingerId; // Захватываем ID для замыкания

    if (taskDetails && elimination && timeLimit > 0) {
      setTimeLeft(timeLimit); // Устанавливаем начальное время

      timerRef.current = setInterval(() => {
        setTimeLeft(prevTime => {
          if (prevTime <= 1) {
            clearInterval(timerRef.current);
            timerRef.current = null;
            console.log('Time is up! Eliminating player.');
            // Вызываем выбывание для текущего игрока задания
            // Используем захваченный playerFingerIdForTimer
            if (playerFingerIdForTimer !== undefined) {
                handlePlayerAction('eliminate', playerFingerIdForTimer); // <--- Передаем fingerId
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
    // Зависимости: currentTaskDetails (чтобы реагировать на его появление/смену) и handlePlayerAction
  }, [currentTaskDetails, handlePlayerAction]);
  // ----------------------------------

  // --- Эффект для очистки деталей задания при смене статуса --- 
  useEffect(() => {
    if (gameData?.status !== 'task_assigned' && currentTaskDetails) {
        console.log(`Game status changed from task_assigned (${gameData?.status}). Clearing task details.`);
        setCurrentTaskDetails(null);
    }
  }, [gameData?.status, currentTaskDetails]);
  // --------------------------------------------------------

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
      // setHighlightedFingerId(null); // <-- УБИРАЕМ ОТСЮДА
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
            console.log("Animation finished. Selecting player locally...");
            // --- ВОЗВРАЩАЕМ: Выбор победителя на клиенте ---
            const winnerIndex = Math.floor(Math.random() * activePlayersForAnimation.length);
            const winnerPlayer = activePlayersForAnimation[winnerIndex];
            setHighlightedFingerId(winnerPlayer.fingerId); // Финальная подсветка
            console.log(`Client selected fingerId: ${winnerPlayer.fingerId}. Calling API...`);
            // --- КОНЕЦ ВОЗВРАТА ---
            handlePerformSelection(winnerPlayer.fingerId); // <--- Передаем выбранный ID
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
      console.log("[Cleanup Animation Effect] Resetting highlight.");
      setHighlightedFingerId(null); // <-- ПЕРЕНОСИМ СБРОС СЮДА
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
          // Убираем текст задания из заголовка FingerPlacementArea
          // title = `Задание для #${gameData.winnerFingerId}...`; 
          title = 'Выполните задание!'; // Новый общий заголовок для фазы задания
      } else if (gameData.status === 'waiting' && gameData.players?.length > 0) {
          // Если вернулись в waiting после прерывания выбора/задания
          title = 'Ожидание готовности...';
      }

      // --- Информация для FingerPlacementArea о текущем задании ---
      // --- Логирование перед расчетом activeTaskInfo ---
      /* // <-- УБРАНО
      console.log('[Render] Calculating activeTaskInfo:', {
          gameStatus: gameData?.status,
          currentTaskDetailsExists: !!currentTaskDetails,
          // currentTaskDetails: currentTaskDetails // Можно раскомментировать для полных деталей
      });
      */ // <-- УБРАНО
      // -------------------------------------------------
      const activeTaskInfo = gameData.status === 'task_assigned' && currentTaskDetails
          ? { 
              playerFingerId: currentTaskDetails.playerFingerId,
              eliminationEnabled: currentTaskDetails.eliminationEnabled,
              taskText: currentTaskDetails.taskData?.text || 'Выполните задание!',
              isAiGenerated: currentTaskDetails.taskData?.isAiGenerated || false,
              timeLeft: timeLeft, // Передаем актуальное состояние таймера
              taskTimeLimit: currentTaskDetails.taskTimeLimit
            }
          : null;
      // -----------------------------------------------------------

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
                          highlightedFingerId={highlightedFingerId}
                          // НОВЫЕ ПРОПСЫ для задания
                          activeTaskInfo={activeTaskInfo}
                          onTaskAction={handleTaskAction} 
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
       {/* --- Рендеринг ТОЛЬКО строковых feedbackMessage --- */} 
       {feedbackMessage && feedbackMessage.type !== 'task' && ( // НЕ показываем сообщение типа task здесь
           <div className={`feedback-message simple-notification show`}> 
               <p>{feedbackMessage}</p>
                {/* Можно добавить обработку других НЕ task типов, если нужно */} 
           </div>
       )}
       {/* ----------------------------------------- */} 

      {renderGameContent()}
    </div>
  );
}

export default GameScreen; 