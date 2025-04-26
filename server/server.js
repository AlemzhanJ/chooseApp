const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const cors = require('cors');

// Загрузка переменных окружения из .env файла в корне папки server
dotenv.config();

// Подключение к базе данных
connectDB();

const app = express();

// --- Настройка CORS для Production --- 
const allowedOrigins = [
    'http://localhost:3000', // Для локальной разработки
    'https://choose-app-seven.vercel.app' // <-- ИСПРАВЛЕННЫЙ URL!
];

const corsOptions = {
  origin: function (origin, callback) {
    // Разрешить запросы без origin (Postman, curl) или из списка разрешенных
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.error(`CORS error: Origin ${origin} not allowed`); 
      callback(new Error('Not allowed by CORS'));
    }
  },
  optionsSuccessStatus: 200 
};

app.use(cors(corsOptions));
// -------------------------------------

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