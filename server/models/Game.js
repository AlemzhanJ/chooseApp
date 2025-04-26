const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PlayerSchema = new Schema({
  fingerId: {
    // Уникальный ID пальца/позиции (0, 1, 2...)
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['active', 'eliminated', 'winner'],
    default: 'active',
  },
  // Можно добавить другие поля для игрока, если нужно
}, { _id: false });

const GameSchema = new Schema(
  {
    players: [PlayerSchema], // Массив игроков (пальцев)
    numPlayers: {
      // Ожидаемое количество игроков для старта
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ['waiting', 'selecting', 'task_assigned', 'finished'],
      default: 'waiting',
    },
    mode: {
      type: String,
      enum: ['simple', 'tasks'],
      required: true,
    },
    eliminationEnabled: {
      type: Boolean,
      default: false,
    },
    taskDifficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard', 'any'],
      default: 'any',
    },
    useAiTasks: {
      type: Boolean,
      default: false,
    },
    currentTask: {
      type: Schema.Types.ObjectId,
      ref: 'Task', // Ссылка на модель Task
      default: null,
    },
    winnerFingerId: {
      // ID пальца победителя (или выбранного для задания)
      type: Number,
      default: null,
    },
    activePlayerCount: {
      // Количество активных игроков (для режима с выбыванием)
      type: Number,
      default: 0,
    },
    taskTimeLimit: {
      type: Number,
      default: null,
    },
    // Поле для истории игры (опционально)
    // history: [{ round: Number, taskId: Schema.Types.ObjectId, eliminatedFingerId: Number }],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Game', GameSchema); 