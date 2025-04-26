const { GoogleGenerativeAI } = require("@google/generative-ai");

// Убедимся, что dotenv загружает переменные и для этого файла, если он запускается не из server.js
// Если вы используете nodemon, он обычно подхватывает .env из корня server/, но для надежности можно добавить:
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); // Используем наш GEMINI_API_KEY

// Проверяем, загрузился ли ключ
if (!process.env.GEMINI_API_KEY) {
  console.error("Ошибка: API_KEY для Google Generative AI не найден в переменных окружения.");
  // Можно выбросить ошибку или установить флаг, чтобы не использовать AI
}


// Используем модель gemini-1.5-flash
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Функция для генерации задачи
async function generateTask(difficulty) {
  // Создаем более детальный промпт
  let promptIntro = "Придумай короткое и весёлое задание для игры 'Выбор Счастливчика', в которую играет компания людей на вечеринке. Задание должно быть выполнимым одним человеком за пару минут.";
  let difficultyDescription = "";

  switch (difficulty) {
    case 'easy':
      difficultyDescription = "Задание должно быть очень простым, возможно, немного глупым или физическим.";
      break;
    case 'medium':
      difficultyDescription = "Задание должно быть умеренно сложным, может потребовать немного креативности или актёрских навыков.";
      break;
    case 'hard':
      difficultyDescription = "Задание должно быть сложным, необычным или немного вызывающим, требующим смекалки или смелости.";
      break;
    default: // Если сложность 'any' или не указана
      difficultyDescription = "Сложность задания может быть любой.";
  }

  const fullPrompt = `${promptIntro} Уровень сложности: ${difficulty}. ${difficultyDescription} Выдай только текст самого задания, без лишних фраз вроде \"Вот задание:\" или объяснений.`;

  console.log("Отправка промпта в Gemini:", fullPrompt); // Логируем промпт для отладки

  try {
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text().trim(); // Убираем лишние пробелы

    console.log("Ответ от Gemini:", text); // Логируем ответ

    // Простая проверка, что ответ не пустой
    if (!text) {
        throw new Error("Модель Gemini вернула пустой ответ.");
    }

    return text; // Возвращаем только текст задания

  } catch (error) {
      console.error("Ошибка при обращении к Gemini API:", error);
      // Возвращаем null или стандартное задание в случае ошибки
      return null;
      // Или можно выбросить ошибку дальше:
      // throw new Error("Не удалось сгенерировать задание с помощью ИИ.");
  }
}

// Экспортируем функцию
module.exports = {
    generateTask
};

