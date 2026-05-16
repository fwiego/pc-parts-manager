const express  = require('express');
const bcrypt   = require('bcrypt');
const pool     = require('../db');
const router   = express.Router();

router.get('/register', (req, res) => {
  res.render('register', { title: 'Регистрация' });
});

router.post('/register', async (req, res) => {
  const { full_name, login, password } = req.body;
  if (!full_name || !login || !password) {
    return res.render('register', { title: 'Регистрация', error: 'Все поля обязательны' });
  }
  try {
    const [existing] = await pool.query('SELECT user_id FROM users WHERE login = ?', [login]);
    if (existing.length > 0) {
      return res.render('register', { title: 'Регистрация', error: 'Логин уже занят' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (full_name, login, password_hash, role_id) VALUES (?, ?, ?, 2)',
      [full_name, login, hashedPassword]
    );
    req.session.flash = [{ type: 'success', message: 'Аккаунт создан! Войдите в систему.' }];
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    res.render('register', { title: 'Регистрация', error: 'Ошибка сервера, попробуйте позже' });
  }
});

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { title: 'Авторизация' });
});

router.post('/login', async (req, res) => {
  const { login, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE login = ?', [login]);
    if (rows.length === 0) {
      return res.render('login', { title: 'Авторизация', error: 'Неверный логин или пароль' });
    }
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.render('login', { title: 'Авторизация', error: 'Неверный логин или пароль' });
    }
    req.session.user = { id: user.user_id, name: user.full_name, role_id: Number(user.role_id) };
    req.session.flash = [{ type: 'success', message: `Добро пожаловать, ${user.full_name}!` }];
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.render('login', { title: 'Авторизация', error: 'Ошибка сервера' });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

module.exports = router;
