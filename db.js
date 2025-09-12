const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

// Настройки подключения из .env
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pc_components_db'
});


module.exports = pool;
