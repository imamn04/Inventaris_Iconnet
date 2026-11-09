const prisma = require('../config/prisma');
const { logHistory } = require('./historyService');

async function getAllCategories() {
  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' }
  });
  return categories;
}

async function createCategory(name) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('Nama kategori tidak boleh kosong');
  }

  // Check case-insensitive duplicate
  const existing = await prisma.category.findFirst({
    where: {
      name: {
        equals: trimmedName,
        mode: 'insensitive'
      }
    }
  });

  if (existing) {
    return existing;
  }

  const created = await prisma.category.create({
    data: { name: trimmedName }
  });

  await logHistory('CREATE', { id: `CAT-${created.id}`, name: created.name }, `Menambahkan kategori baru: ${created.name}`);
  return created;
}

async function deleteCategory(id) {
  const numId = parseInt(id, 10);
  const existing = await prisma.category.findUnique({ where: { id: numId } });
  if (!existing) return false;

  await prisma.category.delete({ where: { id: numId } });
  await logHistory('DELETE', { id: `CAT-${numId}`, name: existing.name }, `Menghapus kategori: ${existing.name}`);
  return true;
}

module.exports = {
  getAllCategories,
  createCategory,
  deleteCategory
};
