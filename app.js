const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const session = require('express-session');

const authRoutes   = require('./routes/auth');
const usersRoutes  = require('./routes/users');
const reportRoutes = require('./routes/report');
const adminRoutes  = require('./routes/admin');
const ordersRoutes = require('./routes/orders');

const app = express();
const PORT = process.env.PORT || 3000;

// Handlebars
app.engine('handlebars', engine({
  helpers: {
    json: (context) => JSON.stringify(context),
    eq: (a, b) => a == b
  }
}));
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'supersecretkey',
  resave: false,
  saveUninitialized: false
}));
app.use(express.static(path.join(__dirname, 'public')));

// Flash-middleware: передаёт flash-сообщения в каждый шаблон и очищает их
app.use((req, res, next) => {
  res.locals.flash = req.session.flash || null;
  res.locals.user  = req.session.user  || null;
  delete req.session.flash;
  next();
});

// Роуты
app.use('/', authRoutes);
app.use('/', usersRoutes);
app.use('/', reportRoutes);
app.use('/', ordersRoutes);
app.use('/admin', adminRoutes);

// Главная страница
app.get('/', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('home', { title: 'PC Parts Manager', user: req.session.user });
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
