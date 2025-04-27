import React, { useState, useEffect, useRef, useCallback } from 'react';
import './FingerPlacementArea.css';

// Новый компонент FingerPlacementArea
function FingerPlacementArea({
  expectedPlayers,
  gameStatus,
  gamePlayers, // Массив игроков из gameData для определения статуса
  onFingerLift,
  onReadyToSelect,
  highlightedFingerId, // Теперь используем ID пальца, а не индекс
  isSelecting, // Для управления анимацией/состоянием
  activeTaskInfo, // { playerFingerId, eliminationEnabled, taskText, isAiGenerated, timeLeft, taskTimeLimit } | null
  onTaskAction,   // (fingerId: number, action: 'yes' | 'no') => void
}) {
  const [activeTouches, setActiveTouches] = useState([]); // { touchId: number, fingerId: number, x: number, y: number, inYesZone?: boolean, inNoZone?: boolean }
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

  // --- Ref для отслеживания зон действия ---
  const actionZonesRef = useRef({ yes: null, no: null });
  // ----------------------------------------

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
     }
  }, [gameStatus]);

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

  // --- Функция проверки попадания в зоны действий --- 
  // Возвращает { needsUpdate: boolean, updatedTouchInfo: object | null }
  const checkActionZones = useCallback((touchInfo, x, y, isStart = false) => {
    if (!activeTaskInfo || touchInfo.fingerId !== activeTaskInfo.playerFingerId || !onTaskAction || !areaRef.current) {
         return { needsUpdate: false, updatedTouchInfo: null };
    }

    const yesZoneRect = actionZonesRef.current.yes;
    const noZoneRect = actionZonesRef.current.no;

    // Получаем размеры самой области для корректного расчета координат зон
    const areaRect = areaRef.current.getBoundingClientRect();
    // const areaWidth = areaRect.width;
    // const areaHeight = areaRect.height; // Если нужно для расчета зон

    // Определяем координаты зон относительно areaRef.current
    // Пример: Зона занимает 20% ширины/высоты в углу
    // const zoneSize = Math.min(areaRect.width * 0.25, areaRect.height * 0.25, 120); // УДАЛЕНО - НЕ ИСПОЛЬЗУЕТСЯ
    // const margin = areaRect.width * 0.05; // УДАЛЕНО - НЕ ИСПОЛЬЗУЕТСЯ

    const yesZone = yesZoneRect ? { // Координаты относительно viewport
        left: yesZoneRect.left - areaRect.left, // -> Координаты относительно finger-area
        top: yesZoneRect.top - areaRect.top,
        right: yesZoneRect.right - areaRect.left,
        bottom: yesZoneRect.bottom - areaRect.top,
    } : null; // Координаты зон относительно finger-area div

    const noZone = noZoneRect ? {
        left: noZoneRect.left - areaRect.left,
        top: noZoneRect.top - areaRect.top,
        right: noZoneRect.right - areaRect.left,
        bottom: noZoneRect.bottom - areaRect.top,
     } : null;

    const isInYesZone = yesZone && x >= yesZone.left && x <= yesZone.right && y >= yesZone.top && y <= yesZone.bottom;
    const isInNoZone = noZone && x >= noZone.left && x <= noZone.right && y >= noZone.top && y <= noZone.bottom;

    let needsUpdate = false;
    let updatedTouchInfo = { ...touchInfo }; // Копируем для изменений

    if (isInYesZone && !touchInfo.inYesZone) {
        console.log(`Finger ${touchInfo.fingerId} entered YES zone.`);
        updatedTouchInfo.inYesZone = true;
        updatedTouchInfo.inNoZone = false; // Не может быть в обеих зонах
        needsUpdate = true;
        onTaskAction(touchInfo.fingerId, 'yes'); // Вызываем действие при входе
    } else if (!isInYesZone && touchInfo.inYesZone) {
        console.log(`Finger ${touchInfo.fingerId} exited YES zone.`);
        updatedTouchInfo.inYesZone = false;
        needsUpdate = true;
    }

    if (isInNoZone && !touchInfo.inNoZone) {
        console.log(`Finger ${touchInfo.fingerId} entered NO zone.`);
        updatedTouchInfo.inNoZone = true;
        updatedTouchInfo.inYesZone = false; // Не может быть в обеих зонах
        needsUpdate = true;
        onTaskAction(touchInfo.fingerId, 'no'); // Вызываем действие при входе
    } else if (!isInNoZone && touchInfo.inNoZone) {
        console.log(`Finger ${touchInfo.fingerId} exited NO zone.`);
         updatedTouchInfo.inNoZone = false;
        needsUpdate = true;
    }

     // Эта логика теперь не нужна, так как touchstart вызывает checkActionZones с isStart=true,
     // и мы уже проверили зоны выше.
     /* if (isStart && (isInYesZone || isInNoZone) && !needsUpdate) {
          // ... (логика для isStart)
      } */


    return { needsUpdate, updatedTouchInfo: needsUpdate ? updatedTouchInfo : null };

}, [activeTaskInfo, onTaskAction]); // Зависимости checkActionZones

  // --- Обработчик начала касания ---
  const handleTouchStart = useCallback((e) => {
    // Работаем только если игра активна и не в фазе выбора (пальцы уже должны быть)
    // или если мы в waiting и добавляем пальцы
    // ИЛИ если идет задание (для проверки зон)
    if (gameStatus === 'finished' || (gameStatus !== 'waiting' && gameStatus !== 'task_assigned' && activeTouchesRef.current.length >= calculatedExpectedCount)) {
        console.log('[TouchStart] Blocked:', { gameStatus, touches: activeTouchesRef.current.length, expected: calculatedExpectedCount });
        return;
    }
    // Предотвращаем стандартное поведение (скролл, зум)
    // e.preventDefault(); // Вызываем ниже только при необходимости

    const touches = e.changedTouches;
    let updatedTouches = [...activeTouchesRef.current]; // Используем Ref для актуальности
    const currentFingerIds = new Set(updatedTouches.map(t => t.fingerId));
    let stateNeedsUpdate = false;

    for (let i = 0; i < touches.length; i++) {
      const touch = touches[i];
      const coords = getRelativeCoords(touch);
      if (!coords) continue;

      // Предотвращаем действия по умолчанию только если касание внутри области
      // и это не waiting (чтобы не мешать возможному скроллу страницы до начала игры)
       if (gameStatus !== 'waiting') {
           // e.preventDefault();
       }

      // Если статус 'waiting' и еще не все пальцы на месте
      if (gameStatus === 'waiting' && updatedTouches.length < calculatedExpectedCount) {
          // Находим следующий свободный ID пальца
          let assignedFingerId = -1;
          for (let fid = 0; fid < calculatedExpectedCount; fid++) { // Используем calculatedExpectedCount как лимит
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
              inYesZone: false, // Флаги для отслеживания входа в зоны
              inNoZone: false,
            };
            updatedTouches.push(newTouch);
            fingerIdMap.current.set(touch.identifier, assignedFingerId); // Сохраняем связь
            currentFingerIds.add(assignedFingerId); // Добавляем в занятые
            console.log(`Finger added: ID ${assignedFingerId}, TouchID ${touch.identifier}`);
             stateNeedsUpdate = true;
          }
      }
       // --- Логика для task_assigned (проверка зон при первом касании) ---
       // Важно: Используем fingerIdMap для поиска ID, так как палец мог уже быть на экране
       else if (gameStatus === 'task_assigned' && activeTaskInfo && onTaskAction) {
           const fingerId = fingerIdMap.current.get(touch.identifier);
           // Реагируем только на палец назначенного игрока
            // Палец мог быть уже на экране, его ID уже есть в fingerIdMap
            if (fingerId !== undefined && fingerId === activeTaskInfo.playerFingerId) {
               console.log(`[TouchStart] Checking zones for task player ${fingerId}`);
                // Используем updatedTouches, т.к. setActiveTouches еще не был вызван
                const touchIndex = updatedTouches.findIndex(t => t.touchId === touch.identifier);
                if (touchIndex !== -1) {
                    const result = checkActionZones(updatedTouches[touchIndex], coords.x, coords.y, true);
                    if (result.needsUpdate) {
                        updatedTouches[touchIndex] = result.updatedTouchInfo;
                        stateNeedsUpdate = true;
                    }
                }
            } else if (fingerId === undefined) {
                 // Это новое касание во время task_assigned - игнорируем,
                 // если это не палец назначенного игрока, который могли случайно убрать и вернуть
                 // (но handleTouchEnd уже должен был сработать)
                 console.log(`[TouchStart] Ignored new touch during task: TouchID ${touch.identifier}`);
            }
       }
    }
     if (stateNeedsUpdate) {
         setActiveTouches(updatedTouches);
     }
  }, [getRelativeCoords, calculatedExpectedCount, gameStatus, activeTaskInfo, onTaskAction, checkActionZones]); // Добавили checkActionZones в зависимости

  // --- Обработчик движения касания ---
  const handleTouchMove = useCallback((e) => {
    if (gameStatus === 'finished') return;
    // Предотвращаем стандартное поведение, если игра не в ожидании
     if (gameStatus !== 'waiting') {
        // e.preventDefault();
     }

    const touches = e.changedTouches;
    let needsStateUpdate = false;
    // Используем функциональное обновление, чтобы получить пред. состояние
    setActiveTouches(prevTouches => {
        // Создаем новый массив для обновления состояния, копируя предыдущий
        let updatedTouches = [...prevTouches];

        // Ищем соответствующие изменившиеся касания
        for (let i = 0; i < touches.length; i++) {
            const movedTouch = touches[i];
            const touchIndex = updatedTouches.findIndex(t => t.touchId === movedTouch.identifier);

            if (touchIndex !== -1) {
                const coords = getRelativeCoords(movedTouch);
                if (coords) {
                    let currentTouchInfo = updatedTouches[touchIndex];
                    let touchInfoUpdated = false;

                    // Обновляем координаты
                    if (currentTouchInfo.x !== coords.x || currentTouchInfo.y !== coords.y) {
                        currentTouchInfo = { ...currentTouchInfo, x: coords.x, y: coords.y };
                        touchInfoUpdated = true;
                    }

                    // --- Проверка зон при движении ---
                    if (gameStatus === 'task_assigned' && activeTaskInfo && onTaskAction) {
                        // Вызываем проверку зон ТОЛЬКО для пальца назначенного игрока
                        if (currentTouchInfo.fingerId === activeTaskInfo.playerFingerId) {
                            const zoneCheckResult = checkActionZones(currentTouchInfo, coords.x, coords.y);
                            if (zoneCheckResult.needsUpdate) {
                                currentTouchInfo = zoneCheckResult.updatedTouchInfo; // Обновляем инфо, если зона изменилась
                                touchInfoUpdated = true;
                            }
                        }
                    }
                    // -------------------------------

                    // Если были изменения в координатах или зонах, обновляем в массиве
                    if (touchInfoUpdated) {
                        updatedTouches[touchIndex] = currentTouchInfo;
                        needsStateUpdate = true; // Отмечаем, что нужно обновить состояние React
                    }
                }
            }
        }
        // Возвращаем обновленный массив (или старый, если изменений не было)
        return needsStateUpdate ? updatedTouches : prevTouches;
    });
  }, [getRelativeCoords, gameStatus, activeTaskInfo, onTaskAction, checkActionZones]); // Добавили checkActionZones в зависимости

  // --- Обработчик окончания/отмены касания ---
  const handleTouchEnd = useCallback((e) => {
    if (gameStatus === 'finished') return;
    // Предотвращаем стандартное поведение, если игра не в ожидании
    if (gameStatus !== 'waiting') {
        // e.preventDefault();
    }

    const touches = e.changedTouches;
    let touchRemoved = false; // Флаг, что был удален хотя бы один палец
    const removedFingerIds = new Set();

    for (let i = 0; i < touches.length; i++) {
      const touch = touches[i];
      // Находим ID пальца по ID касания
      const fingerId = fingerIdMap.current.get(touch.identifier);

      if (fingerId !== undefined) {
         console.log(`Finger lifted: ID ${fingerId}, TouchID ${touch.identifier}`);
         fingerIdMap.current.delete(touch.identifier); // Удаляем связь
         touchRemoved = true;
          removedFingerIds.add(fingerId);

         // Если палец поднят во время активной игры (не waiting), вызываем onFingerLift
         // Включаем сюда и task_assigned, И если это палец не назначенного игрока,
         // ИЛИ если это палец назначенного, но режим БЕЗ немедленного вылета (eliminationEnabled=false)
         if (gameStatus !== 'waiting' && gameStatus !== 'finished') {
              // Вызываем onFingerLift, если это НЕ палец активного задания ИЛИ если вылет не включен
              if (!activeTaskInfo || fingerId !== activeTaskInfo.playerFingerId || !activeTaskInfo.eliminationEnabled) {
                  console.log(`Calling onFingerLift for finger ${fingerId}`);
                  onFingerLift(fingerId);
              } else {
                   // Если это палец задания и включен вылет, GameScreen сам обработает это через feedbackMessage/статус
                  console.log(`Finger ${fingerId} (task player) lifted, eliminationEnabled=${activeTaskInfo.eliminationEnabled}. onFingerLift NOT called from here.`);
              }
         }
         // Если палец убран во время отсчета (в статусе waiting), останавливаем таймер
         if (gameStatus === 'waiting' && countdownTimerRef.current) {
             console.log('Finger lifted during countdown, stopping timer.');
             clearInterval(countdownTimerRef.current);
             countdownTimerRef.current = null;
             setCountdown(null);
         }
         // Удаляем касание из состояния
         setActiveTouches(prevTouches => prevTouches.filter(t => t.touchId !== touch.identifier));
      }
    }
     // Обновляем состояние после обработки всех завершившихся касаний
     if (touchRemoved) {
        // Используем функциональное обновление для надежности
        setActiveTouches(prevTouches => prevTouches.filter(t => !removedFingerIds.has(t.fingerId)));
     }
  }, [onFingerLift, gameStatus, activeTaskInfo]); // Добавили activeTaskInfo

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

  // --- Эффект для обновления координат зон при изменении размера ---
   useEffect(() => {
     const updateZoneRects = () => {
       if (areaRef.current) { // Обновляем всегда, если есть areaRef
          const yesElement = areaRef.current.querySelector('.action-zone.yes');
          const noElement = areaRef.current.querySelector('.action-zone.no');
          // Сохраняем BoundingClientRect напрямую
          actionZonesRef.current.yes = yesElement ? yesElement.getBoundingClientRect() : null;
          actionZonesRef.current.no = noElement ? noElement.getBoundingClientRect() : null;
          // console.log('Updated Zone Rects:', actionZonesRef.current);
       } else {
         actionZonesRef.current.yes = null;
         actionZonesRef.current.no = null;
       }
     };

     // Запускаем с небольшой задержкой после рендера, чтобы зоны точно были в DOM
     const timeoutId = setTimeout(updateZoneRects, 50);

     // Добавляем слушатель изменения размера окна
     window.addEventListener('resize', updateZoneRects);
     // Используем MutationObserver для отслеживания изменений в DOM, если зоны появляются/исчезают
     const observer = new MutationObserver(updateZoneRects);
        if (areaRef.current) {
            // Наблюдаем за изменениями атрибутов (например, class для task-active) и дочерних элементов
            observer.observe(areaRef.current, { childList: true, subtree: false, attributes: true, attributeFilter: ['class'] });
        }

     return () => {
       clearTimeout(timeoutId);
       window.removeEventListener('resize', updateZoneRects);
       observer.disconnect();
     };
   }, [activeTaskInfo]); // Пересчитываем при изменении activeTaskInfo (появлении/исчезновении зон)

  // --- Получаем статус игрока по fingerId ---
  const getPlayerStatus = (fingerId) => {
      if (!gamePlayers) return 'active'; // По умолчанию активен, если данных нет
      const player = gamePlayers.find(p => p.fingerId === fingerId);
      return player ? player.status : 'active'; // Если игрок еще не создан на бэке, считаем активным
  };

  return (
    <div
      ref={areaRef}
      className={`finger-area ${isSelecting ? 'selecting' : ''} status-${gameStatus} ${countdown !== null ? 'counting-down' : ''} ${activeTaskInfo ? 'task-active' : ''}`}
      // style={{ touchAction: 'none' }} // Предотвращаем стандартные действия браузера
    >
      {/* Отображаем активные касания */}
      {activeTouches.map(({ touchId, fingerId, x, y, inYesZone, inNoZone }) => { // Достаем флаги зон
        const playerStatus = getPlayerStatus(fingerId);
        const isHighlighted = highlightedFingerId === fingerId;
        // Не отображаем круги для игроков, которые уже выбыли до начала этой фазы
        // if (playerStatus === 'eliminated' || playerStatus === 'winner') return null;

        // Добавляем класс, если это палец игрока, выполняющего задание
        const isTaskPlayerFinger = activeTaskInfo && fingerId === activeTaskInfo.playerFingerId;
        // Флаги зон теперь берем из состояния
        // const isInYesZone = activeTaskInfo && fingerId === activeTaskInfo.playerFingerId && activeTouchesRef.current.find(t => t.fingerId === fingerId)?.inYesZone;
        // const isInNoZone = activeTaskInfo && fingerId === activeTaskInfo.playerFingerId && activeTouchesRef.current.find(t => t.fingerId === fingerId)?.inNoZone;


        return (
          <div
            key={touchId} // Используем touchId как более стабильный ключ во время касания
            className={`finger-circle ${isHighlighted ? 'highlighted' : ''} status-${playerStatus} ${isTaskPlayerFinger ? 'task-player-finger' : ''} ${inYesZone ? 'in-yes-zone' : ''} ${inNoZone ? 'in-no-zone' : ''}`}
            style={{ left: `${x}px`, top: `${y}px` }}
          >
            #{fingerId}
          </div>
        );
      })}

      {/* === Отображение зон для ответа на задание === */}
      {activeTaskInfo && (
          <>
              <div className="action-zone yes">
                  <span>ДА</span>
                  {/* Дополнительно можно отображать иконку или текст */}
              </div>
              <div className="action-zone no">
                  <span>НЕТ</span>
                  {/* Дополнительно можно отображать иконку или текст */}
              </div>
              {/* Пальцы рендерятся в основном цикле выше, теперь с нужными классами */}
              {/* Убираем дублирование рендера пальца здесь */}
              {/* {activeTouches.filter(t => t.fingerId === activeTaskInfo.playerFingerId).map(({ fingerId, x, y }) => { ... }) } */}
          </>
      )}

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
      {/* Сообщение, если игрок поднял палец во время выбора/задания */}
       {gameStatus === 'task_assigned' && (
           <div className="instructions task-active-text">Идет выполнение задания... Держите пальцы!</div>
       )}


    </div>
  );
}

export default FingerPlacementArea; 