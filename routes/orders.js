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

function requireUser(req, res, next) {
  if (!req.session.user || req.session.user.role_id !== 2) return res.redirect('/login');
  next();
}
function requireManager(req, res, next) {
  if (!req.session.user || req.session.user.role_id !== 1) return res.redirect('/login');
  next();
}

// ─── ЮЗЕР ────────────────────────────────────────────────────────────────────

router.get('/orders/create', requireUser, async (req, res) => {
  try {
    const [components] = await pool.query(
      'SELECT component_id, name, manufacturer, category FROM components'
    );
    const categories = {};
    components.forEach(c => {
      if (!categories[c.category]) categories[c.category] = [];
      categories[c.category].push(c);
    });
    res.render('orderCreate', { title: 'Создать заказ', categories, categoryNames, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка загрузки компонентов');
  }
});

router.post('/orders/create', requireUser, async (req, res) => {
  const { component_id, quantity } = req.body;
  if (!component_id || !quantity || quantity < 1) return res.redirect('/orders/create');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      'INSERT INTO orders (client_id, user_id, status) VALUES (?, NULL, "pending")',
      [req.session.user.id]
    );
    await conn.query(
      'INSERT INTO order_items (order_id, component_id, quantity) VALUES (?, ?, ?)',
      [result.insertId, component_id, quantity]
    );
    await conn.commit();

    req.session.flash = [{ type: 'success', message: 'Заказ успешно создан!' }];
    res.redirect('/orders/my');
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).send('Ошибка при создании заказа');
  } finally {
    conn.release();
  }
});

router.get('/orders/my', requireUser, async (req, res) => {
  try {
    const [orders] = await pool.query(
      `SELECT o.order_id, o.order_date, o.status,
              c.name AS component_name, c.manufacturer, oi.quantity
       FROM orders o
       JOIN order_items oi ON o.order_id     = oi.order_id
       JOIN components  c  ON oi.component_id = c.component_id
       WHERE o.client_id = ?
       ORDER BY o.order_date DESC`,
      [req.session.user.id]
    );
    res.render('ordersMy', { title: 'Мои заказы', orders, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка загрузки заказов');
  }
});

// ─── МЕНЕДЖЕР ─────────────────────────────────────────────────────────────────

router.get('/orders', requireManager, async (req, res) => {
  try {
    const [orders] = await pool.query(
      `SELECT o.order_id, o.order_date, o.status,
              u.full_name  AS client_name,
              c.name       AS component_name, c.manufacturer,
              oi.quantity
       FROM orders o
       JOIN users       u  ON o.client_id    = u.user_id
       JOIN order_items oi ON o.order_id     = oi.order_id
       JOIN components  c  ON oi.component_id = c.component_id
       ORDER BY FIELD(o.status, 'pending', 'approved', 'rejected'), o.order_date DESC`
    );
    res.render('ordersManager', { title: 'Заказы пользователей', orders, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка загрузки заказов');
  }
});

router.post('/orders/:id/status', requireManager, async (req, res) => {
  const orderId = req.params.id;
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) return res.redirect('/orders');

  try {
    await pool.query(
      'UPDATE orders SET status = ?, user_id = ? WHERE order_id = ?',
      [status, req.session.user.id, orderId]
    );
    const label = status === 'approved' ? 'Заказ одобрен' : 'Заказ отклонён';
    const type  = status === 'approved' ? 'success' : 'error';
    req.session.flash = [{ type, message: label }];
    res.redirect('/orders');
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка обновления статуса');
  }
});

module.exports = router;
