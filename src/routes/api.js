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
  assignCubicleSchema,
  cubiclePositionsBulkSchema,
  handoverSchema
} = require('../validators');

const authController = require('../controllers/authController');
const inventoryController = require('../controllers/inventoryController');
const cubicleController = require('../controllers/cubicleController');
const handoverController = require('../controllers/handoverController');
const historyController = require('../controllers/historyController');
const statsController = require('../controllers/statsController');

// Auth
router.post('/login', loginLimiter, validate(loginSchema), authController.login);

// Inventory
router.get('/inventory', inventoryController.getAll);
router.post('/inventory', validate(inventoryItemSchema), inventoryController.create);
router.put('/inventory/:id', validate(inventoryUpdateSchema), inventoryController.update);
router.delete('/inventory/:id', inventoryController.remove);
router.post('/inventory/check', validate(checkInventorySchema), inventoryController.checkItem);
router.post('/inventory/reset-checklist', inventoryController.resetChecklist);
router.post('/inventory/bulk-delete', validate(bulkDeleteSchema), inventoryController.bulkDelete);
router.post('/inventory/import', inventoryController.importItems);
router.post('/inventory/assign-cubicle', validate(assignCubicleSchema), inventoryController.assignCubicle);

// Stats
router.get('/stats', statsController.getStats);

// Cubicle & Mapping
router.get('/cubicle-positions', cubicleController.getAll);
router.post('/cubicle-positions', validate(cubiclePositionsBulkSchema), cubicleController.savePositions);

// History
router.get('/history', historyController.getAll);
router.post('/history/bulk-delete', validate(bulkDeleteSchema), historyController.bulkDelete);

// Handover
router.get('/handover', handoverController.getAll);
router.post('/handover', validate(handoverSchema), handoverController.create);
router.post('/handover/bulk-delete', validate(bulkDeleteSchema), handoverController.bulkDelete);

module.exports = router;

