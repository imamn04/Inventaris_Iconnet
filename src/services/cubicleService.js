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
  // Use transaction to replace positions while preserving unplaced custom cubicles & rooms
  await prisma.$transaction(async (tx) => {
    const unplacedOrRooms = await tx.cubiclePosition.findMany({
      where: {
        OR: [
          { type: 'room' },
          { x: 0, y: 0 }
        ]
      }
    });

    const dedupMap = new Map();

    // 1. Add current positions from frontend (ensuring valid cubicleId and deduplication)
    for (const pos of (positions || [])) {
      const id = (pos.cubicle_id || pos.cubicleId || '').trim();
      if (!id) continue;
      dedupMap.set(id, {
        cubicleId: id,
        x: pos.x || 0,
        y: pos.y || 0,
        type: pos.type || 'cubicle',
        text: pos.text || id
      });
    }

    // 2. Preserve unplaced custom locations/rooms that were not part of the sent payload
    for (const item of unplacedOrRooms) {
      if (!dedupMap.has(item.cubicleId)) {
        dedupMap.set(item.cubicleId, {
          cubicleId: item.cubicleId,
          x: 0,
          y: 0,
          type: item.type || 'cubicle',
          text: item.text || item.cubicleId
        });
      }
    }

    await tx.cubiclePosition.deleteMany({});

    const allToInsert = Array.from(dedupMap.values());
    if (allToInsert.length > 0) {
      await tx.cubiclePosition.createMany({
        data: allToInsert
      });
    }
  });

  return true;
}

async function addCustomLocation(name, type = 'cubicle') {
  const cleanName = type === 'cubicle' ? name.trim().toUpperCase() : name.trim();
  const existing = await prisma.cubiclePosition.findUnique({
    where: { cubicleId: cleanName }
  });

  if (existing) {
    return {
      cubicle_id: existing.cubicleId,
      x: existing.x,
      y: existing.y,
      type: existing.type || type,
      text: existing.text || cleanName
    };
  }

  const created = await prisma.cubiclePosition.create({
    data: {
      cubicleId: cleanName,
      x: 0,
      y: 0,
      type: type || 'cubicle',
      text: cleanName
    }
  });

  return {
    cubicle_id: created.cubicleId,
    x: created.x,
    y: created.y,
    type: created.type,
    text: created.text
  };
}

module.exports = {
  getAllCubiclePositions,
  saveBulkCubiclePositions,
  addCustomLocation
};

