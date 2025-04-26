import React, { useState, useEffect, useRef } from 'react';
// Убираем импорт Button, если он больше нигде не нужен в этом файле
// import Button from './Button'; 
import './FingerPlacementArea.css'; // Добавим стили

function FingerPlacementArea({ expectedPlayers, onReadyToStart }) {
  const [activeTouches, setActiveTouches] = useState(0);
  const [touchPoints, setTouchPoints] = useState([]); // Для визуализации касаний
  const areaRef = useRef(null);
  const [isReady, setIsReady] = useState(false); // Состояние готовности для стилей
  const readyTimeoutRef = useRef(null);

  useEffect(() => {
    const touchArea = areaRef.current;
    if (!touchArea) return;

    const checkReadyState = (currentTouchesCount) => {
        if (currentTouchesCount === expectedPlayers) {
            // Если нужное количество пальцев есть, запускаем таймер
            if (!readyTimeoutRef.current) {
                setIsReady(true); // Меняем стиль
                touchArea.classList.add('ready');
                console.log(`Starting ready timer (${expectedPlayers} fingers detected)...`);
                readyTimeoutRef.current = setTimeout(() => {
                    console.log('Ready timer finished! Calling onReadyToStart.');
                    const fingers = Array.from({ length: expectedPlayers }, (_, i) => ({ fingerId: i }));
                    onReadyToStart(fingers); 
                    // Можно добавить вибрацию
                    // if (navigator.vibrate) { navigator.vibrate(200); }
                }, 1500); // Задержка в 1.5 секунды
            }
        } else {
            // Если количество пальцев изменилось, сбрасываем таймер и стиль
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
      event.preventDefault();
      const currentTouches = event.touches.length;
      setActiveTouches(currentTouches);
      updateTouchPoints(event.touches);
      checkReadyState(currentTouches);
    };

    const handleTouchEnd = (event) => {
      event.preventDefault();
      const currentTouches = event.touches.length;
      setActiveTouches(currentTouches);
      updateTouchPoints(event.touches);
      checkReadyState(currentTouches);
    };

    const handleTouchCancel = (event) => {
      event.preventDefault();
      const currentTouches = event.touches.length;
      setActiveTouches(currentTouches);
      updateTouchPoints(event.touches);
      checkReadyState(currentTouches);
    };

    // Функция для обновления координат точек касания для визуализации
    const updateTouchPoints = (touches) => {
        const touchAreaElement = areaRef.current; // Получаем элемент
        if (!touchAreaElement) return; // Проверка, если элемента еще нет
        
        const areaRect = touchAreaElement.getBoundingClientRect(); // Получаем геометрию области
        const points = [];

        for (let i = 0; i < touches.length; i++) {
            // Вычисляем координаты относительно touch-area
            const relativeX = touches[i].clientX - areaRect.left;
            const relativeY = touches[i].clientY - areaRect.top;
            
            points.push({
                id: touches[i].identifier,
                // Используем относительные координаты
                x: relativeX, 
                y: relativeY,
            });
        }
        setTouchPoints(points);
    }

    // Добавляем слушатели событий
    // passive: false нужно, чтобы preventDefault работал
    touchArea.addEventListener('touchstart', handleTouchStart, { passive: false });
    touchArea.addEventListener('touchend', handleTouchEnd, { passive: false });
    touchArea.addEventListener('touchcancel', handleTouchCancel, { passive: false });

    // Очистка слушателей при размонтировании компонента
    return () => {
      touchArea.removeEventListener('touchstart', handleTouchStart);
      touchArea.removeEventListener('touchend', handleTouchEnd);
      touchArea.removeEventListener('touchcancel', handleTouchCancel);
      // Очищаем таймер при размонтировании
      if (readyTimeoutRef.current) {
          clearTimeout(readyTimeoutRef.current);
      }
    };
  }, [expectedPlayers, onReadyToStart]); // Добавляем зависимости

  return (
    <div ref={areaRef} className={`touch-area ${isReady ? 'ready' : ''}`}>
      <p className="touch-info">
        Положите пальцы: {activeTouches} / {expectedPlayers}
      </p>
      {/* Добавляем пояснение */} 
      <p className="touch-explanation">
        Держите пальцы! Номера игроков (#0, #1...) будут показаны на колесе выбора.
      </p>
      
      {/* Визуализация точек касания */} 
      {touchPoints.map(point => (
          <div 
            key={point.id}
            className="touch-point"
            style={{ left: `${point.x}px`, top: `${point.y}px` }}
          />
      ))}
      
      {/* --- КНОПКА УДАЛЕНА --- */}
      {/* 
      <Button onClick={simulateReady} variant="warning" className="simulate-button">
          Имитировать {expectedPlayers} пальца
      </Button>
      */}
    </div>
  );
}

export default FingerPlacementArea; 