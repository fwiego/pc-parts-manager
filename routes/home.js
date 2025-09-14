const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  res.render('home', { 
    username: req.session.user.username,
    role: req.session.user.role
  });
});
