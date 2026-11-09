const prisma = require('../config/prisma');

async function getAllCubiclePositions() {
  const list = await prisma.cubiclePosition.findMany({
    orderBy: { cubicleId: 'asc' }
  });

  return list.map(c => ({
    cubicle_id: c.cubicleId,
    x: c.x,
    y: c.y,
    type: c.type || 'cubicle',
    text: c.text || null
  }));
}

async function saveBulkCubiclePositions(positions) {
  // Use transaction to replace all positions cleanly
  await prisma.$transaction(async (tx) => {
    await tx.cubiclePosition.deleteMany({});
    if (positions.length > 0) {
      await tx.cubiclePosition.createMany({
        data: positions.map(pos => ({
          cubicleId: pos.cubicle_id,
          x: pos.x || 0,
          y: pos.y || 0,
          type: pos.type || 'cubicle',
          text: pos.text || null
        }))
      });
    }
  });

  return true;
}

module.exports = {
  getAllCubiclePositions,
  saveBulkCubiclePositions
};

