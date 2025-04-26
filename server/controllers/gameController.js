const Game = require('../models/Game');
const Task = require('../models/Task'); // Модель Task может понадобиться для режима с заданиями
// Импортируем сервис AI
const { generateTask: generateAiTaskService } = require('../services/ai-service');

// @desc    Создать новую игру
// @route   POST /api/games
// @access  Public
exports.createGame = async (req, res) => {
  try {
    // Достаем все возможные настройки из тела запроса
    const { 
        numPlayers, 
        mode, 
        eliminationEnabled, 
        taskDifficulty, 
        useAiTasks, 
        taskTimeLimit // <--- Достаем лимит времени
    } = req.body;

    if (!numPlayers || !mode) {
      return res.status(400).json({ msg: 'Please provide numPlayers and mode' });
    }

    const newGameData = {
      numPlayers,
      mode,
      status: 'waiting',
      players: [],
      activePlayerCount: 0, 
    };
    
    // Добавляем настройки специфичные для режима 'tasks'
    if (mode === 'tasks') {
        newGameData.eliminationEnabled = eliminationEnabled === true;
        newGameData.taskDifficulty = taskDifficulty || 'any';
        newGameData.useAiTasks = useAiTasks === true;
        // Сохраняем лимит времени только если он передан и выбывание включено
        if (eliminationEnabled === true && taskTimeLimit && Number.isInteger(taskTimeLimit) && taskTimeLimit > 0) {
            newGameData.taskTimeLimit = taskTimeLimit;
        } else {
             newGameData.taskTimeLimit = null; // Явно ставим null, если не используется
        }
    }

    const newGame = new Game(newGameData);
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
  let gameToDelete = null; // Переменная для хранения ID игры для удаления
  try {
    const gameId = req.params.gameId;
    const game = await Game.findById(gameId);

    if (!game) return res.status(404).json({ msg: 'Game not found' });
    if (game.status !== 'selecting') return res.status(400).json({ msg: 'Game is not in selecting state' });

    const activePlayers = game.players.filter(p => p.status === 'active');
    if (activePlayers.length === 0) return res.status(400).json({ msg: 'No active players to select from' });

    const randomIndex = Math.floor(Math.random() * activePlayers.length);
    const selectedPlayer = activePlayers[randomIndex];
    game.winnerFingerId = selectedPlayer.fingerId;

    let responsePayload = {}; 
    game.currentTask = null;

    if (game.mode === 'simple') {
      game.status = 'finished';
      const winner = game.players.find(p => p.fingerId === game.winnerFingerId);
      if (winner) winner.status = 'winner';
      gameToDelete = game.id; // <--- Помечаем игру для удаления

    } else if (game.mode === 'tasks') {
      game.status = 'task_assigned';
      if (game.useAiTasks) {
        // --- Используем AI --- 
        const generatedText = await generateAiTaskService(game.taskDifficulty);
        if (generatedText) {
            responsePayload.aiGeneratedTask = { text: generatedText, difficulty: game.taskDifficulty, isAiGenerated: true };
        } else {
             responsePayload.aiGeneratedTask = { text: "Не удалось сгенерировать задание с помощью ИИ.", difficulty: game.taskDifficulty, isAiGenerated: true, error: true };
        }
      } else {
        // --- Используем БД --- 
        const taskFilter = {};
        if (game.taskDifficulty !== 'any') taskFilter.difficulty = game.taskDifficulty;
        const taskCount = await Task.countDocuments(taskFilter);
        if (taskCount > 0) {
            const randomTaskIndex = Math.floor(Math.random() * taskCount);
            const randomTask = await Task.findOne(taskFilter).skip(randomTaskIndex);
            if (randomTask) game.currentTask = randomTask._id;
        } else {
            console.warn(`No tasks found in DB for difficulty: ${game.taskDifficulty}`);
            // Если задач в БД нет, но режим с задачами, можно тоже вернуть AI-подобный объект ошибки
            responsePayload.aiGeneratedTask = { text: `Задания сложности '${game.taskDifficulty}' не найдены в базе.`, difficulty: game.taskDifficulty, isAiGenerated: false, error: true };
        }
      }
    }

    await game.save();
    const populatedGame = await Game.findById(game.id).populate('currentTask');
    
    // Отправляем ответ клиенту ПЕРЕД удалением
    res.json({ game: populatedGame, ...responsePayload });

    // Если игра была помечена для удаления, удаляем ее
    if (gameToDelete) {
        console.log(`Deleting finished simple game: ${gameToDelete}`);
        // Запускаем удаление в фоне, не ждем завершения
        Game.findByIdAndDelete(gameToDelete).exec(); 
    }

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
  let gameToDelete = null;
  let eliminatedPlayerFingerId = null; // <--- Добавим переменную для ID выбывшего
  try {
    const { gameId, fingerId } = req.params;
    const { action } = req.body;
    const game = await Game.findById(gameId);

    if (!game) return res.status(404).json({ msg: 'Game not found' });

    const player = game.players.find(p => p.fingerId.toString() === fingerId);
    if (!player) return res.status(404).json({ msg: 'Player not found in this game' });

    // Убедимся, что обновляем статус нужного игрока (того, кому было задание)
    if (game.winnerFingerId !== player.fingerId) {
         return res.status(400).json({ msg: 'Cannot update status for a player who was not selected for the task.' });
    }

    if (game.mode === 'tasks' && game.status === 'task_assigned') {
        if (action === 'eliminate') {
            if (game.eliminationEnabled && player.status === 'active') {
                player.status = 'eliminated';
                game.activePlayerCount -= 1;
                eliminatedPlayerFingerId = player.fingerId; // <--- Запомним ID выбывшего
            } else {
                 // Если выбывание отключено или игрок уже не активен
                 return res.status(400).json({ msg: 'Cannot eliminate player or elimination is disabled' });
            }
        } else if (action === 'complete_task') {
            // Статус игрока не меняется, он остается 'active'
        } else {
            return res.status(400).json({ msg: 'Invalid action' });
        }

        // Проверка на победителя или продолжение игры
        if (game.eliminationEnabled && game.activePlayerCount === 1) {
            // Определяем победителя
            const winner = game.players.find(p => p.status === 'active');
            if (winner) {
                winner.status = 'winner';
                game.winnerFingerId = winner.fingerId;
                game.status = 'finished';
                gameToDelete = game.id;
            }
        } else if (game.eliminationEnabled && game.activePlayerCount < 1) {
             // Ничья (все выбыли одновременно?)
             game.status = 'finished';
             game.winnerFingerId = null; 
             gameToDelete = game.id;
        } else {
            // Продолжение игры: сброс задания и переход к выбору
            game.status = 'selecting'; 
            game.currentTask = null;
            game.winnerFingerId = null;
             // eliminatedPlayerFingerId уже установлен, если кто-то выбыл
        }
    } else {
      return res.status(400).json({ msg: `Cannot update player status in mode '${game.mode}' and status '${game.status}'` });
    }

    await game.save();
    // Получаем финальное состояние перед отправкой
    const finalGameState = await Game.findById(game.id);

    // Формируем ответ
    const responsePayload = {
        game: finalGameState,
        // Добавляем ID выбывшего, только если игра продолжается (status = selecting)
        ...(finalGameState.status === 'selecting' && eliminatedPlayerFingerId !== null && { eliminatedPlayerFingerId })
    };

    // Отправляем ответ клиенту ПЕРЕД удалением
    res.json(responsePayload); // <--- Отправляем расширенный ответ

    // Если игра была помечена для удаления, удаляем ее
    if (gameToDelete) {
        console.log(`Deleting finished elimination game: ${gameToDelete}`);
        Game.findByIdAndDelete(gameToDelete).exec(); 
    }

  } catch (err) {
    console.error('Error updating player status:', err.message);
    if (err.kind === 'ObjectId') {
        return res.status(404).json({ msg: 'Game not found' });
    }
    res.status(500).send('Server Error');
  }
}; 