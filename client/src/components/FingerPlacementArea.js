import React, { useState, useEffect, useRef, useCallback } from 'react';
import './FingerPlacementArea.css';

// --- Константы для свайпа ---
const SWIPE_THRESHOLD_X = 50; // Минимальное смещение по X для свайпа (в пикселях)
const SWIPE_MAX_DURATION = 500; // Максимальная длительность касания для свайпа (в мс)
// -------------------------

// Новый компонент FingerPlacementArea
function FingerPlacementArea({
  expectedPlayers,
  gameStatus,
  gamePlayers, // Массив игроков из gameData для определения статуса
  onFingerLift,
  onReadyToSelect,
  highlightedFingerId, // Теперь используем ID пальца, а не индекс
  isSelecting, // Для управления анимацией/состоянием
  onSwipeAction, // НОВЫЙ ПРОП: обработчик свайпа (direction: 'left' | 'right', fingerId: number) => void
}) {
  const [activeTouches, setActiveTouches] = useState([]); // { touchId: number, fingerId: number, x: number, y: number }
  // --- Новое состояние для отслеживания начальных данных касания ---
  const touchStartData = useRef(new Map()); // Map<touchId, { x: number, y: number, time: number }>
  // -------------------------------------------------------------
  // --- Состояние и Ref для таймера автостарта --- 
  const [countdown, setCountdown] = useState(null); // null | number (секунды)
  const countdownTimerRef = useRef(null);
  const COUNTDOWN_DURATION = 3; // Длительность отсчета в секундах
  // --- Ref для хранения актуального состояния activeTouches --- 
  const activeTouchesRef = useRef(activeTouches);
  // ---------------------------------------------
  const areaRef = useRef(null);
  const nextFingerId = useRef(0); // Для присвоения ID новым пальцам
  const fingerIdMap = useRef(new Map()); // Для отслеживания соответствия touchId -> fingerId
  // --- Ref для отслеживания fingerId, выполняющего задание (если есть) ---
  const taskPlayerFingerIdRef = useRef(null);
  // --------------------------------------------------------------------

  // --- Обновляем Ref при изменении State --- 
  useEffect(() => {
    activeTouchesRef.current = activeTouches;
  }, [activeTouches]);
  // ----------------------------------------

  // --- Сброс состояния при смене статуса игры (например, при возврате в waiting) ---
  useEffect(() => {
    // Сбрасываем пальцы, если игра перешла в неактивное состояние или ждет начала
     if (gameStatus === 'waiting' || gameStatus === 'finished') {
       setActiveTouches([]);
       nextFingerId.current = 0;
       fingerIdMap.current.clear();
       touchStartData.current.clear(); // Очищаем данные о начале касаний
     }
  }, [gameStatus]);

  // --- Обновляем Ref с ID игрока, выполняющего задание ---
  useEffect(() => {
      if (gameStatus === 'task_assigned') {
          const taskPlayer = gamePlayers?.find(p => p.taskStatus === 'pending'); // Ищем игрока с заданием
          taskPlayerFingerIdRef.current = taskPlayer ? taskPlayer.fingerId : null;
          console.log("Task assigned to fingerId:", taskPlayerFingerIdRef.current);
      } else {
          taskPlayerFingerIdRef.current = null; // Сбрасываем, если не та фаза
      }
  }, [gameStatus, gamePlayers]);
  // ---------------------------------------------------

  // --- Вычисляем количество активных игроков, ожидаемых на экране --- 
  let calculatedExpectedCount;
  if (gameStatus === 'waiting' && (!gamePlayers || gamePlayers.length === 0)) {
      calculatedExpectedCount = expectedPlayers ?? 0;
        } else {
      calculatedExpectedCount = gamePlayers?.filter(p => p.status === 'active').length ?? 0;
  }
  // ----------------------------------------------------------------

  // --- Получение координат относительно области ---
  const getRelativeCoords = useCallback((touch) => {
    if (!areaRef.current) return null;
    const rect = areaRef.current.getBoundingClientRect();
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    };
  }, []);

  // --- Обработчик начала касания ---
  const handleTouchStart = useCallback((e) => {
    // Работаем только если игра активна и не в фазе выбора/задания (пальцы уже должны быть)
    // или если мы в waiting и добавляем пальцы
    if (gameStatus === 'finished' || (gameStatus !== 'waiting' && activeTouches.length >= expectedPlayers)) {
        return;
    }
    // Предотвращаем стандартное поведение (скролл, зум)
    // e.preventDefault();

    const touches = e.changedTouches;
    const updatedTouches = [...activeTouches]; // Копируем текущие касания
    const currentFingerIds = new Set(updatedTouches.map(t => t.fingerId));

    for (let i = 0; i < touches.length; i++) {
      const touch = touches[i];
      const coords = getRelativeCoords(touch);
      if (!coords) continue;

      // Проверяем, не достигли ли лимита ИГРОКОВ (не касаний)
      if (updatedTouches.length >= expectedPlayers) break;

      // Находим следующий свободный ID пальца
      let assignedFingerId = -1;
      for (let fid = 0; fid < expectedPlayers; fid++) {
          if (!currentFingerIds.has(fid)) {
              assignedFingerId = fid;
              break;
          }
      }
      
      if (assignedFingerId !== -1 && !fingerIdMap.current.has(touch.identifier)) {
        const newTouch = {
          touchId: touch.identifier,
          fingerId: assignedFingerId,
          x: coords.x,
          y: coords.y,
        };
        updatedTouches.push(newTouch);
        fingerIdMap.current.set(touch.identifier, assignedFingerId); // Сохраняем связь
        currentFingerIds.add(assignedFingerId); // Добавляем в занятые
        // --- Сохраняем начальные данные касания ---
        touchStartData.current.set(touch.identifier, { x: coords.x, y: coords.y, time: Date.now() });
        // ------------------------------------------
        console.log(`Finger added: ID ${assignedFingerId}, TouchID ${touch.identifier}`);
      }
    }
     setActiveTouches(updatedTouches);
  }, [getRelativeCoords, expectedPlayers, activeTouches, gameStatus]);

  // --- Обработчик движения касания ---
  const handleTouchMove = useCallback((e) => {
    if (gameStatus === 'finished') return;
    // Предотвращаем стандартное поведение
    // e.preventDefault();

    const touches = e.changedTouches;
    setActiveTouches(prevTouches => {
      // Создаем новый массив для обновления состояния
      const updatedTouches = prevTouches.map(touchInfo => {
          // Ищем соответствующее изменившееся касание
        for (let i = 0; i < touches.length; i++) {
              const movedTouch = touches[i];
              if (movedTouch.identifier === touchInfo.touchId) {
                  const coords = getRelativeCoords(movedTouch);
                  if (coords) {
                      // Возвращаем обновленный объект касания
                      return { ...touchInfo, x: coords.x, y: coords.y };
                  }
              }
          }
          // Если касание не изменилось, возвращаем его как есть
          return touchInfo;
      });
      return updatedTouches;
    });
  }, [getRelativeCoords, gameStatus]);

  // --- Обработчик окончания/отмены касания ---
  const handleTouchEnd = useCallback((e) => {
    if (gameStatus === 'finished') return;
    // Предотвращаем стандартное поведение
    // e.preventDefault();

    const touches = e.changedTouches;
    // --- ОБНОВЛЕННЫЙ handleTouchEnd с логикой свайпа ---
    const timeNow = Date.now(); // Время окончания касания

    for (let i = 0; i < touches.length; i++) {
      const touch = touches[i];
      const touchId = touch.identifier;
      // Находим ID пальца по ID касания
      const fingerId = fingerIdMap.current.get(touchId);
      // Получаем начальные данные касания
      const startData = touchStartData.current.get(touchId);

      if (fingerId !== undefined) {
         console.log(`Finger lifted: ID ${fingerId}, TouchID ${touchId}`);
         fingerIdMap.current.delete(touchId); // Удаляем связь
         touchStartData.current.delete(touchId); // Удаляем начальные данные

         // --- Логика определения свайпа во время задания ---
         if (gameStatus === 'task_assigned' && startData && onSwipeAction) {
             const coords = getRelativeCoords(touch); // Конечные координаты
             if (coords) {
                 const deltaX = coords.x - startData.x;
                 const deltaTime = timeNow - startData.time;

                 console.log(`[Swipe Check] FingerId: ${fingerId}, DeltaX: ${deltaX}, DeltaTime: ${deltaTime}`);

                 // Проверяем условия свайпа
                 if (deltaTime < SWIPE_MAX_DURATION) {
                     if (deltaX > SWIPE_THRESHOLD_X) {
                         // Свайп вправо ("Да")
                         console.log(`Swipe Right detected for fingerId: ${fingerId}`);
                         onSwipeAction('right', fingerId);
                         // Прерываем дальнейшую обработку поднятия пальца, так как это было действие
                         // setActiveTouches(prevTouches => prevTouches.filter(t => t.touchId !== touchId)); // Палец уже убран
                         continue; // Переходим к следующему касанию в changedTouches
                     } else if (deltaX < -SWIPE_THRESHOLD_X) {
                         // Свайп влево ("Нет")
                         console.log(`Swipe Left detected for fingerId: ${fingerId}`);
                         onSwipeAction('left', fingerId);
                         // Прерываем дальнейшую обработку поднятия пальца
                         // setActiveTouches(prevTouches => prevTouches.filter(t => t.touchId !== touchId)); // Палец уже убран
                         continue; // Переходим к следующему касанию в changedTouches
                     }
                 }
             }
         }
         // --- Конец логики свайпа ---

         // Если это не было свайпом или игра не в фазе задания:
         // Если палец поднят во время активной игры (не waiting), вызываем onFingerLift
         if (gameStatus !== 'waiting' && gameStatus !== 'finished' && gameStatus !== 'task_assigned' /* Добавляем проверку, чтобы не вызывать lift после свайпа */) {
             onFingerLift(fingerId);
         }
         // Если палец убран во время отсчета (в статусе waiting), останавливаем таймер
         if (gameStatus === 'waiting' && countdownTimerRef.current) {
             console.log('Finger lifted during countdown, stopping timer.');
             clearInterval(countdownTimerRef.current);
             countdownTimerRef.current = null;
             setCountdown(null);
         }
         // Удаляем касание из состояния (если это не был свайп, где мы уже использовали continue)
         setActiveTouches(prevTouches => prevTouches.filter(t => t.touchId !== touchId));
      }
    }
  }, [onFingerLift, gameStatus, getRelativeCoords, onSwipeAction]);

  // --- Добавление/удаление обработчиков ---
  useEffect(() => {
    const areaElement = areaRef.current;
    if (!areaElement) return;

    // Добавляем слушатели
    areaElement.addEventListener('touchstart', handleTouchStart, { passive: false });
    areaElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    areaElement.addEventListener('touchend', handleTouchEnd, { passive: false });
    areaElement.addEventListener('touchcancel', handleTouchEnd, { passive: false }); // Отмена = окончание

    // Функция очистки
    return () => {
      areaElement.removeEventListener('touchstart', handleTouchStart);
      areaElement.removeEventListener('touchmove', handleTouchMove);
      areaElement.removeEventListener('touchend', handleTouchEnd);
      areaElement.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  // --- Эффект для запуска таймера автостарта ---
  useEffect(() => {
      // Проверяем условия: статус waiting, нужное кол-во пальцев, таймер еще не запущен
      // Используем activeTouchesRef для получения актуальной длины внутри эффекта
      const currentTouches = activeTouchesRef.current; // Получаем массив касаний из ref
      const currentTouchCount = currentTouches.length;

      // --- Логирование для отладки таймера --- 
      console.log(
        '[Timer Check]',
        `Status: ${gameStatus},`, 
        `Touches: ${currentTouchCount},`, 
        `ExpectedActive (calculated): ${calculatedExpectedCount},`, // Используем вычисленное значение
        `TimerRef: ${countdownTimerRef.current ? 'Exists' : 'null'}`
    );
      // ---------------------------------------

      // Сравниваем количество ТЕКУЩИХ КАСАНИЙ с ОЖИДАЕМЫМ КОЛИЧЕСТВОМ АКТИВНЫХ ИГРОКОВ
      if (gameStatus === 'waiting' && currentTouchCount === calculatedExpectedCount && calculatedExpectedCount > 0 && !countdownTimerRef.current) {
          console.log('All fingers placed, starting auto-start countdown...');
          setCountdown(COUNTDOWN_DURATION);
          countdownTimerRef.current = setInterval(() => {
              setCountdown(prevCountdown => {
                  if (prevCountdown === null) { // Доп. проверка, если таймер успел сброситься
                      clearInterval(countdownTimerRef.current);
                      countdownTimerRef.current = null;
                      return null;
                  }
                  const nextCountdown = prevCountdown - 1;
                  if (nextCountdown <= 0) {
                      console.log('Countdown finished, calling onReadyToSelect.');
                      // Сбрасываем состояние ПЕРЕД вызовом колбэка
                      setCountdown(null);
                      clearInterval(countdownTimerRef.current);
                      countdownTimerRef.current = null;
                       // Передаем только те пальцы, которые соответствуют АКТИВНЫМ игрокам на момент старта
                       /*const fingersToStart = activeTouchesRef.current.filter(touch => 
                           gamePlayers?.find(p => p.fingerId === touch.fingerId && p.status === 'active')
                       );
                       onReadyToSelect(fingersToStart.map(t => ({ fingerId: t.fingerId, x: t.x, y: t.y }))); */
                       // Упрощаем: передаем все текущие пальцы
                       onReadyToSelect(activeTouchesRef.current.map(t => ({ fingerId: t.fingerId, x: t.x, y: t.y })));
                       return null; // Возвращаем null, т.к. отсчет закончился
                  }
                  return nextCountdown;
              });
          }, 1000);
      } else if (currentTouchCount < calculatedExpectedCount && countdownTimerRef.current) {
          // Если убрали палец во время отсчета (условие дублируется в handleTouchEnd, но для надежности)
          console.log('Finger removed during countdown (detected by useEffect), stopping timer.');
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
          setCountdown(null);
      }

      // Очистка при размонтировании
      return () => {
          if (countdownTimerRef.current) {
              clearInterval(countdownTimerRef.current);
              countdownTimerRef.current = null;
          }
      };
  // Теперь снова зависим от calculatedExpectedCount, вычисленного снаружи
  }, [activeTouches.length, gameStatus, calculatedExpectedCount, onReadyToSelect]);
  // ----------------------------------------

  // --- Получаем статус игрока по fingerId ---
  const getPlayerStatus = (fingerId) => {
      if (!gamePlayers) return 'active'; // По умолчанию активен, если данных нет
      const player = gamePlayers.find(p => p.fingerId === fingerId);
      return player ? player.status : 'active'; // Если игрок еще не создан на бэке, считаем активным
  };

  return (
    <div
      ref={areaRef}
      className={`finger-area ${isSelecting ? 'selecting' : ''} status-${gameStatus} ${countdown !== null ? 'counting-down' : ''}`}
      // style={{ touchAction: 'none' }} // Предотвращаем стандартные действия браузера
    >
      {/* Отображаем активные касания */}
      {activeTouches.map(({ fingerId, x, y }) => {
        const playerStatus = getPlayerStatus(fingerId);
        const isHighlighted = highlightedFingerId === fingerId;
        // Не отображаем круги для игроков, которые уже выбыли до начала этой фазы
        // if (playerStatus === 'eliminated' || playerStatus === 'winner') return null;

        return (
          <div
            key={fingerId} // Используем fingerId как ключ
            className={`finger-circle ${isHighlighted ? 'highlighted' : ''} status-${playerStatus}`}
            style={{ left: `${x}px`, top: `${y}px` }}
          >
            #{fingerId}
          </div>
        );
      })}

      {/* Инструкции или кнопка */}
      {!isSelecting && gameStatus === 'waiting' && (
        <div className="instructions">
            {activeTouches.length < calculatedExpectedCount
                ? `Положите пальцы (${activeTouches.length}/${calculatedExpectedCount || '...'})`
                : 'Все пальцы на месте!'
            }
            {/* Показываем таймер, если он активен */}
            {countdown !== null && (
                <div className="countdown-timer-container">
                    <div className="countdown-timer-bar" style={{ width: `${(countdown / COUNTDOWN_DURATION) * 100}%` }}></div>
                    <span className="countdown-timer-text">Старт через {countdown}...</span>
                </div>
            )}
        </div>
      )}

      {/* Можно добавить сообщение во время выбора */}
      {isSelecting && (
          <div className="instructions selecting-text">Выбираем...</div>
      )}
      {/* --- Обновленное сообщение во время задания --- */}
       {gameStatus === 'task_assigned' && (
           <div className="instructions task-active-text">
               Задание для #{taskPlayerFingerIdRef.current ?? '?'}:
               <br/>
               Держите пальцы!
               <br/>
               <span className="swipe-hint">Свайп ВПРАВО = Да, ВЛЕВО = Нет</span>
           </div>
       )}


    </div>
  );
}

export default FingerPlacementArea; 