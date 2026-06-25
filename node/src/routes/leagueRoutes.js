// ── ADD THESE TWO ROUTES to your existing league routes file ─────────────────
//
// Place them alongside the other leagueController routes.
// The order matters: put them BEFORE any wildcard or :param routes
// that could shadow "next-user-game" or "simulate-to-next-game".
//
// Example of where they fit in an Express router:
//
//   router.get ('/:savedGameId/teams',                    leagueController.getTeams);
//   router.get ('/:savedGameId/players',                  leagueController.getPlayers);
//   router.get ('/:savedGameId/standings',                leagueController.getStandings);
//   router.get ('/:savedGameId/schedule',                 leagueController.getSchedule);
//
//   ← ADD BELOW ─────────────────────────────────────────────────────────────
//
//   router.get ('/:savedGameId/next-user-game',           leagueController.getNextUserGame);
//   router.post('/:savedGameId/simulate-to-next-game',    leagueController.simulateToNextGame);
//
//   ← END ADD ───────────────────────────────────────────────────────────────
//
//   router.post('/:savedGameId/simulate-week',            leagueController.simulateWeek);
//   router.post('/:savedGameId/simulate-season',          leagueController.simulateSeason);
//   ...

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

module.exports = router;