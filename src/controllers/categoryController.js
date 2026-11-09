const categoryService = require('../services/categoryService');

async function getAll(req, res, next) {
  try {
    const categories = await categoryService.getAllCategories();
    res.json({ success: true, categories });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { name } = req.body;
    const category = await categoryService.createCategory(name);
    res.json({ success: true, category });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const { id } = req.params;
    const success = await categoryService.deleteCategory(id);
    if (!success) {
      return res.status(404).json({ success: false, message: 'Kategori tidak ditemukan' });
    }
    res.json({ success: true, message: 'Kategori berhasil dihapus' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAll,
  create,
  remove
};

