const express = require('express');
const pool    = require('../db');
const router  = express.Router();

const categoryNames = {
  RAM: 'Оперативная память',
  CPU: 'Процессоры',
  GPU: 'Видеокарты',
  HDD: 'Жёсткие диски',
  SSD: 'SSD-накопители'
};

function requireManager(req, res, next) {
  if (!req.session.user || req.session.user.role_id !== 1) return res.redirect('/login');
  next();
}

router.get('/report', requireManager, async (req, res) => {
  try {
    const [components] = await pool.query(
      'SELECT component_id, name, manufacturer, category FROM components'
    );
    const categories = {};
    components.forEach(c => {
      if (!categories[c.category]) categories[c.category] = [];
      categories[c.category].push(c);
    });
    res.render('report', { title: 'Сформировать отчёт', categories, categoryNames, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка загрузки компонентов');
  }
});

router.post('/report', requireManager, async (req, res) => {
  const { component_id, type, quantity } = req.body;
  if (!component_id || !type || !quantity) return res.redirect('/report');

  try {
    await pool.query(
      'INSERT INTO transactions (user_id, component_id, type, quantity, date) VALUES (?, ?, ?, ?, NOW())',
      [req.session.user.id, component_id, type, quantity]
    );
    req.session.flash = [{ type: 'success', message: 'Транзакция успешно создана!' }];
    res.redirect('/reportcomplete');
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка при сохранении транзакции');
  }
});

router.get('/reportcomplete', requireManager, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.transaction_id, c.name, c.manufacturer, t.type, t.quantity, t.date
       FROM transactions t
       JOIN components c ON t.component_id = c.component_id
       WHERE t.user_id = ?
       ORDER BY t.date DESC`,
      [req.session.user.id]
    );
    res.render('reportcomplete', { title: 'Сформированные отчёты', reports: rows, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка загрузки отчётов');
  }
});

module.exports = router;
