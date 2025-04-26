import React from 'react';
import Button from './Button'; // Импортируем Button
import './TaskDisplay.css'; // Добавим стили

// task: объект задания { text, difficulty, ... }
// onAction: функция обратного вызова (action) => void, где action это 'complete_task' или 'eliminate'
// eliminationEnabled: boolean
function TaskDisplay({ task, selectedPlayerFingerId, onAction, eliminationEnabled }) {

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
      
      <div className="task-actions">
          <p>Выполнил задание?</p>
          <Button onClick={() => onAction('complete_task')} variant="success" className="action-button complete">
              Да! (Продолжить)
          </Button>
          {eliminationEnabled && (
              <Button onClick={() => onAction('eliminate')} variant="danger" className="action-button eliminate">
                  Нет! (Выбыть)
              </Button>
          )}
      </div>
    </div>
  );
}

export default TaskDisplay; 