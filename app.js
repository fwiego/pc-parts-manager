const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const session = require('express-session');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

// Настройка БД
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

// Handlebars
app.engine('handlebars', engine());
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'supersecretkey',
  resave: false,
  saveUninitialized: true
}));

// ================== РОУТЫ ==================

// Главная (доступна только после авторизации)
app.get('/', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  res.render('home', { 
    title: 'PC Parts Manager',
    user: req.session.user
  });
});

// Страница регистрации
app.get('/register', (req, res) => {
  res.render('register', { title: 'Регистрация' });
});

// Обработка регистрации
app.post('/register', async (req, res) => {
  const { full_name, login, password } = req.body;

  if (!full_name || !login || !password) {
    return res.status(400).send('Все поля обязательны для заполнения');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    await pool.query(
      'INSERT INTO users (full_name, login, password_hash, role_id) VALUES (?, ?, ?, ?)',
      [full_name, login, hashedPassword, 2]
    );
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка при регистрации');
  }
});


// Страница авторизации
app.get('/login', (req, res) => {
  res.render('login', { title: 'Авторизация' });
});

// Обработка авторизации
app.post('/login', async (req, res) => {
  const { login, password } = req.body;

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE login = ?', [login]);

    if (rows.length === 0) {
      return res.status(401).send('Неверный логин или пароль');
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return res.status(401).send('Неверный логин или пароль');
    }

    // Сохраняем данные в сессию
    req.session.user = {
      id: user.user_id,
      name: user.full_name,
      role_id: user.role_id
    };

    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка при авторизации');
  }
});

// Выход
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
