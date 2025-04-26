const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const cors = require('cors');

// Загрузка переменных окружения из .env файла в корне папки server
dotenv.config();

// Подключение к базе данных
connectDB();

const app = express();

// Включение CORS для всех маршрутов (настройте более строго для production)
app.use(cors());

// Middleware для парсинга JSON
app.use(express.json());

// Базовый маршрут для проверки
app.get('/', (req, res) => res.send('API Running'));

// Подключение роутов API
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/games', require('./routes/games'));

// Определение порта
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server started on port ${PORT}`)); 