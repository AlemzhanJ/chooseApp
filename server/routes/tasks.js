const express = require('express');
const router = express.Router();
const {
  getRandomTask,
  addTask,
  generateAiTask // Импортируем новый контроллер
} = require('../controllers/taskController');

// @route   GET api/tasks/random
// @desc    Получить случайное задание из БД
// @access  Public
router.get('/random', getRandomTask);

// @route   POST api/tasks/generate
// @desc    Сгенерировать задание с помощью AI (не сохраняет в БД)
// @access  Public
router.post('/generate', generateAiTask); 

// @route   POST api/tasks
// @desc    Добавить новое задание в БД
// @access  Private (предположительно, для админа)
router.post('/', addTask);

module.exports = router; 