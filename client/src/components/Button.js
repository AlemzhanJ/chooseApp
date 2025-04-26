import React from 'react';
import './Button.css';

function Button({ onClick, children, type = 'button', disabled = false, variant = 'primary' /* primary, secondary, danger */, className = '' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`btn btn-${variant} ${className}`} // Добавляем базовый класс и класс варианта
    >
      {children}
    </button>
  );
}

export default Button; 