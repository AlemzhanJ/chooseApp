import React, { useState, useEffect, useRef } from 'react';
import './AnimationCanvas.css'; // Добавим стили

const colors = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#F7C8E0', '#B1AFFF', '#FFACAC', '#A0C3D2'];

// onSelectionTrigger - функция, которую нужно вызвать, 
// чтобы GameScreen сделал POST-запрос на /select
function AnimationCanvas({ players, onSelectionTrigger, justEliminatedPlayerId }) {
  const [isSpinning, setIsSpinning] = useState(false);
  const [showEliminationMessage, setShowEliminationMessage] = useState(false); // Состояние для показа сообщения
  const wheelRef = useRef(null);
  const messageTimeoutRef = useRef(null); // Ref для таймера сообщения

  const numPlayers = players.length;
  const segmentAngle = numPlayers > 0 ? 360 / numPlayers : 360; // Учитываем случай 0 игроков
  
  useEffect(() => {
    const wheelElement = wheelRef.current;
    
    // Сброс таймеров при изменении зависимостей
    clearTimeout(messageTimeoutRef.current);
    setShowEliminationMessage(false);
    setIsSpinning(false); // Убедимся, что спиннинг не застрял
    if(wheelElement) {
      wheelElement.style.transition = '';
      wheelElement.style.transform = '';
    }

    // Функция для старта вращения
    const startSpin = () => {
      setIsSpinning(true);
      setShowEliminationMessage(false); // Скрываем сообщение перед вращением
      console.log('Animation started for players:', players);
      const spinDuration = Math.random() * 3000 + 3000;
      if (wheelElement) {
          wheelElement.style.transition = `transform ${spinDuration / 1000}s cubic-bezier(0.25, 0.1, 0.25, 1)`;
          // Делаем больше оборотов для визуального эффекта
          const randomEndAngle = 360 * (5 + Math.floor(Math.random() * 5)) + Math.random() * 360;
          wheelElement.style.transform = `rotate(${randomEndAngle}deg)`;
      }
      const animationTimeout = setTimeout(() => {
        console.log('Animation finished visually, triggering backend selection.');
        setIsSpinning(false); 
        onSelectionTrigger();
      }, spinDuration);
      
      // Возвращаем ID таймаута анимации для возможной очистки
      return animationTimeout; 
    };

    let mainTimeoutId = null;

    // Показываем сообщение о выбывании, если есть ID
    if (justEliminatedPlayerId !== null) {
      setShowEliminationMessage(true);
      // Запускаем вращение после паузы
      messageTimeoutRef.current = setTimeout(() => {
        mainTimeoutId = startSpin(); 
      }, 2000); // Показываем сообщение 2 секунды
    } else {
      // Если никто не выбыл, запускаем вращение сразу
      mainTimeoutId = startSpin(); 
    }

    // Очистка при размонтировании или изменении зависимостей
    return () => {
        clearTimeout(messageTimeoutRef.current);
        if (mainTimeoutId) clearTimeout(mainTimeoutId); // Очищаем таймаут анимации
        if (wheelElement) {
             wheelElement.style.transition = '';
             wheelElement.style.transform = '';
        }
    };
  }, [players, onSelectionTrigger, justEliminatedPlayerId]);

  // Рассчитываем позицию метки чуть ближе к центру
  const labelRadius = 100; // Расстояние от центра в пикселях

  return (
    <div className="animation-container">
      {/* Показываем сообщение о выбывании поверх колеса */} 
      {showEliminationMessage && (
          <div className="elimination-message">
              Игрок #{justEliminatedPlayerId} выбыл!
          </div>
      )}
      
      <div className="wheel-wrapper">
        <div className="arrow">▼</div>
        <div className="wheel" ref={wheelRef} style={{
            background: numPlayers > 0 ? `conic-gradient(${players.map((player, index) => 
                `${colors[index % colors.length]} ${index * segmentAngle}deg ${(index + 1) * segmentAngle}deg`
            ).join(', ')})` : '#ccc', // Серый фон, если нет игроков
            // Скрываем колесо, пока показывается сообщение
            opacity: showEliminationMessage ? 0 : 1, 
            transition: 'opacity 0.5s ease-in-out' // Плавное появление колеса
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
      {/* Меняем текст в зависимости от состояния */} 
      <h2>
          {showEliminationMessage 
              ? ' ' // Не показываем текст, пока есть сообщение
              : isSpinning 
                  ? 'Выбираем следующего...' 
                  : 'Выбор сделан! Ждем результат...'}
      </h2>
    </div>
  );
}

export default AnimationCanvas; 