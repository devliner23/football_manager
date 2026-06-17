const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');
const authMiddleware = require('../middleware/auth');

// All game routes require authentication
router.use(authMiddleware);

// Game CRUD
router.post('/', gameController.createGame);
router.get('/:id', gameController.getGame);
router.put('/:id', gameController.updateGame);
router.delete('/:id', gameController.deleteGame);

// Game simulation and logs
router.post('/:id/simulate', gameController.simulateGame);
router.get('/:id/logs', gameController.getGameLogs);

module.exports = router;