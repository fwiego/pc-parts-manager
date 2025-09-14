const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const session = require('express-session');

// Роуты
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const reportRoutes = require('./routes/report');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Настройка Handlebars
app.engine('handlebars', engine({
  helpers: {
    json: (context) => JSON.stringify(context),
    eq: (a, b) => a === b
  }
}));
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

// Миддлвары
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'supersecretkey',
  resave: false,
  saveUninitialized: true
}));

app.use(express.static(path.join(__dirname, 'public')));

// Подключение роутов
app.use('/', authRoutes);
app.use('/', usersRoutes);
app.use('/', reportRoutes);
app.use('/admin', adminRoutes);

// Главная страница
app.get('/', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('home', { title: 'PC Parts Manager', user: req.session.user });
});

// Запуск сервера
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
