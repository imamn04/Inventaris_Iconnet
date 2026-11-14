const { verifyToken } = require('../utils/token');

/**
 * Middleware Autentikasi REST API
 * Memverifikasi Bearer Token pada Header Authorization atau Query Parameter token
 */
function authenticate(req, res, next) {
  let token = null;

  // 1. Periksa Authorization Header: "Bearer <token>" atau x-access-token
  const authHeader = req.headers['authorization'] || req.headers['x-access-token'];
  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else {
      token = authHeader.trim();
    }
  }

  // 2. Periksa query parameter ?token=... (mendukung pembukaan PDF BAST langsung di tab baru browser)
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Akses ditolak: Token autentikasi tidak ditemukan. Silakan login kembali.'
    });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({
      success: false,
      message: 'Akses ditolak: Token tidak valid atau sesi telah kedaluwarsa. Silakan login kembali.'
    });
  }

  req.user = decoded;
  next();
}

module.exports = {
  authenticate
};

