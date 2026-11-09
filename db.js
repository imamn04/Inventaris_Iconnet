const prisma = require('./src/config/prisma');

/**
 * Modernized db adapter using Prisma with PostgreSQL
 * Provides backward-compatible query() method for legacy callers
 */
async function query(text, params = []) {
  try {
    if (params && params.length > 0) {
      const rows = await prisma.$queryRawUnsafe(text, ...params);
      return { rows: Array.isArray(rows) ? rows : [], rowCount: Array.isArray(rows) ? rows.length : 1 };
    } else {
      const rows = await prisma.$queryRawUnsafe(text);
      return { rows: Array.isArray(rows) ? rows : [], rowCount: Array.isArray(rows) ? rows.length : 1 };
    }
  } catch (err) {
    console.error('[db query error]', err.message, 'Query:', text);
    throw err;
  }
}

module.exports = {
  prisma,
  query
};
