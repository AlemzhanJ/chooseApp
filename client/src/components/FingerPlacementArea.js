import React, { useState, useEffect, useRef } from 'react';
// Убираем импорт Button, если он больше нигде не нужен в этом файле
// import Button from './Button'; 
import './FingerPlacementArea.css'; // Добавим стили

// Принимаем новые пропсы
function FingerPlacementArea({ 
    expectedPlayers, 
    onReadyToStart, 
    isSelecting = false, // Идет ли анимация выбора
    highlightedIndex = null, // Индекс подсвеченного кружка
    placedFingersData = [], // Данные о пальцах с координатами (из GameScreen)
    disabled = false // Блокировка обработчиков
}) {
  const [activeTouches, setActiveTouches] = useState(0);
  const [touchPoints, setTouchPoints] = useState([]); // Для визуализации касаний
  const areaRef = useRef(null);
  const [isReady, setIsReady] = useState(false); // Состояние готовности для стилей
  const readyTimeoutRef = useRef(null);

  useEffect(() => {
    const touchArea = areaRef.current;
    if (!touchArea || disabled) return; // Если отключено, не добавляем слушатели

    const checkReadyState = (currentTouches) => {
        if (disabled) return; // Не реагируем, если отключено
        const currentTouchesCount = currentTouches.length;

        if (currentTouchesCount === expectedPlayers) {
            if (!readyTimeoutRef.current) {
                setIsReady(true);
                touchArea.classList.add('ready');
                console.log(`Starting ready timer (${expectedPlayers} fingers detected)...`);
                // Сохраняем актуальные касания для использования в таймауте
                const touchesAtTimeoutStart = currentTouches;
                readyTimeoutRef.current = setTimeout(() => {
                    console.log('Ready timer finished! Calling onReadyToStart with touch points.');
                    
                    // Получаем координаты относительно touchArea
                    const touchAreaRect = areaRef.current?.getBoundingClientRect();
                    if (!touchAreaRect) {
                        console.error("Cannot get touch area rect in timeout");
                        return;
                    }

                    // Генерируем координаты на основе касаний, сохраненных при старте таймаута
                    const fingersWithCoords = [];
                    for (let i = 0; i < touchesAtTimeoutStart.length; i++) {
                         // Ограничиваем ожидаемым количеством игроков
                         if (i >= expectedPlayers) break; 
                         const touch = touchesAtTimeoutStart[i];
                         const relativeX = touch.clientX - touchAreaRect.left;
                         const relativeY = touch.clientY - touchAreaRect.top;
                         fingersWithCoords.push({
                            fingerId: i, 
                            x: relativeX, 
                            y: relativeY,
                            touchId: touch.identifier
                         });
                    }
                    console.log("Generated fingers with coords:", fingersWithCoords); // Лог для отладки
                    onReadyToStart(fingersWithCoords); 
                }, 1500); 
            }
        } else {
            if (readyTimeoutRef.current) {
                console.log('Clearing ready timer (finger removed).');
                clearTimeout(readyTimeoutRef.current);
                readyTimeoutRef.current = null;
            }
            setIsReady(false);
            touchArea.classList.remove('ready');
        }
    }

    const handleTouchStart = (event) => {
      if (disabled) return event.preventDefault(); // Предотвращаем действие по умолчанию, если отключено
      event.preventDefault();
      const currentTouches = event.touches;
      setActiveTouches(currentTouches.length);
      updateTouchPoints(currentTouches);
      checkReadyState(currentTouches); // Передаем объект touches
    };

    const handleTouchEnd = (event) => {
      if (disabled) return event.preventDefault();
      event.preventDefault();
      const currentTouches = event.touches;
      setActiveTouches(currentTouches.length);
      updateTouchPoints(currentTouches);
      checkReadyState(currentTouches); // Передаем объект touches
    };

    const handleTouchCancel = (event) => {
       if (disabled) return event.preventDefault();
       event.preventDefault();
       const currentTouches = event.touches;
       setActiveTouches(currentTouches.length);
       updateTouchPoints(currentTouches);
       checkReadyState(currentTouches); // Передаем объект touches
    };

    const updateTouchPoints = (touches) => {
        const touchAreaElement = areaRef.current; 
        if (!touchAreaElement) return; 
        
        const areaRect = touchAreaElement.getBoundingClientRect(); 
        const points = [];

        for (let i = 0; i < touches.length; i++) {
            const relativeX = touches[i].clientX - areaRect.left;
            const relativeY = touches[i].clientY - areaRect.top;
            
            points.push({
                id: touches[i].identifier,
                x: relativeX, 
                y: relativeY,
            });
        }
        // Ограничиваем количество точек ожидаемым количеством игроков
        setTouchPoints(points.slice(0, expectedPlayers)); 
    }

    touchArea.addEventListener('touchstart', handleTouchStart, { passive: false });
    touchArea.addEventListener('touchend', handleTouchEnd, { passive: false });
    touchArea.addEventListener('touchcancel', handleTouchCancel, { passive: false });

    return () => {
      touchArea.removeEventListener('touchstart', handleTouchStart);
      touchArea.removeEventListener('touchend', handleTouchEnd);
      touchArea.removeEventListener('touchcancel', handleTouchCancel);
      if (readyTimeoutRef.current) {
          clearTimeout(readyTimeoutRef.current);
      }
    };
  // Убираем touchPoints из зависимостей, т.к. его изменение не должно влиять на слушатели и таймер
  }, [expectedPlayers, onReadyToStart, disabled]); 

  return (
    // Добавляем класс `selecting` во время анимации
    <div ref={areaRef} className={`touch-area ${isReady ? 'ready' : ''} ${isSelecting ? 'selecting' : ''} ${disabled ? 'disabled' : ''}`}>
      
      {/* Показываем разный контент в зависимости от фазы */}
      {!isSelecting ? (
          <>
              <p className="touch-info">
                  Положите пальцы: {activeTouches} / {expectedPlayers}
              </p>
              <p className="touch-explanation">
                  Держите пальцы! Когда все будут готовы, начнется выбор.
              </p>
              {/* Визуализация точек касания в реальном времени */}
              {touchPoints.map(point => (
                  <div 
                      key={point.id}
                      className="touch-point live"
                      style={{ left: `${point.x}px`, top: `${point.y}px` }}
                  />
              ))}
          </>
      ) : (
          <> 
              {/* Во время выбора показываем зафиксированные кружки */}
              <p className="touch-info">Выбираем...</p>
              {placedFingersData.map((finger, index) => (
                  <div 
                      key={finger.fingerId ?? index} // Используем fingerId если есть, иначе index
                      // Добавляем класс highlighted, если индекс совпадает
                      className={`touch-point fixed ${highlightedIndex === index ? 'highlighted' : ''}`} 
                      style={{ left: `${finger.x}px`, top: `${finger.y}px` }}
                  > 
                      {/* Можно добавить номер игрока внутрь кружка */} 
                      <span className="finger-id-label">#{finger.fingerId}</span> 
                  </div>
              ))}
          </>
      )}

    </div>
  );
}

export default FingerPlacementArea; 