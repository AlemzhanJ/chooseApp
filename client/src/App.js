import React from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route
} from 'react-router-dom';
import './App.css';

// Импорт компонентов страниц
import StartScreen from './pages/StartScreen';
import SettingsScreen from './pages/SettingsScreen';
import GameScreen from './pages/GameScreen';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<StartScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/game/:gameId" element={<GameScreen />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
