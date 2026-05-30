const express = require('express');
const pool    = require('../db');
const router  = express.Router();

function requireUser(req, res, next) {
  if (!req.session.user || req.session.user.role_id !== 2) return res.redirect('/login');
  next();
}
function requireManager(req, res, next) {
  if (!req.session.user || req.session.user.role_id !== 1) return res.redirect('/login');
  next();
}

// ─── ЮЗЕР: ДАШБОРД ───────────────────────────────────────────────────────────

// GET /dashboard — каталог компонентов с сортировкой
router.get('/dashboard', requireUser, async (req, res) => {
  try {
    const { sort, category } = req.query;

    let query = 'SELECT component_id, name, manufacturer, model, category, price, quantity FROM components WHERE quantity > 0';
    const params = [];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    if (sort === 'price_asc')  query += ' ORDER BY price ASC';
    else if (sort === 'price_desc') query += ' ORDER BY price DESC';
    else query += ' ORDER BY category, name';

    const [components] = await pool.query(query, params);
    const [categories] = await pool.query('SELECT DISTINCT category FROM components WHERE quantity > 0 ORDER BY category');

    res.render('dashboard', {
      title: 'Каталог комплектующих',
      components,
      categories: categories.map(r => r.category),
      currentCategory: category || '',
      currentSort: sort || '',
      user: req.session.user
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка загрузки каталога');
  }
});

// ─── ЮЗЕР: ЗАКАЗЫ ────────────────────────────────────────────────────────────

// POST /orders/create — создание заказа из корзины (несколько позиций)
router.post('/orders/create', requireUser, async (req, res) => {
  // items приходят как JSON-строка: [{ component_id, quantity }, ...]
  let items;
  try {
    items = JSON.parse(req.body.items);
  } catch {
    req.session.flash = [{ type: 'error', message: 'Корзина пуста или повреждена' }];
    return res.redirect('/dashboard');
  }

  if (!Array.isArray(items) || items.length === 0) {
    req.session.flash = [{ type: 'error', message: 'Добавьте хотя бы одну позицию' }];
    return res.redirect('/dashboard');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      'INSERT INTO orders (client_id, user_id, status) VALUES (?, NULL, "pending")',
      [req.session.user.id]
    );
    const orderId = result.insertId;

    for (const item of items) {
      if (!item.component_id || !item.quantity || item.quantity < 1) continue;
      await conn.query(
        'INSERT INTO order_items (order_id, component_id, quantity) VALUES (?, ?, ?)',
        [orderId, item.component_id, item.quantity]
      );
    }

    await conn.commit();
    req.session.flash = [{ type: 'success', message: 'Заказ успешно оформлен!' }];
    res.redirect('/orders/my');
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).send('Ошибка при создании заказа');
  } finally {
    conn.release();
  }
});

// GET /orders/my — личный кабинет юзера
router.get('/orders/my', requireUser, async (req, res) => {
  try {
    // Получаем заказы сгруппированные
    const [orders] = await pool.query(
      `SELECT o.order_id, o.order_date, o.status,
              oi.order_item_id, oi.quantity,
              c.name AS component_name, c.manufacturer, c.category,
              cl.cell_number
       FROM orders o
       JOIN order_items oi ON o.order_id      = oi.order_id
       JOIN components  c  ON oi.component_id = c.component_id
       LEFT JOIN cells  cl ON oi.cell_id      = cl.cell_id
       WHERE o.client_id = ?
       ORDER BY o.order_date DESC, o.order_id`,
      [req.session.user.id]
    );

    // Группируем позиции по заказу
    const ordersMap = {};
    orders.forEach(row => {
      if (!ordersMap[row.order_id]) {
        ordersMap[row.order_id] = {
          order_id:   row.order_id,
          order_date: row.order_date,
          status:     row.status,
          items: []
        };
      }
      ordersMap[row.order_id].items.push({
        order_item_id:  row.order_item_id,
        component_name: row.component_name,
        manufacturer:   row.manufacturer,
        category:       row.category,
        quantity:       row.quantity,
        cell_number:    row.cell_number
      });
    });

    res.render('ordersMy', {
      title: 'Мои заказы',
      orders: Object.values(ordersMap),
      user: req.session.user
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка загрузки заказов');
  }
});

// ─── МЕНЕДЖЕР: СПИСОК ЗАКАЗОВ ─────────────────────────────────────────────────

router.get('/orders', requireManager, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.order_id, o.order_date, o.status,
              u.full_name     AS client_name,
              oi.order_item_id, oi.quantity,
              c.name          AS component_name, c.manufacturer, c.category,
              cl.cell_number, cl.cell_id
       FROM orders o
       JOIN users       u  ON o.client_id    = u.user_id
       JOIN order_items oi ON o.order_id     = oi.order_id
       JOIN components  c  ON oi.component_id = c.component_id
       LEFT JOIN cells  cl ON oi.cell_id     = cl.cell_id
       ORDER BY FIELD(o.status,'pending','approved','issued','rejected'), o.order_date DESC`
    );

    // Группируем по заказу
    const ordersMap = {};
    rows.forEach(row => {
      if (!ordersMap[row.order_id]) {
        ordersMap[row.order_id] = {
          order_id:   row.order_id,
          order_date: row.order_date,
          status:     row.status,
          client_name: row.client_name,
          items: []
        };
      }
      ordersMap[row.order_id].items.push({
        order_item_id:  row.order_item_id,
        component_name: row.component_name,
        manufacturer:   row.manufacturer,
        category:       row.category,
        quantity:       row.quantity,
        cell_number:    row.cell_number,
        cell_id:        row.cell_id
      });
    });

    // Свободные ячейки для формы назначения
    const [freeCells] = await pool.query(
      'SELECT cell_id, cell_number FROM cells WHERE is_occupied = 0 ORDER BY cell_number'
    );

    res.render('ordersManager', {
      title: 'Заказы пользователей',
      orders: Object.values(ordersMap),
      freeCells,
      user: req.session.user
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка загрузки заказов');
  }
});

// POST /orders/:id/approve — одобрить заказ и назначить ячейки
router.post('/orders/:id/approve', requireManager, async (req, res) => {
  const orderId = req.params.id;
  // cells приходит как объект { order_item_id: cell_id, ... }
  const cellAssignments = req.body.cells || {};

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Получаем позиции заказа
    const [items] = await conn.query(
      'SELECT order_item_id FROM order_items WHERE order_id = ?', [orderId]
    );

    for (const item of items) {
      const cellId = cellAssignments[item.order_item_id];
      if (!cellId) continue;

      // Назначаем ячейку позиции
      await conn.query(
        'UPDATE order_items SET cell_id = ? WHERE order_item_id = ?',
        [cellId, item.order_item_id]
      );
      // Помечаем ячейку занятой
      await conn.query(
        'UPDATE cells SET is_occupied = 1 WHERE cell_id = ?', [cellId]
      );
    }

    await conn.query(
      'UPDATE orders SET status = "approved", user_id = ? WHERE order_id = ?',
      [req.session.user.id, orderId]
    );

    await conn.commit();
    req.session.flash = [{ type: 'success', message: 'Заказ одобрен, ячейки назначены' }];
    res.redirect('/orders');
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).send('Ошибка одобрения заказа');
  } finally {
    conn.release();
  }
});

// POST /orders/:id/issue — выдать заказ → освободить ячейки
router.post('/orders/:id/issue', requireManager, async (req, res) => {
  const orderId = req.params.id;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Освобождаем все ячейки этого заказа
    const [items] = await conn.query(
      'SELECT cell_id FROM order_items WHERE order_id = ? AND cell_id IS NOT NULL', [orderId]
    );
    for (const item of items) {
      await conn.query('UPDATE cells SET is_occupied = 0 WHERE cell_id = ?', [item.cell_id]);
    }

    await conn.query(
      'UPDATE orders SET status = "issued" WHERE order_id = ?', [orderId]
    );

    await conn.commit();
    req.session.flash = [{ type: 'success', message: 'Заказ выдан, ячейки освобождены' }];
    res.redirect('/orders');
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).send('Ошибка при выдаче заказа');
  } finally {
    conn.release();
  }
});

// POST /orders/:id/reject — отклонить заказ
router.post('/orders/:id/reject', requireManager, async (req, res) => {
  const orderId = req.params.id;
  try {
    await pool.query(
      'UPDATE orders SET status = "rejected", user_id = ? WHERE order_id = ?',
      [req.session.user.id, orderId]
    );
    req.session.flash = [{ type: 'error', message: 'Заказ отклонён' }];
    res.redirect('/orders');
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка отклонения заказа');
  }
});

module.exports = router;
