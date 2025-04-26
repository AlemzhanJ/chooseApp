import React, { useState, useEffect, useRef } from 'react';
// Убираем импорт Button, если он больше нигде не нужен в этом файле
// import Button from './Button'; 
import './FingerPlacementArea.css'; // Добавим стили

function FingerPlacementArea({ expectedPlayers, onReadyToStart, players = [], highlightedPlayerIndex = null, selectedPlayerIndex = null, isSelecting = false }) {
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

    // Добавляем новые пропсы: players, highlightedPlayerIndex, selectedPlayerIndex, isSelecting
    // Отключаем обработчики касаний, если идет выбор или игрок выбран (статус не 'waiting')
    const isDisabled = isSelecting || selectedPlayerIndex !== null;

    if (!isDisabled) {
        touchArea.addEventListener('touchstart', handleTouchStart, { passive: false });
        touchArea.addEventListener('touchend', handleTouchEnd, { passive: false });
        touchArea.addEventListener('touchcancel', handleTouchCancel, { passive: false });
    } else {
        // Если отключено, убедимся, что слушатели удалены, если они были добавлены ранее
        touchArea.removeEventListener('touchstart', handleTouchStart);
        touchArea.removeEventListener('touchend', handleTouchEnd);
        touchArea.removeEventListener('touchcancel', handleTouchCancel);
    }

    // Очистка слушателей при размонтировании компонента ИЛИ при изменении isDisabled
    return () => {
      if (readyTimeoutRef.current) {
          clearTimeout(readyTimeoutRef.current);
      }
    };
  }, [expectedPlayers, onReadyToStart, isSelecting, selectedPlayerIndex]); // Добавляем зависимости

  // Определяем текст подсказки в зависимости от стадии
  let explanationText = "Положите пальцы, чтобы начать!";
  if (isReady) {
      explanationText = "Держите! Старт через секунду...";
  } else if (isSelecting) {
      explanationText = "Выбираем...";
  } else if (selectedPlayerIndex !== null) {
      explanationText = `Выбран игрок #${players[selectedPlayerIndex]?.fingerId}! Ожидание задания...`;
  }

  return (
    <div ref={areaRef} className={`touch-area ${isReady ? 'ready' : ''} ${isSelecting ? 'selecting' : ''} ${selectedPlayerIndex !== null ? 'selected' : ''}`}>
      <p className="touch-info">
        {/* Показываем разный текст в зависимости от стадии */} 
        {isSelecting || selectedPlayerIndex !== null 
          ? `Игроков: ${players.length}`
          : `Положите пальцы: ${activeTouches} / ${expectedPlayers}`}
      </p>
      {/* Добавляем пояснение */} 
      <p className="touch-explanation">
          {explanationText}
      </p>
      
      {/* Визуализация точек касания/кружков игроков */} 
      {/* Если есть игроки (статус selecting или task_assigned), показываем их */} 
      {players.length > 0 ? (
        players.map((player, index) => {
          // Пытаемся найти соответствующую точку касания по fingerId (если они совпадают с id)
          // TODO: Убедиться, что fingerId совпадает с touch identifier или нужен другой маппинг
          // Пока используем заглушки для позиций, если нет касаний (например, после выбора)
          const touchPoint = touchPoints.find(p => p.id === player.fingerId); 
          const positionStyle = touchPoint 
            ? { left: `${touchPoint.x}px`, top: `${touchPoint.y}px` } 
            : { left: `${(index * 100) + 50}px`, top: '50%'}; // Примерная позиция, если касания нет

          const isHighlighted = index === highlightedPlayerIndex;
          const isSelected = index === selectedPlayerIndex;
          const playerClass = `touch-point player-${index} ${isHighlighted ? 'highlighted' : ''} ${isSelected ? 'selected' : ''}`;
          
          return (
              <div 
                key={player.fingerId} // Используем fingerId как ключ
                className={playerClass} 
                style={positionStyle}
              >
                 {/* Можно добавить #fingerId внутрь кружка */} 
                 <span className="player-id-text">#{player.fingerId}</span>
              </div>
          );
        })
      ) : ( 
        // Иначе (статус waiting) показываем просто точки касания как раньше
        touchPoints.map(point => (
            <div 
              key={point.id}
              className="touch-point"
              style={{ left: `${point.x}px`, top: `${point.y}px` }}
            />
        ))
      )}
      
    </div>
  );
}

export default FingerPlacementArea; 