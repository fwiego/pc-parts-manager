const express = require('express');
const router = express.Router();
const pool = require('../db');

// Страница со всеми отчетами (только для админа)
router.get('/adminReports', async (req, res) => {
  // Проверка, что пользователь авторизован и админ
  if (!req.session.user || Number(req.session.user.role_id) !== 0) {
    return res.redirect('/login');
  }

  try {
    const [rows] = await pool.query(`
      SELECT transaction_id AS id, t.type, t.date,
             u.full_name AS manager,
             c.name AS component_name, c.manufacturer
      FROM transactions t
      JOIN users u ON t.user_id = u.user_id
      JOIN components c ON t.component_id = c.component_id
      ORDER BY t.date DESC
    `);

    res.render('adminReports', {
      reports: rows,
      user: req.session.user
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка загрузки отчетов');
  }
});

module.exports = router;
