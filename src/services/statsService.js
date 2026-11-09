const prisma = require('../config/prisma');

async function getStats() {
  const total = await prisma.inventory.count();

  const countByKeyword = async (keyword) => {
    return prisma.inventory.count({
      where: {
        name: {
          contains: keyword
        }
      }
    });
  };

  const [monitors, keyboards, mice, headsets, laptops, pcs, tvs] = await Promise.all([
    countByKeyword('monitor'),
    countByKeyword('keyboard'),
    countByKeyword('mouse'),
    countByKeyword('headset'),
    countByKeyword('laptop'),
    countByKeyword('pc'),
    countByKeyword('tv')
  ]);

  return {
    total,
    monitors,
    keyboards,
    mice,
    headsets,
    laptops,
    pcs,
    tvs
  };
}

module.exports = {
  getStats
};

