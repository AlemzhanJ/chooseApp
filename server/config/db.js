const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' }); // Указываем путь к .env в корне server

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      // Убираем устаревшие опции
      // useNewUrlParser: true, 
      // useUnifiedTopology: true,
    });
    console.log('MongoDB Connected...');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    // Выход из процесса с ошибкой
    process.exit(1);
  }
};

module.exports = connectDB; 