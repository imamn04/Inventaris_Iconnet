const historyService = require('../services/historyService');

async function getAll(req, res, next) {
  try {
    const list = await historyService.getAllHistory();
    res.json(list);
  } catch (err) {
    next(err);
  }
}

async function bulkDelete(req, res, next) {
  try {
    const { ids } = req.body;
    const result = await historyService.bulkDeleteHistory(ids || []);
    res.json({ success: true, count: result.count });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAll,
  bulkDelete
};

