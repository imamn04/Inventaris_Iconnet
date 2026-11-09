const prisma = require('./src/config/prisma');

/**
 * Modernized db adapter using Prisma with MySQL
 * Provides backward-compatible query() method for legacy callers
 */
async function query(text, params = []) {
  try {
    // If it's a parameterized query with $1, $2, replace with ? for MySQL if raw query is used
    let mysqlQuery = text;
    if (params && params.length > 0) {
      mysqlQuery = text.replace(/\$(\d+)/g, '?');
      const rows = await prisma.$queryRawUnsafe(mysqlQuery, ...params);
      return { rows: Array.isArray(rows) ? rows : [], rowCount: Array.isArray(rows) ? rows.length : 1 };
    } else {
      const rows = await prisma.$queryRawUnsafe(mysqlQuery);
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
