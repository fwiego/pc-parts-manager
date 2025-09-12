const express = require('express');
const pool = require('../db');
const router = express.Router();

// Страница создания отчета (форма)
router.get('/report', async (req, res) => {
  if (!req.session.user || req.session.user.role_id !== 1) return res.send('Доступ запрещён');

  const [components] = await pool.query('SELECT component_id, name, manufacturer, category FROM components');

  // Формируем объект категорий
  const categories = {};
  components.forEach(c => {
    if (!categories[c.category]) categories[c.category] = [];
    categories[c.category].push(c);
  });

  res.render('report', { title: 'Сформировать отчет', categories, user: req.session.user });
});

// Обработка формы отчета
router.post('/report', async (req, res) => {
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

// Страница со всеми отчетами менеджера
router.get('/reportcomplete', async (req, res) => {
  if (!req.session.user || req.session.user.role_id !== 1) return res.send('Доступ запрещён');

  const userId = req.session.user.id;
  const [rows] = await pool.query(
    `SELECT t.transaction_id, c.name, c.manufacturer, t.type, t.date
     FROM transactions t
     JOIN components c ON t.component_id = c.component_id
     WHERE t.user_id = ?
     ORDER BY t.date DESC`,
    [userId]
  );

  res.render('reportcomplete', { title: 'Сформированные отчеты', reports: rows, user: req.session.user });
});

module.exports = router;
