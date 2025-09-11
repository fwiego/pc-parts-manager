const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

// Подключаем Handlebars
app.engine('handlebars', engine());
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views')); // Абсолютный путь к папке views

// Для парсинга JSON в запросах
app.use(express.json());

// Главная страница
app.get('/', (req, res) => {
  res.render('home', { title: 'PC Parts Manager' });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
