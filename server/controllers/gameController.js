const Game = require('../models/Game');
const Task = require('../models/Task'); // Модель Task может понадобиться для режима с заданиями
// Импортируем сервис AI
const { generateTask: generateAiTaskService } = require('../services/ai-service');

// @desc    Создать новую игру
// @route   POST /api/games
// @access  Public
exports.createGame = async (req, res) => {
  try {
    // Достаем useAiTasks из тела запроса
    const { numPlayers, mode, eliminationEnabled, taskDifficulty, useAiTasks } = req.body;

    if (!numPlayers || !mode) {
      return res.status(400).json({ msg: 'Please provide numPlayers and mode' });
    }

    const newGame = new Game({
      numPlayers,
      mode,
      eliminationEnabled: eliminationEnabled === true, // Явно преобразуем в boolean
      taskDifficulty: taskDifficulty || 'any',
      useAiTasks: useAiTasks === true, // <--- Сохраняем настройку AI
      players: [], // Игроки добавляются позже, при старте выбора
      status: 'waiting',
      activePlayerCount: 0, // Изначально 0 активных игроков
    });

    const game = await newGame.save();
    res.status(201).json(game);
  } catch (err) {
    console.error('Error creating game:', err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Получить состояние игры
// @route   GET /api/games/:gameId
// @access  Public
exports.getGame = async (req, res) => {
  try {
    const game = await Game.findById(req.params.gameId).populate('currentTask'); // Загружаем данные задания, если оно есть

    if (!game) {
      return res.status(404).json({ msg: 'Game not found' });
    }

    res.json(game);
  } catch (err) {
    console.error('Error getting game:', err.message);
    if (err.kind === 'ObjectId') {
        return res.status(404).json({ msg: 'Game not found' });
    }
    res.status(500).send('Server Error');
  }
};

// @desc    Начать процесс выбора (когда все пальцы на месте)
// @route   PUT /api/games/:gameId/start
// @access  Public
exports.startGameSelection = async (req, res) => {
  try {
    const { fingers } = req.body; // Ожидаем массив типа [{ fingerId: 0 }, { fingerId: 1 }, ...]
    const gameId = req.params.gameId;

    if (!fingers || !Array.isArray(fingers) || fingers.length === 0) {
       return res.status(400).json({ msg: 'Fingers array is required' });
    }

    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({ msg: 'Game not found' });
    }

    // Проверяем, что игра в статусе ожидания
    if (game.status !== 'waiting') {
      return res.status(400).json({ msg: 'Game has already started or finished' });
    }

    // Проверяем, соответствует ли количество пальцев ожидаемому
    // if (fingers.length !== game.numPlayers) {
    //   return res.status(400).json({ msg: `Expected ${game.numPlayers} fingers, but received ${fingers.length}` });
    // }
    // Решил убрать эту проверку, т.к. numPlayers - это скорее максимальное кол-во

    // Создаем игроков на основе переданных пальцев
    game.players = fingers.map(f => ({ fingerId: f.fingerId, status: 'active' }));
    game.status = 'selecting'; // Меняем статус на "выбор"
    game.activePlayerCount = game.players.length; // Устанавливаем количество активных игроков

    await game.save();
    res.json(game);

  } catch (err) {
    console.error('Error starting game selection:', err.message);
     if (err.kind === 'ObjectId') {
        return res.status(404).json({ msg: 'Game not found' });
    }
    res.status(500).send('Server Error');
  }
};

// @desc    Выполнить выбор победителя/игрока для задания
// @route   POST /api/games/:gameId/select
// @access  Public
exports.selectWinnerOrTaskPlayer = async (req, res) => {
  try {
    const gameId = req.params.gameId;
    const game = await Game.findById(gameId);

    if (!game) return res.status(404).json({ msg: 'Game not found' });
    if (game.status !== 'selecting') return res.status(400).json({ msg: 'Game is not in selecting state' });

    const activePlayers = game.players.filter(p => p.status === 'active');
    if (activePlayers.length === 0) return res.status(400).json({ msg: 'No active players to select from' });

    // Выбираем игрока
    const randomIndex = Math.floor(Math.random() * activePlayers.length);
    const selectedPlayer = activePlayers[randomIndex];
    game.winnerFingerId = selectedPlayer.fingerId;

    // --- Логика выбора задания (AI или БД) --- 
    let responsePayload = {}; // Дополнительные данные для ответа (для AI задания)
    game.currentTask = null; // Сбрасываем ссылку на задачу из БД по умолчанию

    if (game.mode === 'simple') {
      game.status = 'finished';
      const winner = game.players.find(p => p.fingerId === game.winnerFingerId);
      if (winner) winner.status = 'winner';

    } else if (game.mode === 'tasks') {
      game.status = 'task_assigned';

      if (game.useAiTasks) {
        // --- Используем AI --- 
        console.log(`Generating AI task with difficulty: ${game.taskDifficulty}`);
        const generatedText = await generateAiTaskService(game.taskDifficulty);
        if (generatedText) {
            // Помещаем сгенерированное задание в доп. поле ответа
            responsePayload.aiGeneratedTask = { 
                text: generatedText, 
                difficulty: game.taskDifficulty, 
                isAiGenerated: true 
            };
        } else {
            console.error('AI service returned null, task generation failed.');
            // Возвращаем маркер ошибки
             responsePayload.aiGeneratedTask = { 
                text: "Не удалось сгенерировать задание с помощью ИИ.", 
                difficulty: game.taskDifficulty, 
                isAiGenerated: true, 
                error: true 
            };
        }
        // game.currentTask остается null

      } else {
        // --- Используем БД --- 
        console.log(`Fetching DB task with difficulty: ${game.taskDifficulty}`);
        const taskFilter = {};
        if (game.taskDifficulty !== 'any') {
          taskFilter.difficulty = game.taskDifficulty;
        }
        const taskCount = await Task.countDocuments(taskFilter);
        if (taskCount > 0) {
            const randomTaskIndex = Math.floor(Math.random() * taskCount);
            const randomTask = await Task.findOne(taskFilter).skip(randomTaskIndex);
            if (randomTask) {
                game.currentTask = randomTask._id; // Устанавливаем ссылку на задачу из БД
                console.log(`DB task found: ${randomTask._id}`);
            } else {
                 console.warn(`No tasks found for difficulty: ${game.taskDifficulty} even though count > 0`);
            }
        } else {
            console.warn(`No tasks found in DB for difficulty: ${game.taskDifficulty}`);
            // game.currentTask остается null
        }
      }
    }
    // -------------------------------------

    await game.save();
    
    // Получаем обновленное состояние игры, потенциально с populated currentTask, если была выбрана задача из БД
    const populatedGame = await Game.findById(game.id).populate('currentTask');
    
    // Отправляем обновленную игру и, возможно, сгенерированную AI задачу
    res.json({ game: populatedGame, ...responsePayload });

  } catch (err) {
    console.error('Error selecting winner/task player:', err.message);
    if (err.kind === 'ObjectId') {
        return res.status(404).json({ msg: 'Game not found' });
    }
    res.status(500).send('Server Error');
  }
};

// @desc    Обновить статус игрока (выбыл/выполнил задание)
// @route   PUT /api/games/:gameId/players/:fingerId
// @access  Public
exports.updatePlayerStatus = async (req, res) => {
  try {
    const { gameId, fingerId } = req.params;
    const { action } = req.body; // Ожидаем 'complete_task' или 'eliminate'

    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({ msg: 'Game not found' });
    }

    // Находим игрока по fingerId
    const player = game.players.find(p => p.fingerId.toString() === fingerId);
    if (!player) {
      return res.status(404).json({ msg: 'Player not found in this game' });
    }

    // Логика для режима с заданиями и выбыванием
    if (game.mode === 'tasks' && game.status === 'task_assigned') {
        if (action === 'eliminate') {
            if (game.eliminationEnabled && player.status === 'active') {
                player.status = 'eliminated';
                game.activePlayerCount -= 1;
            } else {
                 return res.status(400).json({ msg: 'Cannot eliminate player or elimination is disabled' });
            }
        } else if (action === 'complete_task') {
            // Если задание выполнено, просто переводим игру обратно в статус выбора
            // Статус игрока не меняется, он остается 'active'
            // Ничего не делаем с игроком, просто меняем статус игры
        } else {
            return res.status(400).json({ msg: 'Invalid action' });
        }

        // Проверяем, остался ли один победитель (если включено выбывание)
        if (game.eliminationEnabled && game.activePlayerCount === 1) {
            const winner = game.players.find(p => p.status === 'active');
            if (winner) {
                winner.status = 'winner';
                game.winnerFingerId = winner.fingerId;
                game.status = 'finished';
            }
        } else if (game.eliminationEnabled && game.activePlayerCount < 1) {
             // Ситуация, когда не осталось активных игроков (ничья?)
             game.status = 'finished'; // Просто завершаем
             game.winnerFingerId = null; // Нет победителя
        } else {
            // Если игра продолжается (задание выполнено или игрок выбыл, но остались другие)
            game.status = 'selecting'; // Возвращаем в статус выбора для следующего раунда
            game.currentTask = null; // Очищаем текущее задание
            game.winnerFingerId = null; // Очищаем выбранного игрока
        }

    } else {
      // Если режим не 'tasks' или статус не 'task_assigned', обновление не применимо
      return res.status(400).json({ msg: `Cannot update player status in mode '${game.mode}' and status '${game.status}'` });
    }

    await game.save();
    const populatedGame = await Game.findById(game.id).populate('currentTask');
    res.json(populatedGame);

  } catch (err) {
    console.error('Error updating player status:', err.message);
    if (err.kind === 'ObjectId') {
        return res.status(404).json({ msg: 'Game not found' });
    }
    res.status(500).send('Server Error');
  }
}; 