const prisma = require('../config/prisma');

async function logHistory(action, item = {}, details = '') {
  try {
    await prisma.history.create({
      data: {
        action: action || 'ACTION',
        itemId: item.id || null,
        itemName: item.name || null,
        itemMerk: item.merk || null,
        itemSn: item.sn || null,
        itemLokasi: item.lokasi || null,
        details: details || '',
        timestamp: new Date()
      }
    });
  } catch (err) {
    console.error('[History Service] Error logging history:', err.message);
  }
}

async function getAllHistory() {
  const list = await prisma.history.findMany({
    orderBy: { timestamp: 'desc' }
  });

  return list.map(row => ({
    id: row.id,
    action: row.action,
    itemId: row.itemId,
    itemName: row.itemName,
    itemMerk: row.itemMerk,
    itemSn: row.itemSn,
    itemLokasi: row.itemLokasi,
    details: row.details,
    timestamp: row.timestamp
  }));
}

async function bulkDeleteHistory(ids) {
  const numericIds = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
  if (numericIds.length === 0) return { count: 0 };

  const result = await prisma.history.deleteMany({
    where: {
      id: { in: numericIds }
    }
  });

  return { count: result.count };
}

module.exports = {
  logHistory,
  getAllHistory,
  bulkDeleteHistory
};

