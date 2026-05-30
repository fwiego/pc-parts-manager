const express = require('express');
const pool    = require('../db');
const router  = express.Router();

function requireManager(req, res, next) {
  if (!req.session.user || req.session.user.role_id !== 1) return res.redirect('/login');
  next();
}

router.get('/report', requireManager, async (req, res) => {
  try {
    // Берём компоненты вместе с занятыми ячейками по каждому из них
    const [components] = await pool.query(`
      SELECT c.component_id, c.name, c.manufacturer, c.category,
             GROUP_CONCAT(cl.cell_number ORDER BY cl.cell_number SEPARATOR ', ') AS occupied_cells
      FROM components c
      LEFT JOIN order_items oi ON oi.component_id = c.component_id
      LEFT JOIN cells cl ON oi.cell_id = cl.cell_id AND cl.is_occupied = 1
      GROUP BY c.component_id
      ORDER BY c.category, c.name
    `);

    // Группируем по категории
    const categories = {};
    components.forEach(c => {
      if (!categories[c.category]) categories[c.category] = [];
      categories[c.category].push(c);
    });

    res.render('report', { title: 'Создать транзакцию', categories, user: req.session.user });
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
      `SELECT t.transaction_id, c.name, c.manufacturer, c.category, t.type, t.quantity, t.date
       FROM transactions t
       JOIN components c ON t.component_id = c.component_id
       WHERE t.user_id = ?
       ORDER BY t.date DESC`,
      [req.session.user.id]
    );
    res.render('reportcomplete', { title: 'Мои транзакции', reports: rows, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка загрузки транзакций');
  }
});

module.exports = router;
