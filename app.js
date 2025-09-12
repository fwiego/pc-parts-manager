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

// Handlebars с json helper
app.engine('handlebars', engine({
  helpers: {
    json: (context) => JSON.stringify(context),
    eq: (a, b) => a === b   // добавляем eq
  }
}));
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

// Парсинг форм
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Сессии
app.use(session({
  secret: 'supersecretkey',
  resave: false,
  saveUninitialized: true
}));

// ================== РОУТЫ ==================

// Главная
app.get('/', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('home', { title: 'PC Parts Manager', user: req.session.user });
});

// Регистрация
app.get('/register', (req, res) => res.render('register', { title: 'Регистрация' }));
app.post('/register', async (req, res) => {
  const { full_name, login, password } = req.body;
  if (!full_name || !login || !password) return res.status(400).send('Все поля обязательны');

  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    await pool.query(
      'INSERT INTO users (full_name, login, password_hash, role_id) VALUES (?, ?, ?, ?)',
      [full_name, login, hashedPassword, 2] // 2 = обычный пользователь
    );
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка при регистрации');
  }
});

// Логин
app.get('/login', (req, res) => res.render('login', { title: 'Авторизация' }));
app.post('/login', async (req, res) => {
  const { login, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE login = ?', [login]);
    if (rows.length === 0) return res.status(401).send('Неверный логин');

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).send('Неверный пароль');

    req.session.user = { id: user.user_id, name: user.full_name, role_id: user.role_id };
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка при авторизации');
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.redirect('/');
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

// Страница формирования отчета (только для менеджера)
app.get('/report', async (req, res) => {
  if (!req.session.user || req.session.user.role_id !== 1) return res.send('Доступ запрещён');

  const [components] = await pool.query('SELECT component_id, name, manufacturer FROM components');

  res.render('report', {
    title: 'Сформировать отчет',
    categories: { 'Комплектующая': components },
    user: req.session.user
  });
});

// Обработка формы отчета
app.post('/report', async (req, res) => {
  if (!req.session.user || req.session.user.role_id !== 1) return res.send('Доступ запрещён');

  const { component_id, type, quantity } = req.body;
  const userId = req.session.user.id;

  try {
    await pool.query(
      'INSERT INTO transactions (component_id, user_id, type, date, order_id) VALUES (?, ?, ?, NOW(), NULL)',
      [component_id, userId, type]
    );
    res.redirect('/reportcomplete');
  } catch (err) {
    console.error(err);
    res.send('Ошибка при формировании отчета!');
  }
});

// Просмотр всех отчетов менеджера
app.get('/reportcomplete', async (req, res) => {
  if (!req.session.user || req.session.user.role_id !== 1) return res.send('Доступ запрещён');

  const userId = req.session.user.id;
  try {
    const [rows] = await pool.query(
      'SELECT t.transaction_id, c.name, c.manufacturer, t.type, t.date ' +
      'FROM transactions t ' +
      'JOIN components c ON t.component_id = c.component_id ' +
      'WHERE t.user_id = ? ORDER BY t.date DESC',
      [userId]
    );
    res.render('reportcomplete', { title: 'Сформированные отчеты', reports: rows, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.send('Ошибка при загрузке отчетов!');
  }
});

// Запуск сервера
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
