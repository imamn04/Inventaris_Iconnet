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

async function bulkDelete(req, res, next) {
  try {
    const { ids } = req.body;
    const result = await handoverService.bulkDeleteHandover(ids || []);
    res.json({ success: true, count: result.count });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAll,
  create,
  bulkDelete
};

