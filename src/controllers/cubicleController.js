const cubicleService = require('../services/cubicleService');

async function getAll(req, res, next) {
  try {
    const list = await cubicleService.getAllCubiclePositions();
    res.json(list);
  } catch (err) {
    next(err);
  }
}

async function savePositions(req, res, next) {
  try {
    const { positions } = req.body;
    await cubicleService.saveBulkCubiclePositions(positions || []);
    res.json({ success: true, message: 'Mapping layout saved successfully' });
  } catch (err) {
    next(err);
  }
}

async function addLocation(req, res, next) {
  try {
    const { name, type } = req.body;
    const location = await cubicleService.addCustomLocation(name, type || 'cubicle');
    res.json({
      success: true,
      message: `Lokasi "${location.cubicle_id}" berhasil didaftarkan`,
      location
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAll,
  savePositions,
  addLocation
};

