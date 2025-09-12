const express = require('express');
const pool = require('../db');
const router = express.Router();

// Просмотр всех пользователей (только admin)
router.get('/users', async (req, res) => {
  if (!req.session.user || req.session.user.role_id !== 0) {
    return res.send('Доступ запрещён');
  }

  const [rows] = await pool.query('SELECT user_id, full_name, login, role_id FROM users');
  res.render('users', { title: 'Список пользователей', users: rows, user: req.session.user });
});

// Изменение роли пользователя (только admin)
router.post('/users/:id/role', async (req, res) => {
  if (!req.session.user || req.session.user.role_id !== 0) {
    return res.send('Доступ запрещён');
  }

  const userId = req.params.id;
  const { role_id } = req.body;

  await pool.query('UPDATE users SET role_id = ? WHERE user_id = ?', [role_id, userId]);
  res.redirect('/users');
});

module.exports = router;
