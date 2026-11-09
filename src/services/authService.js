const prisma = require('../config/prisma');
const bcrypt = require('bcryptjs');

async function loginUser(username, password) {
  const user = await prisma.user.findUnique({
    where: { username }
  });

  if (!user) {
    return { success: false, message: 'Username atau password tidak valid' };
  }

  let isMatch = false;

  // Check if hash is bcrypt
  if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
    isMatch = await bcrypt.compare(password, user.password);
  } else {
    // Legacy plain text check & auto-upgrade
    if (user.password === password) {
      isMatch = true;
      const newHash = await bcrypt.hash(password, 10);
      await prisma.user.update({
        where: { id: user.id },
        data: { password: newHash }
      });
    }
  }

  if (!isMatch) {
    return { success: false, message: 'Username atau password tidak valid' };
  }

  return {
    success: true,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    }
  };
}

module.exports = {
  loginUser
};

