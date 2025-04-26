import React, { useState, useEffect } from 'react';
import './AnimationCanvas.css'; // Добавим стили

const colors = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#F7C8E0', '#B1AFFF', '#FFACAC', '#A0C3D2'];

// onSelectionTrigger - функция, которую нужно вызвать, 
// чтобы GameScreen сделал POST-запрос на /select
function AnimationCanvas({ players, onSelectionTrigger }) {
  const [isSpinning, setIsSpinning] = useState(false);
  // const wheelRef = useRef(null); // Реф пока не нужен для стилей

  const numPlayers = players.length;
  const segmentAngle = 360 / numPlayers;
  
  useEffect(() => {
    // const wheelElement = wheelRef.current; // Пока не используем реф
    setIsSpinning(true);
    console.log('Animation started for players:', players);

    const spinDuration = Math.random() * 3000 + 3000;
    
    // --- Убираем установку стилей через JS --- 
    /*
    if (wheelElement) {
        wheelElement.style.transition = `transform ${spinDuration / 1000}s cubic-bezier(0.25, 0.1, 0.25, 1)`;
        wheelElement.style.transform = `rotate(${360 * 10 + Math.random() * 360}deg)`;
    }
    */

    // Оставляем только таймер для вызова onSelectionTrigger
    const animationTimeout = setTimeout(() => {
      console.log('Animation finished visually (CSS keyframes), triggering backend selection.');
      setIsSpinning(false);
      onSelectionTrigger();
    }, spinDuration);

    return () => {
        clearTimeout(animationTimeout);
        // Очистка стилей больше не нужна здесь
        /*
        if (wheelElement) {
             wheelElement.style.transition = '';
             wheelElement.style.transform = '';
        }
        */
    };

  }, [players, onSelectionTrigger]);

  // Рассчитываем позицию метки чуть ближе к центру
  const labelRadius = 100; // Расстояние от центра в пикселях

  return (
    <div className="animation-container">
      <div className="wheel-wrapper">
        <div className="arrow">▼</div>
        {/* Убираем реф */}
        <div className="wheel" /* ref={wheelRef} */ style={{
            background: `conic-gradient(${players.map((player, index) => 
                `${colors[index % colors.length]} ${index * segmentAngle}deg ${(index + 1) * segmentAngle}deg`
            ).join(', ')})`,
        }}>
          {/* --- Метки для игроков --- */}
          {players.map((player, index) => {
             const angle = index * segmentAngle + segmentAngle / 2; // Угол центра сегмента
             const labelX = labelRadius * Math.cos((angle - 90) * Math.PI / 180); // -90 для коррекции начальной позиции
             const labelY = labelRadius * Math.sin((angle - 90) * Math.PI / 180);
             return (
                 <div 
                     key={player.fingerId} 
                     className="player-label" 
                     style={{
                         // Позиционируем относительно центра колеса
                         left: `calc(50% + ${labelX}px)`,
                         top: `calc(50% + ${labelY}px)`,
                         transform: 'translate(-50%, -50%)', // Центрируем саму метку
                     }}
                 >
                   #{player.fingerId}
                 </div>
             );
          })}
        </div>
      </div>
      <h2>{isSpinning ? 'Выбираем... (CSS Spin)' : 'Выбор сделан! Ждем результат...'}</h2>
      {/* Можно отобразить ID пальцев, участвующих в выборе */}
      {/* <div className="player-ids">
        Участники: {players.map(p => `#${p.fingerId}`).join(', ')}
      </div> */}
    </div>
  );
}

export default AnimationCanvas; 