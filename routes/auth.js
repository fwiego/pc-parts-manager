const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');
const router = express.Router();

// Регистрация
router.get('/register', (req, res) => {
  res.render('register', { title: 'Регистрация' });
});

router.post('/register', async (req, res) => {
  const { full_name, login, password } = req.body;
  if (!full_name || !login || !password) return res.status(400).send('Все поля обязательны');

  const hashedPassword = await bcrypt.hash(password, 10);
  await pool.query(
    'INSERT INTO users (full_name, login, password_hash, role_id) VALUES (?, ?, ?, 2)',
    [full_name, login, hashedPassword]
  );
  res.redirect('/login');
});

// Авторизация
router.get('/login', (req, res) => res.render('login', { title: 'Авторизация' }));

router.post('/login', async (req, res) => {
  const { login, password } = req.body;
  const [rows] = await pool.query('SELECT * FROM users WHERE login = ?', [login]);
  if (rows.length === 0) return res.status(401).send('Неверный логин или пароль');

  const user = rows[0];
  if (!(await bcrypt.compare(password, user.password_hash))) return res.status(401).send('Неверный логин или пароль');

  req.session.user = { id: user.user_id, name: user.full_name, role_id: user.role_id };
  res.redirect('/');
});

// Выход
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

module.exports = router;
