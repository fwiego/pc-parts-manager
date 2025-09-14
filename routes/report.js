const express = require('express');
const pool = require('../db');
const router = express.Router();

const categoryNames = {
  RAM: "Оперативная память",
  CPU: "Процессоры",
  GPU: "Видеокарты",
  HDD: "Жёсткие диски",
  SSD: "SSD-накопители"
};


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

  res.render('report', { title: 'Сформировать отчет', categories, categoryNames, user: req.session.user });
});

// Обработка формы отчета
router.post('/report', async (req, res) => {
  if (!req.session.user || req.session.user.role_id !== 1) return res.send('Доступ запрещён');

  const { component_id, type, quantity } = req.body;
  const userId = req.session.user.id;

  try {
    await pool.query(
      `INSERT INTO transactions (user_id, component_id, type, quantity, date) 
   VALUES (?, ?, ?, ?, NOW())`,
  [userId, component_id, type, quantity]
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

// Просмотр всех отчётов менеджеров (только для admin)
router.get('/manager-reports', async (req, res) => {
  if (!req.session.user || Number(req.session.user.role_id) !== 0) {
    return res.redirect('/login'); // доступ только для админа
  }

  try {
    const [rows] = await pool.query(
      `SELECT t.transaction_id, c.name AS component, c.manufacturer, 
              t.type, t.date, u.full_name AS manager
       FROM transactions t
       JOIN components c ON t.component_id = c.component_id
       JOIN users u ON t.user_id = u.user_id
       WHERE u.role_id = 1
       ORDER BY t.date DESC`
    );

    res.render('manager-reports', {
      title: 'Отчёты менеджеров',
      reports: rows,
      user: req.session.user
    });
  } catch (err) {
    console.error(err);
    res.send('Ошибка при загрузке отчётов менеджеров!');
  }
});


module.exports = router;
