const inventoryService = require('../services/inventoryService');

async function getAll(req, res, next) {
  try {
    const items = await inventoryService.getAllInventory();
    res.json(items);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const item = await inventoryService.createInventoryItem(req.body);
    res.json({ success: true, item });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { id } = req.params;
    const item = await inventoryService.updateInventoryItem(id, req.body);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item tidak ditemukan' });
    }
    res.json({ success: true, item });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const { id } = req.params;
    const success = await inventoryService.deleteInventoryItem(id);
    if (!success) {
      return res.status(404).json({ success: false, message: 'Item tidak ditemukan' });
    }
    res.json({ success: true, message: 'Item berhasil dihapus' });
  } catch (err) {
    next(err);
  }
}

async function checkItem(req, res, next) {
  try {
    const { searchValue } = req.body;
    const result = await inventoryService.checkItemScan(searchValue);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function resetChecklist(req, res, next) {
  try {
    await inventoryService.resetAllChecklist();
    res.json({ success: true, message: 'Semua status checklist telah direset' });
  } catch (err) {
    next(err);
  }
}

async function bulkDelete(req, res, next) {
  try {
    const { ids } = req.body;
    const result = await inventoryService.bulkDeleteInventory(ids);
    res.json({ success: true, count: result.count });
  } catch (err) {
    next(err);
  }
}

async function importItems(req, res, next) {
  try {
    const { items } = req.body;
    const result = await inventoryService.importInventoryItems(items);
    res.json({ success: true, count: result.count });
  } catch (err) {
    next(err);
  }
}

async function assignCubicle(req, res, next) {
  try {
    const { item_id, cubicle_id } = req.body;
    const updated = await inventoryService.assignCubicle(item_id, cubicle_id);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Item tidak ditemukan' });
    }
    res.json({ success: true, message: `Item berhasil di-assign ke ${cubicle_id || 'Unassigned'}` });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAll,
  create,
  update,
  remove,
  checkItem,
  resetChecklist,
  bulkDelete,
  importItems,
  assignCubicle
};

