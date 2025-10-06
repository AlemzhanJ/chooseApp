import React from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/Button'; // Импортируем компонент Button
import './StartScreen.css'; // Добавим файл стилей

function StartScreen() {
  const navigate = useNavigate();

  const goToSettings = () => {
    navigate('/settings');
  };

  return (
    <div className="start-screen-container">
      <div className="main-content">
        <h1>Кто счастливчик? 🎯</h1>
        <p>Собери друзей и узнайте, кому сегодня повезет больше всех!</p>
        
        <div className="start-buttons">
          <Button onClick={goToSettings} variant="success" className="start-button">
            🚀 Начать игру
          </Button>
          <Button onClick={goToSettings} variant="info" className="settings-button">
            ⚙️ Настройки
          </Button>
        </div>
      </div>
    </div>
  );
}

export default StartScreen; 