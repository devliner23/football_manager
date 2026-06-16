const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/:saved_game_id/:team_id/stats', teamController.getTeamStats);
router.get('/:saved_game_id/:team_id/games', teamController.getTeamRecentGames);

module.exports = router;