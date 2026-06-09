const express = require('express');
const router = express.Router();
const mlService = require('../services/ml.service');

router.get('/model-metrics', async (req, res) => {
  try {
    const result = await mlService.getModelMetrics();
    res.json(result);
  } catch (error) {
    console.error('AI model metrics error:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/topic-mastery/:handle', async (req, res) => {
  try {
    const result = await mlService.getTopicMastery(req.params.handle);
    res.json(result);
  } catch (error) {
    console.error('AI topic mastery error:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/recommendations/:handle', async (req, res) => {
  try {
    const limit = Number.parseInt(req.query.limit || '20', 10);
    const result = await mlService.getRecommendations(req.params.handle, limit);
    res.json(result);
  } catch (error) {
    console.error('AI recommendations error:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

module.exports = router;
