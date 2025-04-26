import React, { useState, useEffect, useRef } from 'react';
// Убираем импорт Button, если он больше нигде не нужен в этом файле
// import Button from './Button'; 
import './FingerPlacementArea.css'; // Добавим стили

function FingerPlacementArea({ 
  expectedPlayers, 
  onReadyToStart,
  // Новые пропсы
  isAnimating = false, 
  highlightedFingerId = null,
  onFingerRemoved = () => {},
  placedFingers = [] // Массив с данными пальцев из GameScreen { fingerId, x, y ...?}
}) {
  // activeTouches и isReady, возможно, больше не нужны в том же виде
  // const [activeTouches, setActiveTouches] = useState(0);
  const [touchPoints, setTouchPoints] = useState([]); // Оставляем для координат
  const areaRef = useRef(null);
  // const [isReady, setIsReady] = useState(false);

  // Присваиваем fingerId точкам при первом рендере или изменении placedFingers
  useEffect(() => {
    // Если анимация не идет, используем данные из placedFingers, если они есть
    if (!isAnimating && placedFingers.length > 0) {
        setTouchPoints(placedFingers.map((finger, index) => ({
            id: finger.fingerId, // Используем fingerId как ID
            fingerId: finger.fingerId, // Добавляем fingerId
            x: finger.x, // Нужны координаты из GameScreen
            y: finger.y
        })));
    } else if (!isAnimating && placedFingers.length === 0) {
        // Если нет placedFingers, очищаем точки
        setTouchPoints([]);
    }
    // Если isAnimating, touchPoints не должны меняться здесь, они управляются touchend
  }, [placedFingers, isAnimating]);

  useEffect(() => {
    const touchArea = areaRef.current;
    if (!touchArea) return;

    // Убираем старую логику checkReadyState и readyTimeoutRef

    const handleTouchStart = (event) => {
      event.preventDefault();
      // Игнорируем новые касания во время анимации
      if (isAnimating) return;
      
      updateTouchPoints(event.touches);
      // Сразу вызываем onReadyToStart, если количество пальцев достигнуто
      if (event.touches.length === expectedPlayers) {
          const fingers = touchPoints.map(tp => ({ fingerId: tp.fingerId, x: tp.x, y: tp.y }));
          onReadyToStart(fingers); // Передаем пальцы с координатами
      }
    };

    const handleTouchEnd = (event) => {
      event.preventDefault();
      const remainingTouches = event.touches;

      if (isAnimating) {
        // Определяем, какой палец был убран
        const currentTouchIds = new Set(Array.from(remainingTouches).map(t => t.identifier));
        const removedPoint = touchPoints.find(p => !currentTouchIds.has(p.id));
        
        if (removedPoint && removedPoint.fingerId !== undefined) {
            console.log(`FingerPlacementArea: Finger ${removedPoint.fingerId} removed during animation.`);
            onFingerRemoved(removedPoint.fingerId);
            // Обновляем touchPoints, чтобы убранный палец исчез visually
            setTouchPoints(prevPoints => prevPoints.filter(p => p.id !== removedPoint.id));
        } else {
             console.warn('Could not determine which finger was removed during animation.');
        }
        // Не обновляем activeTouches и не вызываем checkReadyState
      } else {
        // Обычный режим (не анимация)
        updateTouchPoints(remainingTouches);
        // Если количество пальцев стало меньше нужного, можно сбросить готовность
        // (хотя GameScreen теперь управляет этим)
      }
    };

    // handleTouchCancel аналогичен handleTouchEnd в контексте анимации
    const handleTouchCancel = (event) => {
        handleTouchEnd(event); // Используем ту же логику
    };

    // Обновленная функция updateTouchPoints 
    const updateTouchPoints = (touches) => {
        const touchAreaElement = areaRef.current;
        if (!touchAreaElement) return;
        const areaRect = touchAreaElement.getBoundingClientRect();
        const points = [];
        
        // Используем стабильные fingerId, если они уже есть
        const existingPoints = touchPoints.reduce((acc, p) => {
            acc[p.id] = p;
            return acc;
        }, {});

        for (let i = 0; i < touches.length; i++) {
            const touch = touches[i];
            const relativeX = touch.clientX - areaRect.left;
            const relativeY = touch.clientY - areaRect.top;
            
            // Пытаемся сохранить fingerId, если точка уже была
            const existingPoint = existingPoints[touch.identifier];
            const fingerId = existingPoint?.fingerId ?? i; // Присваиваем новый ID (0, 1, ...) если точки не было

            points.push({
                id: touch.identifier,
                fingerId: fingerId, 
                x: relativeX, 
                y: relativeY,
            });
        }
        setTouchPoints(points);
    }

    // Добавляем слушатели событий
    touchArea.addEventListener('touchstart', handleTouchStart, { passive: false });
    touchArea.addEventListener('touchend', handleTouchEnd, { passive: false });
    touchArea.addEventListener('touchcancel', handleTouchCancel, { passive: false });

    // Очистка 
    return () => {
      touchArea.removeEventListener('touchstart', handleTouchStart);
      touchArea.removeEventListener('touchend', handleTouchEnd);
      touchArea.removeEventListener('touchcancel', handleTouchCancel);
    };
  // Зависимости обновлены
  }, [expectedPlayers, onReadyToStart, isAnimating, onFingerRemoved, touchPoints]); 

  return (
    // Убираем класс ready, он больше не управляется здесь
    <div ref={areaRef} className={`touch-area ${isAnimating ? 'animating' : ''}`}>
      <p className="touch-info">
        {/* Обновляем текст в зависимости от состояния */} 
        {isAnimating 
          ? `Выбираем... (${touchPoints.length})` 
          : `Положите пальцы: ${touchPoints.length} / ${expectedPlayers}`}
      </p>
      {/* Убираем пояснение про колесо */}
      <p className="touch-explanation">
        {isAnimating ? 'Не убирайте пальцы!' : 'Держите пальцы до начала выбора.'}
      </p>
      
      {/* Визуализация точек касания (теперь с fingerId и подсветкой) */} 
      {touchPoints.map(point => (
          <div 
            key={point.id} // Используем touch identifier как key
            className={`touch-point ${point.fingerId === highlightedFingerId ? 'highlighted' : ''}`}
            style={{ left: `${point.x}px`, top: `${point.y}px` }}
          >
            {/* Отображаем fingerId внутри круга */} 
            <span className="touch-point-id">#{point.fingerId}</span> 
          </div>
      ))}
    </div>
  );
}

export default FingerPlacementArea; 