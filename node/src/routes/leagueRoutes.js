const express = require('express');
const router = express.Router();
const leagueController = require('../controllers/leagueController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// League management
router.post('/:savedGameId/initialize', leagueController.initializeLeague);
router.post('/:savedGameId/simulate-season', leagueController.simulateSeason);
router.get('/:savedGameId/standings', leagueController.getStandings);
router.get('/:savedGameId/leaders/:stat', leagueController.getLeagueLeaders);
router.get('/:savedGameId/players/:playerId', leagueController.getPlayerStats);

module.exports = router;