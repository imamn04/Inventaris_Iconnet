const handoverService = require('../services/handoverService');

async function getAll(req, res, next) {
  try {
    const list = await handoverService.getAllHandover();
    res.json(list);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    await handoverService.createHandover(req.body);
    res.json({ success: true, message: 'Serah terima berhasil disimpan' });
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const item = await handoverService.getHandoverById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Data serah terima tidak ditemukan' });
    res.json(item);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const updated = await handoverService.updateHandover(req.params.id, req.body);
    res.json({ success: true, message: 'Data serah terima berhasil diperbarui', data: updated });
  } catch (err) {
    next(err);
  }
}

async function bulkDelete(req, res, next) {
  try {
    const { ids } = req.body;
    const result = await handoverService.bulkDeleteHandover(ids || []);
    res.json({ success: true, count: result.count });
  } catch (err) {
    next(err);
  }
}

async function syncLocations(req, res, next) {
  try {
    const result = await handoverService.syncAllHandoverLocations();
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAll,
  getById,
  create,
  update,
  bulkDelete,
  syncLocations
};

