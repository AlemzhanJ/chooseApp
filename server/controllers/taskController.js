const Task = require('../models/Task');
const { generateTask: generateAiTaskService } = require('../services/ai-service'); // Импортируем AI сервис

// @desc    Добавить новое задание
// @route   POST /api/tasks
// @access  Private (пока что Public для простоты)
exports.addTask = async (req, res) => {
  try {
    const { text, difficulty, category } = req.body;

    if (!text || !difficulty) {
      return res.status(400).json({ msg: 'Please provide text and difficulty' });
    }

    const newTask = new Task({
      text,
      difficulty,
      category,
    });

    const task = await newTask.save();
    res.status(201).json(task);
  } catch (err) {
    console.error('Error adding task:', err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Получить случайное задание
// @route   GET /api/tasks/random
// @access  Public
exports.getRandomTask = async (req, res) => {
  try {
    const { difficulty } = req.query; // Получаем сложность из query parameters (?difficulty=easy)
    const filter = {};

    if (difficulty && ['easy', 'medium', 'hard'].includes(difficulty)) {
      filter.difficulty = difficulty;
    }

    // Получаем количество документов, соответствующих фильтру
    const count = await Task.countDocuments(filter);
    if (count === 0) {
      return res.status(404).json({ msg: 'No tasks found matching the criteria' });
    }

    // Генерируем случайный индекс
    const random = Math.floor(Math.random() * count);

    // Находим одно случайное задание, пропуская 'random' количество документов
    const task = await Task.findOne(filter).skip(random);

    res.json(task);
  } catch (err) {
    console.error('Error getting random task:', err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Сгенерировать задание с помощью AI
// @route   POST /api/tasks/generate
// @access  Public (пока что)
exports.generateAiTask = async (req, res) => {
  try {
    const { difficulty = 'any' } = req.query; // Берем сложность из query ?difficulty=medium

    // Вызываем сервис генерации
    const generatedText = await generateAiTaskService(difficulty);

    if (!generatedText) {
      // Если сервис вернул null (ошибка генерации)
      return res.status(500).json({ msg: 'Failed to generate task using AI' });
    }

    // Важно: Мы НЕ сохраняем AI-задание в базу данных Task по умолчанию.
    // Мы просто возвращаем сгенерированный текст.
    // Если нужно сохранять, то здесь нужно создать new Task(...) и task.save(),
    // а затем вернуть сохраненное задание.
    res.json({ 
        text: generatedText, 
        difficulty: difficulty, // Возвращаем сложность, которую запрашивали
        isAiGenerated: true // Добавляем флаг, что это AI
    });

  } catch (err) {
      console.error('Error generating AI task:', err.message);
      res.status(500).send('Server Error');
  }
}; 