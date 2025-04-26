import React, { useState, useEffect, useRef } from 'react';
import './AnimationCanvas.css'; // Добавим стили

// Используем нашу новую палитру для сегментов
const wheelColors = ['#5DADE2', '#F5B041', '#58D68D', '#EC7063', '#AF7AC5', '#F4D03F', '#48C9B0', '#EB984E'];

// onSelectionTrigger - функция, которую нужно вызвать, 
// чтобы GameScreen сделал POST-запрос на /select
function AnimationCanvas({ players, onSelectionTrigger }) {
  const [isSpinning, setIsSpinning] = useState(false);
  const wheelRef = useRef(null);
  const [finalRotation, setFinalRotation] = useState(0); // Сохраним конечное положение

  const numPlayers = players.length;
  const segmentAngle = 360 / numPlayers;
  
  useEffect(() => {
    const wheelElement = wheelRef.current;
    if (!wheelElement) return; // Если элемента нет, выходим

    setIsSpinning(true);
    console.log('AnimationCanvas: Starting spin effect');

    const randomSpins = Math.floor(Math.random() * 5) + 8;
    const randomAngleWithin360 = Math.random() * 360;
    const targetRotation = randomSpins * 360 + randomAngleWithin360;
    const spinDuration = Math.random() * 2000 + 4000;

    setFinalRotation(targetRotation);
    
    // 1. Сбрасываем transition и устанавливаем начальное положение (0 градусов)
    wheelElement.style.transition = 'none';
    wheelElement.style.transform = 'rotate(0deg)'; // Или можно использовать previous finalRotation? Пока 0.

    // 2. Используем setTimeout, чтобы применить transition и конечный transform в следующем тике
    const applyAnimationTimeout = setTimeout(() => {
        // Проверяем ref еще раз на случай, если компонент размонтировался
        const currentWheelElement = wheelRef.current; 
        if (currentWheelElement) {
            console.log('AnimationCanvas: Applying transition and transform');
            currentWheelElement.style.transition = `transform ${spinDuration / 1000}s cubic-bezier(0.1, 0.7, 0.3, 1)`; 
            currentWheelElement.style.transform = `rotate(${targetRotation}deg)`;
        }
    }, 50); // Небольшая задержка (50ms)

    // 3. Таймер для вызова onSelectionTrigger после завершения анимации
    const triggerTimeout = setTimeout(() => {
      console.log('AnimationCanvas: Visual animation ended, triggering backend.');
      setIsSpinning(false); 
      setTimeout(onSelectionTrigger, 100); // Небольшая доп. задержка
    }, spinDuration + 50); // Учитываем задержку применения анимации

    // Очистка
    return () => {
        console.log('AnimationCanvas: Cleaning up timeouts');
        clearTimeout(applyAnimationTimeout);
        clearTimeout(triggerTimeout);
        // Можно добавить сброс стилей при размонтировании, если нужно
        // const finalWheelElement = wheelRef.current;
        // if (finalWheelElement) {
        //     finalWheelElement.style.transition = 'none';
        // }
    };

  }, [players, onSelectionTrigger]); // Зависимости кажутся правильными

  // Увеличиваем радиус для меток, чтобы они были ближе к краю
  const labelRadius = 120; 

  return (
    <div className="animation-container">
       <div className="wheel-shadow"></div> {/* Добавляем тень под колесо */}
      <div className="wheel-wrapper">
        <div className="arrow"></div> {/* Заменим текст на стилизованный элемент */}
        <div className="wheel-center-deco"></div> {/* Декор в центре */}
        <div className="wheel" ref={wheelRef} style={{
            // Добавляем градиент и разделители
            background: `repeating-conic-gradient(
                from 0deg,
                ${players.map((player, index) => 
                    `${wheelColors[index % wheelColors.length]} ${index * segmentAngle}deg ${(index + 1) * segmentAngle - 1}deg, #FFFFFF ${(index + 1) * segmentAngle - 1}deg ${(index + 1) * segmentAngle}deg` // Добавляем белую линию в 1 градус
                ).join(', ')}
            )`,
        }}>
          {players.map((player, index) => {
             const angle = index * segmentAngle + segmentAngle / 2;
             const labelX = labelRadius * Math.cos((angle - 90) * Math.PI / 180);
             const labelY = labelRadius * Math.sin((angle - 90) * Math.PI / 180);
             // Поворачиваем метку вместе с колесом, но текст оставляем горизонтальным
             const rotationAngle = angle; 
             return (
                 <div 
                     key={player.fingerId} 
                     className="player-label-container" 
                     style={{
                         transform: `translate(-50%, -50%) rotate(${rotationAngle}deg)`,
                         left: `calc(50% + ${labelX}px)`,
                         top: `calc(50% + ${labelY}px)`,
                     }}
                 >
                   <span className="player-label-text" style={{ transform: `rotate(${-rotationAngle}deg)` }}> 
                    #{player.fingerId}
                   </span>
                 </div>
             );
          })}
        </div>
      </div>
      <h2 className="status-text">{isSpinning ? 'Крутим вертим...' : 'Выбор сделан! ✨'}</h2>
    </div>
  );
}

export default AnimationCanvas; 