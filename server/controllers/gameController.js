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
  console.log(`[${new Date().toISOString()}] --- ENTERING selectWinnerOrTaskPlayer ---`);
  console.log(`Game ID: ${req.params.gameId}`);
  // Логируем тело запроса, если оно ожидается (хотя в текущей логике оно не используется)
  // console.log("Request Body:", req.body); 
  
  let gameToDelete = null; 
  try {
    const gameId = req.params.gameId;
    console.log(`Attempting to find game with ID: ${gameId}`);
    const game = await Game.findById(gameId);

    if (!game) {
        console.log(`Game not found: ${gameId}`);
        return res.status(404).json({ msg: 'Game not found' });
    }
    console.log(`Game found. Current status: ${game.status}`);
    if (game.status !== 'selecting') {
        console.log(`Invalid game status: ${game.status}`);
        return res.status(400).json({ msg: 'Game is not in selecting state' });
    }

    const activePlayers = game.players.filter(p => p.status === 'active');
    console.log(`Found ${activePlayers.length} active players.`);
    if (activePlayers.length === 0) {
        console.log('No active players found.');
        return res.status(400).json({ msg: 'No active players to select from' });
    }

    const randomIndex = Math.floor(Math.random() * activePlayers.length);
    const selectedPlayer = activePlayers[randomIndex];
    game.winnerFingerId = selectedPlayer.fingerId;
    console.log(`Selected player fingerId: ${game.winnerFingerId}`);

    let responsePayload = {}; 
    game.currentTask = null;

    if (game.mode === 'simple') {
      console.log('Mode: simple. Setting status to finished.');
      game.status = 'finished';
      const winner = game.players.find(p => p.fingerId === game.winnerFingerId);
      if (winner) winner.status = 'winner';
      // gameToDelete = game.id; // <-- УДАЛЯЕМ немедленное удаление

    } else if (game.mode === 'tasks') {
      console.log('Mode: tasks. Setting status to task_assigned.');
      game.status = 'task_assigned';
      if (game.useAiTasks) {
        console.log('Using AI tasks. Calling generateAiTaskService...');
        const generatedText = await generateAiTaskService(game.taskDifficulty);
        console.log(`AI Task generated: ${generatedText ? 'Success' : 'Failure'}`);
        if (generatedText) {
            responsePayload.aiGeneratedTask = { text: generatedText, difficulty: game.taskDifficulty, isAiGenerated: true };
        } else {
             responsePayload.aiGeneratedTask = { text: "Не удалось сгенерировать задание с помощью ИИ.", difficulty: game.taskDifficulty, isAiGenerated: true, error: true };
        }
      } else {
        console.log('Using DB tasks. Searching for tasks...');
        const taskFilter = {};
        if (game.taskDifficulty !== 'any') taskFilter.difficulty = game.taskDifficulty;
        const taskCount = await Task.countDocuments(taskFilter);
        console.log(`Found ${taskCount} tasks in DB with filter:`, taskFilter);
        if (taskCount > 0) {
            const randomTaskIndex = Math.floor(Math.random() * taskCount);
            const randomTask = await Task.findOne(taskFilter).skip(randomTaskIndex);
            if (randomTask) {
                game.currentTask = randomTask._id;
                console.log(`Assigned DB task ID: ${game.currentTask}`);
            } else {
                 console.log('Failed to fetch random task from DB.');
            }
        } else {
            console.warn(`No tasks found in DB for difficulty: ${game.taskDifficulty}`);
            responsePayload.aiGeneratedTask = { text: `Задания сложности '${game.taskDifficulty}' не найдены в базе.`, difficulty: game.taskDifficulty, isAiGenerated: false, error: true };
        }
      }
    }

    console.log('Attempting to save game changes...');
    await game.save();
    console.log('Game saved successfully. Attempting to repopulate...');
    const populatedGame = await Game.findById(game.id).populate('currentTask');
    console.log('Game repopulated. Sending response to client...');
    
    res.json({ game: populatedGame, ...responsePayload });
    console.log('Response sent.');

    // Если игра была помечена для удаления, удаляем ее
    /* <-- УДАЛЯЕМ БЛОК
    if (gameToDelete) {
        console.log(`Deleting finished elimination game: ${gameToDelete}`);
        // Запускаем удаление в фоне, не ждем завершения
        Game.findByIdAndDelete(gameToDelete).exec(); 
    }
    */

  } catch (err) {
    // --- Улучшенное логирование ошибок --- 
    console.error(`[${new Date().toISOString()}] --- ERROR in selectWinnerOrTaskPlayer ---`);
    console.error(`Game ID: ${req?.params?.gameId}`);
    console.error('Error Message:', err.message);
    console.error('Error Stack:', err.stack);
    // --- Конец улучшенного логирования --- 
    if (!res.headersSent) { // Проверяем, не был ли уже отправлен ответ
      if (err.kind === 'ObjectId') {
          res.status(404).json({ msg: 'Game not found (in catch block)' });
      } else {
          res.status(500).send('Server Error (in catch block)');
      }
    }
  }
};

// @desc    Обновить статус игрока (выбыл/выполнил задание)
// @route   PUT /api/games/:gameId/players/:fingerId
// @access  Public
exports.updatePlayerStatus = async (req, res) => {
  let gameToDelete = null; // Переменная для хранения ID игры для удаления
  try {
    const { gameId, fingerId } = req.params;
    const { action } = req.body;
    const game = await Game.findById(gameId);

    if (!game) return res.status(404).json({ msg: 'Game not found' });

    const player = game.players.find(p => p.fingerId.toString() === fingerId);
    if (!player) return res.status(404).json({ msg: 'Player not found in this game' });

    // --- Логика для режима заданий --- 
    if (game.mode === 'tasks' && (game.status === 'task_assigned' || game.status === 'selecting' || game.status === 'waiting')) { // Добавил selecting/waiting для lifted_finger
        if (action === 'eliminate') {
            if (game.eliminationEnabled && player.status === 'active') {
                player.status = 'eliminated';
                game.activePlayerCount -= 1;
            } else {
                 return res.status(400).json({ msg: 'Cannot eliminate player now or elimination is disabled' });
            }
        } else if (action === 'complete_task') {
            // Только в статусе task_assigned
            if (game.status !== 'task_assigned') {
                return res.status(400).json({ msg: 'Cannot complete task when not assigned' });
            }
            // Ничего не делаем со статусом игрока, он остается 'active'
        } else if (action === 'lifted_finger') {
            // Обработка поднятия пальца в любой момент активной игры
            if (player.status === 'active') {
                console.log(`Player ${fingerId} lifted finger. Eliminating.`);
                player.status = 'eliminated';
                game.activePlayerCount -= 1;
                // Проверяем конец игры СРАЗУ после выбывания
                 if (game.eliminationEnabled && game.activePlayerCount <= 1) {
                    // Логика завершения игры (победитель или ничья)
                    const winner = game.players.find(p => p.status === 'active');
                    if (winner) {
                        winner.status = 'winner';
                        game.winnerFingerId = winner.fingerId;
                        console.log(`Game finished due to finger lift. Winner: ${winner.fingerId}`);
                    } else {
                        game.winnerFingerId = null; // Ничья
                         console.log(`Game finished due to finger lift. No winner (draw).`);
                    }
                    game.status = 'finished';
                    game.currentTask = null; // Очищаем задание, если было
                } else {
                   // Если игрок поднял палец во время выбора, а игра продолжается,
                   // нужно вернуть статус в 'waiting', чтобы выбор начался заново
                   // с оставшимися игроками, когда они будут готовы.
                   // Если игрок поднял палец во время задания другого игрока, статус не меняем.
                   if (game.status === 'selecting') {
                       console.log('Finger lifted during selection, returning to waiting');
                       game.status = 'waiting';
                       // Сбрасываем 'выбранного', если он был (хотя в selecting его еще нет)
                       game.winnerFingerId = null; 
                   } else if (game.status === 'task_assigned') {
                       // Если игрок, выполнявший задание, поднял палец, 
                       // то игра все равно вернется в 'waiting' после этой функции.
                       // Если палец поднял другой игрок, статус task_assigned остается.
                       console.log('Finger lifted during task assignment phase.');
                   }
                }
            } else {
                 // Игрок уже не активен, ничего не делаем
                 console.log(`Player ${fingerId} lifted finger, but was already status: ${player.status}`);
                 return res.status(400).json({ msg: `Player ${fingerId} is already ${player.status}` });
            }
        } else {
            return res.status(400).json({ msg: 'Invalid action for tasks mode' });
        }

        // --- Общая логика после действия (если игра НЕ завершилась поднятием пальца) ---
        if (game.status !== 'finished') {
            if (action === 'complete_task' || (action === 'eliminate' && game.activePlayerCount > 0)) {
                 // После выполнения задания или если выбыл не последний игрок
                 // Проверяем, нужно ли завершать игру (даже после complete_task, если вдруг остался 1)
                 if (game.eliminationEnabled && game.activePlayerCount === 1) {
                     const winner = game.players.find(p => p.status === 'active');
                     if (winner) {
                         winner.status = 'winner';
                         game.winnerFingerId = winner.fingerId;
                         game.status = 'finished';
                         console.log(`Game finished after action ${action}. Winner: ${winner.fingerId}`);
                     } else { // Маловероятно, но возможно при race condition
                         game.status = 'finished';
                         game.winnerFingerId = null; 
                         console.log(`Game finished after action ${action}. No winner.`);
                     }
                 } else if (game.eliminationEnabled && game.activePlayerCount < 1) {
                      game.status = 'finished'; // Ничья
                      game.winnerFingerId = null;
                      console.log(`Game finished after action ${action}. Draw.`);
                 } else {
                     // Если игра продолжается (больше 1 игрока или выбывание отключено)
                     game.status = 'waiting'; // Возвращаем в ожидание для след. раунда/выбора
                     console.log(`Action ${action} completed. Returning to waiting state.`);
                 }
                 game.currentTask = null;
                 // game.winnerFingerId = null; // Не сбрасываем, если только что определили победителя
                 if (game.status === 'waiting') game.winnerFingerId = null; // Сбрасываем только если перешли в waiting

            } else if (action === 'eliminate' && game.activePlayerCount <= 0 && game.eliminationEnabled) {
                // Все выбыли (ничья)
                game.status = 'finished';
                game.winnerFingerId = null;
                game.currentTask = null;
                console.log(`Game finished after elimination. Draw.`);
            }
            // Если action был 'lifted_finger' и игра не закончилась, статус уже обработан выше
        }
    // --- Добавим блок else if для 'simple' режима, если там тоже нужно отслеживать пальцы --- 
    // } else if (game.mode === 'simple' && action === 'lifted_finger') {
    //     if (player.status === 'active' && (game.status === 'selecting' || game.status === 'waiting')) {
    //         player.status = 'eliminated'; // В простом режиме это просто меняет статус
    //         // Возможно, нужно остановить выбор и вернуть в waiting? Зависит от требований.
    //         if (game.status === 'selecting') {
    //             game.status = 'waiting';
    //         }
    //         console.log(`Player ${fingerId} lifted finger in simple mode.`);
    //     } else {
    //         return res.status(400).json({ msg: `Cannot process lift action for player ${fingerId} in state ${game.status}/${player.status}` });
    //     }
    } else {
      // Изначальная логика или ошибка для других режимов/статусов
      return res.status(400).json({ msg: `Cannot update player status in mode '${game.mode}' and status '${game.status}' with action '${action}'` });
    }

    await game.save();
    // Получаем финальное состояние перед отправкой
    // const finalGameState = await Game.findById(game.id).populate('currentTask'); // Populate если нужно
    const finalGameState = await Game.findById(game.id);

    // Отправляем ответ клиенту ПЕРЕД удалением
    res.json(finalGameState);

    // Если игра была помечена для удаления, удаляем ее
    /* <-- УДАЛЯЕМ БЛОК
    if (gameToDelete) {
        console.log(`Deleting finished elimination game: ${gameToDelete}`);
        // Запускаем удаление в фоне, не ждем завершения
        Game.findByIdAndDelete(gameToDelete).exec(); 
    }
    */

  } catch (err) {
    console.error('Error updating player status:', err.message);
    if (err.kind === 'ObjectId') {
        return res.status(404).json({ msg: 'Game not found' });
    }
    res.status(500).send('Server Error');
  }
}; 

// --- НОВАЯ ФУНКЦИЯ УДАЛЕНИЯ --- 
// @desc    Удалить игру (предпочтительно завершенную)
// @route   DELETE /api/games/:gameId
// @access  Public (или можно защитить позже)
exports.deleteGame = async (req, res) => {
  try {
    const gameId = req.params.gameId;
    console.log(`[${new Date().toISOString()}] --- ATTEMPTING to delete game: ${gameId} ---`);
    const game = await Game.findById(gameId);

    if (!game) {
      // Если игры уже нет, это не ошибка в данном контексте
      console.log(`Game ${gameId} not found for deletion (already deleted?).`);
      return res.status(204).send(); // No Content
    }

    // Опционально: разрешать удаление только завершенных игр
    // if (game.status !== 'finished') {
    //   console.log(`Attempt to delete non-finished game ${gameId} with status ${game.status}. Denying.`);
    //   return res.status(400).json({ msg: 'Cannot delete game that is not finished' });
    // }

    await Game.findByIdAndDelete(gameId);
    console.log(`Game ${gameId} deleted successfully.`);
    res.status(204).send(); // No Content

  } catch (err) {
    console.error(`[${new Date().toISOString()}] --- ERROR deleting game ${req?.params?.gameId} ---`);
    console.error('Error Message:', err.message);
    console.error('Error Stack:', err.stack);
    if (!res.headersSent) {
       if (err.kind === 'ObjectId') {
           // Игра не найдена для удаления - не ошибка
           res.status(204).send(); 
       } else {
           res.status(500).send('Server Error during game deletion');
       }
    }
  }
};
// --- КОНЕЦ НОВОЙ ФУНКЦИИ --- 