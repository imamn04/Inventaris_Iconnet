const crypto = require('crypto');

// Menggunakan JWT_SECRET dari environment variable atau fallback server key yang kuat
const JWT_SECRET = process.env.JWT_SECRET || 'iconnet-enterprise-super-secure-jwt-secret-2026';

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return Buffer.from(str, 'base64').toString('utf8');
}

/**
 * Sign JWT Token menggunakan HMAC-SHA256 (Native Node.js Crypto)
 * @param {Object} payload Data pengguna yang disimpan dalam token
 * @param {number} expiresInSeconds Masa berlaku token (default: 7 hari = 604800 detik)
 * @returns {string} Token JWT
 */
function signToken(payload, expiresInSeconds = 604800) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const fullPayload = { ...payload, exp, iat: Math.floor(Date.now() / 1000) };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verifikasi keaslian dan masa berlaku token JWT
 * @param {string} token
 * @returns {Object|null} Payload jika valid, null jika invalid/expired
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  if (signature.length !== expectedSig.length) return null;
  const isValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
  if (!isValid) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return null; // Token kedaluwarsa
    }
    return payload;
  } catch (_) {
    return null;
  }
}

module.exports = {
  signToken,
  verifyToken
};

