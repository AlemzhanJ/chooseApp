import React from 'react';
import './WinnerDisplay.css';

function WinnerDisplay({ winnerFingerId, mode }) {
  return (
    <div className="winner-display-container">
      <div className="trophy">🏆</div>
      {winnerFingerId !== null ? (
        <> 
          <h2>Победитель!</h2>
          <p className="winner-text">Палец номер <span className="winner-id">#{winnerFingerId}</span> выбран!</p>
          {/* Можно добавить сообщение в зависимости от режима */} 
          {mode === 'simple' && <p>Поздравляем счастливчика!</p>}
          {mode === 'tasks' && <p>Поздравляем единственного выжившего!</p>}
        </>
      ) : (
        <> 
         <h2>Игра завершена!</h2>
         <p>Ничья или победитель не определен.</p>
        </>
      )}
    </div>
  );
}

export default WinnerDisplay; 