import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getGame,
  selectWinnerOrTaskPlayer,
  updatePlayerStatus,
  startGameSelection
} from '../services/api';
import './GameScreen.css'; // Добавим файл стилей позже

// Импорт компонента
import FingerPlacementArea from '../components/FingerPlacementArea';
// import AnimationCanvas from '../components/AnimationCanvas'; // Эта строка уже закомментирована, но видимо остался старый импорт
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
          setPlacedFingers(updatedGame.players); // Используем данные из ответа API
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
    setCurrentDisplayTask(null); 
    try {
        const response = await selectWinnerOrTaskPlayer(gameId, selectedFingerId); 
        setGameData(response.game); 
        
        // --- ВИЗУАЛЬНАЯ ОТЛАДКА ЗАДАНИЯ --- 
        let taskInfoForDebug = "No AI task in response";
        if (response.aiGeneratedTask) {
             taskInfoForDebug = `AI Task: text='${response.aiGeneratedTask.text?.substring(0, 50)}...', isAIGen=${response.aiGeneratedTask.isAiGenerated}`; 
        } else if (response.game.currentTask) {
             taskInfoForDebug = `DB Task ID: ${response.game.currentTask}`;
        }
        setFeedbackMessage(taskInfoForDebug); // Показываем инфо о задании
        // ---------------------------------
        
        if (response.aiGeneratedTask) {
            setCurrentDisplayTask(response.aiGeneratedTask);
        } else {
            setCurrentDisplayTask(response.game.currentTask);
        }

    } catch (err) {
        console.error("Error performing selection:", err);
        const errorMsg = err.message || 'Ошибка при выборе.';
        setError(errorMsg);
        setFeedbackMessage(`Ошибка API: ${errorMsg}`); // Обновляем сообщение об ошибке
        setIsSelecting(false); 
        setHighlightedIndex(null);
    } finally {
        await fetchGameData(false); 
        setIsSelecting(false); 
        // setLoading не нужен, т.к. fetchGameData управляет им
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
      if (!gameData) return null; 

      // Определяем, когда показывать область пальцев
      const showFingerArea = gameData.status === 'waiting' || isSelecting || gameData.status === 'task_assigned';
      // Определяем, когда показывать задание
      const showTask = gameData.status === 'task_assigned' && !isSelecting;
      // Определяем, когда показывать победителя
      const showWinner = gameData.status === 'finished' && !isSelecting;

      return (
          <>
              {/* 1. Показываем Задание (если есть) */} 
              {showTask && (
                  <TaskDisplay 
                      task={currentDisplayTask} 
                      selectedPlayerFingerId={gameData.winnerFingerId}
                      onAction={handlePlayerAction} 
                      eliminationEnabled={gameData.eliminationEnabled}
                      taskTimeLimit={gameData.eliminationEnabled ? gameData.taskTimeLimit : null}
                  />
              )}

              {/* 2. Показываем Область пальцев (если нужно) */} 
              {showFingerArea && (
                  <div className="finger-area-container"> {/* Добавим контейнер для возможного позиционирования */} 
                      {/* Заголовок меняется */} 
                      <h2>{isSelecting ? 'Выбираем...' : (gameData.status === 'task_assigned' ? `Задание для #${gameData.winnerFingerId}` : 'Ожидание игроков...')}</h2>
                      <FingerPlacementArea 
                          expectedPlayers={gameData.numPlayers}
                          onReadyToStart={handleReadyToStart} 
                          isSelecting={isSelecting} 
                          highlightedIndex={highlightedIndex}
                          placedFingersData={placedFingers} 
                          // Блокируем, если идет выбор ИЛИ задание уже назначено
                          disabled={isSelecting || gameData.status === 'task_assigned'} 
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