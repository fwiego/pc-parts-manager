const bcrypt = require('bcrypt');

async function createAdmin() {
  const hashedPassword = await bcrypt.hash('admin', 10); // задаём пароль
  console.log(hashedPassword);
}

createAdmin();
