const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: [true, 'Task text is required'],
      trim: true,
    },
    difficulty: {
      type: String,
      required: [true, 'Difficulty is required'],
      enum: ['easy', 'medium', 'hard'], // Допустимые значения сложности
      default: 'medium',
    },
    category: {
      type: String,
      trim: true,
      // Не обязательное поле
    },
  },
  {
    timestamps: true, // Добавляет поля createdAt и updatedAt
  }
);

module.exports = mongoose.model('Task', TaskSchema); 