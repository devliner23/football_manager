const express          = require('express');
const router           = express.Router();
const leagueController = require('../controllers/leagueController');
const authMiddleware = require('../middleware/auth'); // adjust to your middleware path

router.use(authMiddleware); 

router.post('/:savedGameId/initialize',            leagueController.initializeLeague);

router.get ('/:savedGameId/teams',                 leagueController.getTeams);
router.get ('/:savedGameId/players',               leagueController.getPlayers);
router.get ('/:savedGameId/standings',             leagueController.getStandings);
router.get ('/:savedGameId/schedule',              leagueController.getSchedule);
router.get('/:savedGameId/games/recent',           leagueController.getRecentGames);
// router.get('/:savedGameId/games/recent-days', leagueController.getRecentDaysGames);
router.get ('/:savedGameId/leaders/:stat',         leagueController.getLeagueLeaders);
router.get ('/:savedGameId/players/:playerId',     leagueController.getPlayerStats);

// ── New date-aware simulation routes ─────────────────────────────────────────
router.get ('/:savedGameId/next-user-game',        leagueController.getNextUserGame);
router.post('/:savedGameId/simulate-to-next-game', leagueController.simulateToNextGame);
router.post('/:savedGameId/simulate-to-date', leagueController.simulateToDate);
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:savedGameId/simulate-week',         leagueController.simulateWeek);
router.post('/:savedGameId/simulate-season',       leagueController.simulateSeason);
router.post('/:savedGameId/simulate-next-game',    leagueController.simulateNextGame);
router.post('/:savedGameId/trade',                 leagueController.tradePlayer);
router.get ('/:savedGameId/archetypes',            leagueController.getArchetypes);

router.get( '/:savedGameId/free-agents', leagueController.getFreeAgents);
router.post('/:savedGameId/free-agents/sign', leagueController.signFreeAgent);
router.post('/:savedGameId/players/:playerId/release', leagueController.releasePlayer);

router.post('/saved-games/:savedGameId/trades', leagueController.proposeTrade);
router.get('/saved-games/:savedGameId/trades', leagueController.getTrades);
router.get('/saved-games/:savedGameId/trades/:tradeId', leagueController.getTradeById);
router.post('/saved-games/:savedGameId/trades/:tradeId/accept', leagueController.acceptTrade);
router.post('/saved-games/:savedGameId/trades/:tradeId/reject', leagueController.rejectTrade);
router.delete('/saved-games/:savedGameId/trades/:tradeId', leagueController.cancelTrade);

router.get ('/:savedGameId/finance/teams',          leagueController.getTeamFinances);
router.get ('/:savedGameId/finance/teams/:teamId',  leagueController.getTeamFinanceDetail);
router.get ('/:savedGameId/finance/league-summary', leagueController.getLeagueFinanceSummary);

router.get('/:savedGameId/coach/:teamId', leagueController.getCoach);


module.exports = router;