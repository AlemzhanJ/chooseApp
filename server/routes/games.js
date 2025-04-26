const express = require('express');
const router = express.Router();
const {
  createGame,
  getGame,
  startGameSelection,
  selectWinnerOrTaskPlayer,
  updatePlayerStatus,
  deleteGame
} = require('../controllers/gameController'); // Импортируем контроллеры (создадим их позже)

// @route   POST api/games
// @desc    Создать новую игру
// @access  Public
router.post('/', createGame);

// @route   GET api/games/:gameId
// @desc    Получить состояние игры
// @access  Public
router.get('/:gameId', getGame);

// @route   PUT api/games/:gameId/start
// @desc    Начать процесс выбора (когда все пальцы на месте)
// @access  Public
router.put('/:gameId/start', startGameSelection);

// @route   POST api/games/:gameId/select
// @desc    Выполнить выбор победителя/игрока для задания
// @access  Public
router.post('/:gameId/select', selectWinnerOrTaskPlayer);

// @route   PUT api/games/:gameId/players/:fingerId
// @desc    Обновить статус игрока (выбыл/выполнил задание)
// @access  Public
router.put('/:gameId/players/:fingerId', updatePlayerStatus);

// @route   DELETE api/games/:gameId
// @desc    Удалить игру
// @access  Public
router.delete('/:gameId', deleteGame);

module.exports = router; 