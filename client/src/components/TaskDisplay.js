import React, { useState, useEffect, useRef } from 'react';
import Button from './Button'; // Импортируем Button
import './TaskDisplay.css'; // Добавим стили

// task: объект задания { text, difficulty, ... }
// onAction: функция обратного вызова (action) => void, где action это 'complete_task' или 'eliminate'
// eliminationEnabled: boolean
// taskTimeLimit: number
function TaskDisplay({ task, selectedPlayerFingerId, onAction, eliminationEnabled, taskTimeLimit }) {

  // Состояние для оставшегося времени
  const [timeLeft, setTimeLeft] = useState(taskTimeLimit);
  const timerRef = useRef(null); // Ref для хранения ID интервала

  // Эффект для запуска и остановки таймера
  useEffect(() => {
    // Запускаем таймер только если есть лимит времени и выбывание включено
    if (eliminationEnabled && taskTimeLimit > 0) {
      setTimeLeft(taskTimeLimit); // Устанавливаем начальное время при монтировании или смене taskTimeLimit

      timerRef.current = setInterval(() => {
        setTimeLeft(prevTime => {
          if (prevTime <= 1) {
            clearInterval(timerRef.current); // Останавливаем таймер
            timerRef.current = null;
            console.log('Time is up! Eliminating player.');
            onAction('eliminate'); // Вызываем выбывание
            return 0;
          }
          return prevTime - 1;
        });
      }, 1000); // Каждую секунду

      // Очистка при размонтировании или изменении зависимостей
      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };
    } else {
      // Если таймер не нужен, убедимся, что он очищен
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setTimeLeft(null); // Сбрасываем время, если оно не используется
    }
  }, [taskTimeLimit, eliminationEnabled, onAction]); // Добавляем зависимости

  // Улучшенная обработка отсутствия задачи
  if (!task || !task.text) {
    const errorMessage = task?.error 
      ? task.text // Показываем сообщение об ошибке от AI
      : "Задание не найдено или не удалось сгенерировать.";
    return (
      <div className={`task-display-container error ${task?.isAiGenerated ? 'ai-task' : ''}`}>
        <h2>Упс!</h2>
        <p>Игрок #{selectedPlayerFingerId}, для вас задание: {errorMessage}</p>
        <p>Попробуйте продолжить.</p>
        <Button onClick={() => onAction('complete_task')} variant="warning" className="action-button">
            Продолжить без задания
        </Button>
      </div>
    );
  }

  const isAiTask = task.isAiGenerated === true;

  return (
    // Добавляем класс ai-task для стилизации
    <div className={`task-display-container ${isAiTask ? 'ai-task' : ''}`}>
       {isAiTask && <div className="ai-badge">✨ AI Задание</div>}
      <h2>Задание для Игрока #{selectedPlayerFingerId}!</h2>
      {/* Показываем сложность, если она есть */} 
      {task.difficulty && <p className="task-difficulty">Сложность: {task.difficulty}</p>} 
      <p className="task-text">{task.text}</p>
      
      {/* --- Отображение таймера --- */} 
      {timeLeft !== null && taskTimeLimit && (
          <div className="timer-container">
              <div className="timer-bar" style={{ width: `${(timeLeft / taskTimeLimit) * 100}%` }}></div>
              <span className="timer-text">Осталось: {timeLeft} сек</span>
          </div>
      )}
      
      <div className="task-actions">
          <p>Выполнил задание?</p>
          {/* Делаем кнопки неактивными, если время вышло (на всякий случай) */} 
          <Button 
            onClick={() => onAction('complete_task')}
            variant="success" 
            className="action-button complete"
            disabled={timeLeft === 0}
          >
              Да! (Продолжить)
          </Button>
          {eliminationEnabled && (
              <Button 
                onClick={() => onAction('eliminate')}
                variant="danger" 
                className="action-button eliminate"
                disabled={timeLeft === 0}
              >
                  Нет! (Выбыть)
              </Button>
          )}
      </div>
    </div>
  );
}

export default TaskDisplay; 