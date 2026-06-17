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
router.get('/:savedGameId/teams', leagueController.getTeams);
router.get('/:savedGameId/players', leagueController.getPlayers);
router.post('/:savedGameId/trade', leagueController.tradePlayer);

router.get('/saved-games/:savedGameId/league/archetypes', 
  authMiddleware, 
  leagueController.getArchetypes
);

// Initialize league with archetypes
router.post('/saved-games/:savedGameId/league/initialize', 
  authMiddleware, 
  leagueController.initializeLeague
);

module.exports = router;