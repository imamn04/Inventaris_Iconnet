const express = require('express');
const router = express.Router();

const { validate } = require('../middlewares/validate');
const { loginLimiter } = require('../middlewares/security');
const {
  loginSchema,
  inventoryItemSchema,
  inventoryUpdateSchema,
  bulkDeleteSchema,
  checkInventorySchema,
  toggleChecklistSchema,
  assignCubicleSchema,
  categorySchema,
  cubiclePositionsBulkSchema,
  addLocationSchema,
  handoverSchema,
  batchInventorySchema
} = require('../validators');

const authController = require('../controllers/authController');
const inventoryController = require('../controllers/inventoryController');
const cubicleController = require('../controllers/cubicleController');
const handoverController = require('../controllers/handoverController');
const historyController = require('../controllers/historyController');
const statsController = require('../controllers/statsController');
const categoryController = require('../controllers/categoryController');
const nonInventoryRoutes = require('./nonInventoryRoutes');
const { generateBASTPDF } = require('../services/bastPdfService');
const prisma = require('../config/prisma');


const { authenticate } = require('../middlewares/auth');

// Auth (Public)
router.post('/login', loginLimiter, validate(loginSchema), authController.login);

// Token Verification
router.get('/auth/verify', authenticate, (req, res) => {
  res.json({ success: true, user: req.user });
});

// Proteksi seluruh endpoint API operasional dengan JWT Authenticate
router.use(authenticate);

// Categories
router.get('/categories', categoryController.getAll);
router.post('/categories', validate(categorySchema), categoryController.create);
router.delete('/categories/:id', categoryController.remove);

// Inventory
router.get('/inventory', inventoryController.getAll);
router.post('/inventory', validate(inventoryItemSchema), inventoryController.create);
router.post('/inventory/batch', validate(batchInventorySchema), inventoryController.createBatch);
router.put('/inventory/:id', validate(inventoryUpdateSchema), inventoryController.update);
router.delete('/inventory/:id', inventoryController.remove);
router.post('/inventory/check', validate(checkInventorySchema), inventoryController.checkItem);
router.post('/inventory/toggle-checklist', validate(toggleChecklistSchema), inventoryController.toggleChecklist);
router.post('/inventory/reset-checklist', inventoryController.resetChecklist);
router.post('/inventory/bulk-delete', validate(bulkDeleteSchema), inventoryController.bulkDelete);
router.post('/inventory/import', inventoryController.importItems);
router.post('/inventory/assign-cubicle', validate(assignCubicleSchema), inventoryController.assignCubicle);

// Stats
router.get('/stats', statsController.getStats);

// Cubicle & Mapping
router.get('/cubicle-positions', cubicleController.getAll);
router.post('/cubicle-positions', validate(cubiclePositionsBulkSchema), cubicleController.savePositions);
router.post('/cubicle-positions/add-location', validate(addLocationSchema), cubicleController.addLocation);
router.delete('/cubicle-positions/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.cubiclePosition.deleteMany({
      where: { cubicleId: id }
    });
    res.json({ success: true, message: `Kubikel ${id} berhasil dihapus permanen` });
  } catch (err) {
    next(err);
  }
});

// Non-Inventory
router.use('/non-inventory', nonInventoryRoutes);

// BAST PDF Export
router.get('/handover/:id/pdf', async (req, res) => {
  try {
    const handover = await prisma.handover.findUnique({
      where: { id: parseInt(req.params.id, 10) }
    });
    if (!handover) return res.status(404).json({ error: 'Berita acara tidak ditemukan' });
    generateBASTPDF(handover, res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// History
router.get('/history', historyController.getAll);
router.post('/history/bulk-delete', validate(bulkDeleteSchema), historyController.bulkDelete);

// Handover
router.get('/handover', handoverController.getAll);
router.get('/handover/:id', handoverController.getById);
router.post('/handover', validate(handoverSchema), handoverController.create);
router.post('/handover/sync-locations', handoverController.syncLocations);
router.put('/handover/:id', handoverController.update);
router.post('/handover/bulk-delete', validate(bulkDeleteSchema), handoverController.bulkDelete);

module.exports = router;

