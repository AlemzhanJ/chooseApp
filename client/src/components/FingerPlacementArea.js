import React, { useState, useEffect, useRef, useCallback } from 'react';
import './FingerPlacementArea.css';
import Button from './Button'; // Импортируем Button

// Новый компонент FingerPlacementArea
function FingerPlacementArea({
  expectedPlayers,
  gameStatus,
  gamePlayers, // Массив игроков из gameData для определения статуса
  onFingerLift,
  onReadyToSelect,
  highlightedFingerId, // Теперь используем ID пальца, а не индекс
  isSelecting, // Для управления анимацией/состоянием
}) {
  const [activeTouches, setActiveTouches] = useState([]); // { touchId: number, fingerId: number, x: number, y: number }
  const areaRef = useRef(null);
  const nextFingerId = useRef(0); // Для присвоения ID новым пальцам
  const fingerIdMap = useRef(new Map()); // Для отслеживания соответствия touchId -> fingerId

  // --- Сброс состояния при смене статуса игры (например, при возврате в waiting) ---
  useEffect(() => {
    // Сбрасываем пальцы, если игра перешла в неактивное состояние или ждет начала
     if (gameStatus === 'waiting' || gameStatus === 'finished') {
       setActiveTouches([]);
       nextFingerId.current = 0;
       fingerIdMap.current.clear();
     }
  }, [gameStatus]);

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

    for (let i = 0; i < touches.length; i++) {
      const touch = touches[i];
      // Находим ID пальца по ID касания
      const fingerId = fingerIdMap.current.get(touch.identifier);

      if (fingerId !== undefined) {
         console.log(`Finger lifted: ID ${fingerId}, TouchID ${touch.identifier}`);
         fingerIdMap.current.delete(touch.identifier); // Удаляем связь
         // Вызываем колбэк для GameScreen, если игра уже началась (не waiting)
         // В режиме waiting поднятие пальца просто убирает его без последствий
         if (gameStatus !== 'waiting') {
             onFingerLift(fingerId);
         }
         // Удаляем касание из состояния
         setActiveTouches(prevTouches => prevTouches.filter(t => t.touchId !== touch.identifier));
      }
    }
  }, [onFingerLift, gameStatus]);

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

  // --- Определяем, готовы ли к выбору ---
  const canStartSelection = gameStatus === 'waiting' && activeTouches.length === expectedPlayers;

  // --- Получаем статус игрока по fingerId ---
  const getPlayerStatus = (fingerId) => {
      if (!gamePlayers) return 'active'; // По умолчанию активен, если данных нет
      const player = gamePlayers.find(p => p.fingerId === fingerId);
      return player ? player.status : 'active'; // Если игрок еще не создан на бэке, считаем активным
  };

  return (
    <div
      ref={areaRef}
      className={`finger-area ${isSelecting ? 'selecting' : ''} status-${gameStatus}`}
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
            {activeTouches.length < expectedPlayers
                ? `Положите пальцы (${activeTouches.length}/${expectedPlayers})`
                : 'Все пальцы на месте!'
            }
        </div>
      )}

      {/* Кнопка "Начать выбор" */}
      {canStartSelection && (
         <Button
             onClick={() => onReadyToSelect(activeTouches.map(t => ({ fingerId: t.fingerId, x: t.x, y: t.y })))}
             variant="primary"
             className="start-selection-button"
             disabled={isSelecting} // Блокируем во время выбора
         >
             Начать выбор!
         </Button>
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