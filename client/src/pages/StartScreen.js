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
      <h1>Кто счастливчик?</h1>{/* Или другое название */} 
      <p>Положите пальцы на экран, чтобы начать!</p>
      
      <div className="start-buttons">
         {/* Пока кнопка "Начать" ведет в настройки, т.к. нужно сначала выбрать параметры */}
        <Button onClick={goToSettings} variant="success" className="start-button">
          Начать игру
        </Button>
        <Button onClick={goToSettings} variant="info" className="settings-button">
          Настройки
        </Button>
      </div>
      {/* В будущем здесь может быть область для расположения пальцев сразу */}
    </div>
  );
}

export default StartScreen; 