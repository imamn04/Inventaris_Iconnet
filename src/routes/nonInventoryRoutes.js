const express = require('express');
const router = express.Router();
const nonInventoryService = require('../services/nonInventoryService');

router.get('/', async (req, res) => {
  try {
    const items = await nonInventoryService.getAllNonInventory();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/logs', async (req, res) => {
  try {
    const logs = await nonInventoryService.getMutationLogs();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const item = await nonInventoryService.createNonInventory(req.body);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const item = await nonInventoryService.updateNonInventory(req.params.id, req.body);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/adjust', async (req, res) => {
  try {
    const { type, amount, reason, operator } = req.body;
    const item = await nonInventoryService.adjustStock(req.params.id, type, amount, reason, operator);
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await nonInventoryService.deleteNonInventory(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

