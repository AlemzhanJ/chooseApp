import React, { useState, useEffect, useRef, useCallback } from 'react';
import './FingerPlacementArea.css';

// --- Функция для форматирования времени ---
function formatTime(seconds) {
  if (seconds === null || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
}
// ------------------------------------------

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
  const zoneHoldRef = useRef({ zone: null, startTime: null, processing: false }); // Ref для таймера удержания в зоне + флаг обработки

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
  // Возвращает { isInYesZone: boolean, isInNoZone: boolean }
  const checkActionZones = useCallback((touchInfo, x, y) => {
    // Убираем onTaskAction из условия, т.к. действие вызывается в handleTouchEnd
    // Упрощаем: проверяем только для назначенного игрока
    if (!activeTaskInfo || touchInfo.fingerId !== activeTaskInfo.playerFingerId || !areaRef.current) {
        // Возвращаем false, если это не палец задания или нет данных
        return { isInYesZone: false, isInNoZone: false };
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

    // Возвращаем только флаги
    return { isInYesZone, isInNoZone };
  }, [activeTaskInfo]); // Зависит только от activeTaskInfo

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
                    const { isInYesZone, isInNoZone } = checkActionZones(updatedTouches[touchIndex], coords.x, coords.y);
                    if (isInYesZone !== updatedTouches[touchIndex].inYesZone || isInNoZone !== updatedTouches[touchIndex].inNoZone) {
                        updatedTouches[touchIndex] = { ...updatedTouches[touchIndex], inYesZone: isInYesZone, inNoZone: isInNoZone };
                        stateNeedsUpdate = true;
                        // Сбрасываем таймер удержания, если палец начал касание в новой зоне
                        zoneHoldRef.current = { zone: null, startTime: null, processing: false };
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
  }, [getRelativeCoords, calculatedExpectedCount, gameStatus, activeTaskInfo, checkActionZones]); // Убрали onTaskAction

  // --- Обработчик движения касания ---
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
                        const playerFingerId = activeTaskInfo.playerFingerId;
                        if (currentTouchInfo.fingerId === playerFingerId) {
                            const { isInYesZone: newInYesZone, isInNoZone: newInNoZone } = checkActionZones(currentTouchInfo, coords.x, coords.y);
                            const previousInYesZone = currentTouchInfo.inYesZone;
                            const previousInNoZone = currentTouchInfo.inNoZone;

                            // Обновляем флаги в состоянии, если они изменились
                            if (newInYesZone !== previousInYesZone || newInNoZone !== previousInNoZone) {
                                currentTouchInfo = { ...currentTouchInfo, inYesZone: newInYesZone, inNoZone: newInNoZone };
                                touchInfoUpdated = true;
                            }

                            // --- Логика удержания в зоне --- 
                            const now = Date.now();
                            const currentHold = zoneHoldRef.current;

                            if (newInYesZone) {
                                if (currentHold.zone !== 'yes') { // Только что вошли в YES
                                    console.log(`[TouchMove] Finger ${playerFingerId} entered YES zone. Starting timer.`);
                                    zoneHoldRef.current = { zone: 'yes', startTime: now, processing: false }; // Начинаем без обработки
                                } else if (currentHold.startTime && now - currentHold.startTime >= 2000 && !currentHold.processing) { // Удерживали 2с в YES и не обрабатываем
                                    console.log(`[TouchMove] Finger ${playerFingerId} held in YES zone for 2s. Calling onTaskAction('yes') and setting processing flag.`);
                                    zoneHoldRef.current = { ...currentHold, processing: true }; // Ставим флаг ПЕРЕД вызовом
                                    onTaskAction(playerFingerId, 'yes');
                                    // zoneHoldRef.current = { zone: null, startTime: null }; // НЕ сбрасываем таймер здесь
                                }
                                // Иначе: все еще удерживаем, но не достаточно долго или уже обрабатываем
                            } else if (newInNoZone) {
                                if (currentHold.zone !== 'no') { // Только что вошли в NO
                                    console.log(`[TouchMove] Finger ${playerFingerId} entered NO zone. Starting timer.`);
                                    zoneHoldRef.current = { zone: 'no', startTime: now, processing: false }; // Начинаем без обработки
                                } else if (currentHold.startTime && now - currentHold.startTime >= 2000 && !currentHold.processing) { // Удерживали 2с в NO и не обрабатываем
                                    console.log(`[TouchMove] Finger ${playerFingerId} held in NO zone for 2s. Calling onTaskAction('no') and setting processing flag.`);
                                    zoneHoldRef.current = { ...currentHold, processing: true }; // Ставим флаг ПЕРЕД вызовом
                                    onTaskAction(playerFingerId, 'no');
                                    // zoneHoldRef.current = { zone: null, startTime: null }; // НЕ сбрасываем таймер здесь
                                }
                                // Иначе: все еще удерживаем, но не достаточно долго или уже обрабатываем
                            } else { // Не в зоне YES и не в зоне NO
                                if (currentHold.zone !== null) { // Только что вышли из зоны
                                    console.log(`[TouchMove] Finger ${playerFingerId} exited zone ${currentHold.zone}. Resetting timer.`);
                                    zoneHoldRef.current = { zone: null, startTime: null, processing: false }; // Сбрасываем все при выходе
                                }
                            }
                            // --- Конец логики удержания --- 
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
  }, [getRelativeCoords, gameStatus, activeTaskInfo, checkActionZones, onTaskAction]); // onTaskAction ЗДЕСЬ НУЖНА, но линтер ругается

  // --- Обработчик окончания/отмены касания ---
  const handleTouchEnd = useCallback((e) => {
    if (gameStatus === 'finished') return;
    // Предотвращаем стандартное поведение, если игра не в ожидании
    // if (gameStatus !== 'waiting') {
    //     // e.preventDefault(); // Возможно, не нужно
    // }

    const touches = e.changedTouches;
    let touchRemoved = false; // Флаг, что был удален хотя бы один палец
    const removedFingerIds = new Set();
    let finalTouchStates = {}; // Сохраняем финальное состояние касаний перед удалением

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
         // --- Сохраняем последнее состояние касания перед удалением --- 
         const finalState = activeTouchesRef.current.find(t => t.touchId === touch.identifier);
         if (finalState) {
             finalTouchStates[fingerId] = { ...finalState };
             console.log(`[TouchEnd] Final state for finger ${fingerId}:`, finalState);
         }
         // --- Сброс таймера удержания, если палец поднят игроком задания --- 
         if (gameStatus === 'task_assigned' && activeTaskInfo && fingerId === activeTaskInfo.playerFingerId) {
           console.log(`[TouchEnd] Task player finger ${fingerId} lifted. Resetting hold timer.`);
           zoneHoldRef.current = { zone: null, startTime: null, processing: false }; // Сбрасываем все при поднятии
         }
         // ------------------------------------------------------------------
      }
    }
     // Обновляем состояние после обработки всех завершившихся касаний
     if (touchRemoved) {
        // Используем функциональное обновление для надежности
        setActiveTouches(prevTouches => prevTouches.filter(t => !removedFingerIds.has(t.fingerId)));
     }
  }, [onFingerLift, gameStatus, activeTaskInfo]); // Убрали onTaskAction из зависимостей

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

  // --- Эффект для сброса таймера удержания при завершении задания --- 
  useEffect(() => {
    if (!activeTaskInfo && zoneHoldRef.current.processing) {
        console.log("Task ended (activeTaskInfo is null), resetting zoneHoldRef processing flag.");
        zoneHoldRef.current = { zone: null, startTime: null, processing: false };
    }
    // Добавляем также сброс если зона есть, но флаг processing остался (на всякий случай)
    else if (activeTaskInfo && zoneHoldRef.current.zone && zoneHoldRef.current.processing) {
       // Если палец все еще в зоне, но activeTaskInfo обновился (маловероятно, но возможно)
       // Может произойти если GameScreen обновил activeTaskInfo, но палец не двигался
       // Оставляем startTime, но сбрасываем processing, чтобы таймер мог сработать снова, если нужно
       // console.log("Task info updated while processing flag was true. Resetting flag, keeping timer.");
       // zoneHoldRef.current = { ...zoneHoldRef.current, processing: false };
       // ------> Решил пока убрать эту ветку, чтобы не усложнять. Основной сброс при !activeTaskInfo.
    }
  }, [activeTaskInfo]);
  // -------------------------------------------------------------------

  // --- Рендеринг таймера задания ---
  const renderTaskTimer = () => {
    if (!activeTaskInfo || !activeTaskInfo.eliminationEnabled || activeTaskInfo.timeLeft === null || activeTaskInfo.taskTimeLimit === null || activeTaskInfo.taskTimeLimit <= 0) {
      return null; // Не показываем таймер, если не нужно
    }

    const { timeLeft, taskTimeLimit } = activeTaskInfo;
    const percentage = Math.max(0, (timeLeft / taskTimeLimit) * 100);

    return (
      <div className="task-timer-container">
        <div className="task-timer-bar" style={{ width: `${percentage}%` }}></div>
        <span className="task-timer-text">Осталось: {formatTime(timeLeft)}</span>
      </div>
    );
  };

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

        // --- Лог для проверки классов --- 
        const classes = `finger-circle ${isHighlighted ? 'highlighted' : ''} status-${playerStatus} ${isTaskPlayerFinger ? 'task-player-finger' : ''} ${inYesZone ? 'in-yes-zone' : ''} ${inNoZone ? 'in-no-zone' : ''}`;
        // Уменьшим частоту логов, например, только при изменении зон
        if (isTaskPlayerFinger && (inYesZone || inNoZone)) {
            // console.log(`[Render] Finger ${fingerId} Classes: ${classes}`);
        }
        // ----------------------------- 

        return (
          <div
            key={touchId} // Используем touchId как более стабильный ключ во время касания
            className={classes} // Применяем сформированные классы
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
           <>
             {/* Отображаем текст задания */}
             {activeTaskInfo?.taskText && (
               <div className="instructions task-text-display">
                 {`Задание для #${activeTaskInfo.playerFingerId}: ${activeTaskInfo.taskText}`}
               </div>
             )}
             {/* Отображаем таймер задания */}
             {renderTaskTimer()}
             {/* Общее сообщение */}
             <div className="instructions task-active-text">
               Удерживайте палец в зоне ДА или НЕТ 2 секунды.
             </div>
           </>
       )}

      {/* === Debug Info === */}
      <div style={{
          position: 'absolute',
          bottom: '5px',
          left: '5px',
          background: 'rgba(0, 0, 0, 0.6)',
          color: 'white',
          padding: '8px',
          borderRadius: '4px',
          fontSize: '10px',
          zIndex: 100, // Поверх всего
          maxWidth: 'calc(100% - 10px)',
          opacity: 0.8
      }}>
          <pre style={{margin: 0, whiteSpace: 'pre-wrap'}}>
              {`Status: ${gameStatus}`}<br />
              {`Task Player: ${activeTaskInfo?.playerFingerId ?? 'N/A'}`}<br />
              {(() => {
                  const taskPlayerTouch = activeTouches.find(t => activeTaskInfo && t.fingerId === activeTaskInfo.playerFingerId);
                  if (!taskPlayerTouch) return 'Task Touch: N/A';
                  return `Touch Zones: YES=${taskPlayerTouch.inYesZone}, NO=${taskPlayerTouch.inNoZone}`;
              })()}<br />
              {`Hold Zone: ${zoneHoldRef.current.zone ?? '-'}`}<br />
              {`Hold Start: ${zoneHoldRef.current.startTime ? new Date(zoneHoldRef.current.startTime).toLocaleTimeString() : '-'}`}<br />
              {`Time Held: ${zoneHoldRef.current.startTime ? ((Date.now() - zoneHoldRef.current.startTime) / 1000).toFixed(1) + 's' : '-'}`}
          </pre>
      </div>
      {/* === End Debug Info === */}

    </div>
  );
}

export default FingerPlacementArea; 