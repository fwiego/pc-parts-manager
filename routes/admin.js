const express = require('express');
const router  = express.Router();
const pool    = require('../db');

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role_id !== 0) return res.redirect('/login');
  next();
}

// GET /admin/adminReports — просмотр отчётов
router.get('/adminReports', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT t.transaction_id AS id,
             t.type, t.quantity, t.date,
             u.full_name  AS manager,
             c.name       AS component_name,
             c.manufacturer
      FROM transactions t
      JOIN users      u ON t.user_id      = u.user_id
      JOIN components c ON t.component_id = c.component_id
      ORDER BY t.date DESC
    `);
    res.render('adminReports', { reports: rows, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка загрузки отчётов');
  }
});

// GET /admin/adminReports/export — выгрузка в CSV
router.get('/adminReports/export', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT t.transaction_id AS id,
             t.type, t.quantity,
             DATE_FORMAT(t.date, '%d.%m.%Y %H:%i') AS date,
             u.full_name  AS manager,
             c.name       AS component_name,
             c.manufacturer
      FROM transactions t
      JOIN users      u ON t.user_id      = u.user_id
      JOIN components c ON t.component_id = c.component_id
      ORDER BY t.date DESC
    `);

    const typeLabel = { issue: 'Поступление', return: 'Списание' };

    // Формируем CSV вручную
    const header = ['ID', 'Менеджер', 'Комплектующая', 'Производитель', 'Тип операции', 'Количество', 'Дата'];
    const csvRows = rows.map(r => [
      r.id,
      `"${r.manager}"`,
      `"${r.component_name}"`,
      `"${r.manufacturer}"`,
      typeLabel[r.type] || r.type,
      r.quantity,
      r.date
    ].join(';'));

    const csv = '\uFEFF' + [header.join(';'), ...csvRows].join('\r\n'); // BOM для корректного открытия в Excel

    const filename = `otchety_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка при экспорте');
  }
});

module.exports = router;
