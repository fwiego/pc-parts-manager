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

// Метки статусов
const STATUS_LABELS = {
  pending:    '🕐 Ожидает обработки',
  processing: '⚙️ В обработке',
  ready:      '📦 Готов к выдаче',
  issued:     '✅ Выдан',
  rejected:   '❌ Отклонён'
};

// ─── ЮЗЕР: ДАШБОРД ───────────────────────────────────────────────────────────

router.get('/dashboard', requireUser, async (req, res) => {
  try {
    const { sort, category } = req.query;

    let query = 'SELECT component_id, name, manufacturer, model, category, price, quantity FROM components WHERE quantity > 0';
    const params = [];

    if (category) { query += ' AND category = ?'; params.push(category); }

    if (sort === 'price_asc')       query += ' ORDER BY price ASC';
    else if (sort === 'price_desc') query += ' ORDER BY price DESC';
    else                            query += ' ORDER BY category, name';

    const [components] = await pool.query(query, params);
    const [cats]       = await pool.query('SELECT DISTINCT category FROM components WHERE quantity > 0 ORDER BY category');

    res.render('dashboard', {
      title: 'Каталог комплектующих',
      components,
      categories:      cats.map(r => r.category),
      currentCategory: category || '',
      currentSort:     sort || '',
      user:            req.session.user
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка загрузки каталога');
  }
});

// ─── ЮЗЕР: СОЗДАНИЕ ЗАКАЗА ───────────────────────────────────────────────────

router.post('/orders/create', requireUser, async (req, res) => {
  let items;
  try { items = JSON.parse(req.body.items); } catch {
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

// ─── ЮЗЕР: МОИ ЗАКАЗЫ ────────────────────────────────────────────────────────

router.get('/orders/my', requireUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.order_id, o.order_date, o.status,
              oi.order_item_id, oi.quantity,
              c.name AS component_name, c.manufacturer, c.category,
              cl.cell_number
       FROM orders o
       JOIN order_items oi ON o.order_id       = oi.order_id
       JOIN components  c  ON oi.component_id  = c.component_id
       LEFT JOIN cells  cl ON oi.cell_id       = cl.cell_id
       WHERE o.client_id = ?
       ORDER BY o.order_date DESC, o.order_id`,
      [req.session.user.id]
    );

    // Нумерация заказов отдельно для каждого юзера
    const ordersMap = {};
    let userOrderIndex = 0;
    rows.forEach(row => {
      if (!ordersMap[row.order_id]) {
        userOrderIndex++;
        ordersMap[row.order_id] = {
          order_id:      row.order_id,
          user_order_num: userOrderIndex,
          order_date:    row.order_date,
          status:        row.status,
          status_label:  STATUS_LABELS[row.status] || row.status,
          items: []
        };
      }
      ordersMap[row.order_id].items.push({
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
      user:   req.session.user
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
              u.full_name      AS client_name,
              oi.order_item_id, oi.quantity,
              c.name           AS component_name, c.manufacturer, c.category, c.component_id,
              cl.cell_number,  cl.cell_id
       FROM orders o
       JOIN users       u  ON o.client_id     = u.user_id
       JOIN order_items oi ON o.order_id      = oi.order_id
       JOIN components  c  ON oi.component_id = c.component_id
       LEFT JOIN cells  cl ON oi.cell_id      = cl.cell_id
       ORDER BY FIELD(o.status,'pending','processing','ready','issued','rejected'), o.order_date DESC`
    );

    const ordersMap = {};
    rows.forEach(row => {
      if (!ordersMap[row.order_id]) {
        ordersMap[row.order_id] = {
          order_id:     row.order_id,
          order_date:   row.order_date,
          status:       row.status,
          status_label: STATUS_LABELS[row.status] || row.status,
          client_name:  row.client_name,
          items: []
        };
      }
      ordersMap[row.order_id].items.push({
        order_item_id:  row.order_item_id,
        component_id:   row.component_id,
        component_name: row.component_name,
        manufacturer:   row.manufacturer,
        category:       row.category,
        quantity:       row.quantity,
        cell_number:    row.cell_number,
        cell_id:        row.cell_id
      });
    });

    const [freeCells] = await pool.query(
      'SELECT cell_id, cell_number FROM cells WHERE is_occupied = 0 ORDER BY cell_number'
    );

    res.render('ordersManager', {
      title:    'Заказы пользователей',
      orders:   Object.values(ordersMap),
      freeCells,
      user:     req.session.user
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка загрузки заказов');
  }
});

// ─── МЕНЕДЖЕР: СМЕНА СТАТУСА ──────────────────────────────────────────────────

// POST /orders/:id/status — универсальная смена статуса
router.post('/orders/:id/status', requireManager, async (req, res) => {
  const orderId  = req.params.id;
  const { status, cells } = req.body; // cells = { order_item_id: cell_id, ... }

  const allowed = ['processing', 'ready', 'issued', 'rejected'];
  if (!allowed.includes(status)) return res.redirect('/orders');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // При статусе "ready" — назначаем ячейки каждой позиции
    if (status === 'ready' && cells) {
      for (const [itemId, cellId] of Object.entries(cells)) {
        if (!cellId) continue;
        await conn.query(
          'UPDATE order_items SET cell_id = ? WHERE order_item_id = ?',
          [cellId, itemId]
        );
        await conn.query(
          'UPDATE cells SET is_occupied = 1 WHERE cell_id = ?', [cellId]
        );
      }
    }

    // При статусе "issued" — освобождаем ячейки
    if (status === 'issued') {
      const [items] = await conn.query(
        'SELECT cell_id FROM order_items WHERE order_id = ? AND cell_id IS NOT NULL', [orderId]
      );
      for (const item of items) {
        await conn.query('UPDATE cells SET is_occupied = 0 WHERE cell_id = ?', [item.cell_id]);
      }
    }

    await conn.query(
      'UPDATE orders SET status = ?, user_id = ? WHERE order_id = ?',
      [status, req.session.user.id, orderId]
    );

    await conn.commit();
    req.session.flash = [{ type: 'success', message: `Статус заказа #${orderId} обновлён: ${STATUS_LABELS[status]}` }];
    res.redirect('/orders');
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).send('Ошибка обновления статуса');
  } finally {
    conn.release();
  }
});

// ─── МЕНЕДЖЕР: СОЗДАТЬ ТРАНЗАКЦИЮ ПО ЗАКАЗУ ──────────────────────────────────

router.post('/orders/:id/transaction', requireManager, async (req, res) => {
  const orderId = req.params.id;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Берём позиции заказа
    const [items] = await conn.query(
      `SELECT oi.component_id, oi.quantity
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.order_id
       WHERE oi.order_id = ?`, [orderId]
    );

    if (items.length === 0) {
      req.session.flash = [{ type: 'error', message: 'Позиции заказа не найдены' }];
      return res.redirect('/orders');
    }

    // Создаём транзакцию для каждой позиции
    for (const item of items) {
      await conn.query(
        'INSERT INTO transactions (user_id, component_id, type, quantity, date) VALUES (?, ?, "return", ?, NOW())',
        [req.session.user.id, item.component_id, item.quantity]
      );
    }

    await conn.commit();
    req.session.flash = [{ type: 'success', message: `Транзакция по заказу #${orderId} создана` }];
    res.redirect('/orders');
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).send('Ошибка создания транзакции');
  } finally {
    conn.release();
  }
});

module.exports = router;