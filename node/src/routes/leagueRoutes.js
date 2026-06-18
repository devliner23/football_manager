const express = require('express');
const router = express.Router();
const leagueController = require('../controllers/leagueController');
const authMiddleware = require('../middleware/auth');
const { supabaseAdmin } = require('../config/supabase');

// ---------- helper (must be defined before routes that use it) ----------
async function getCurrentSeasonId(savedGameId) {
  const { data, error } = await supabaseAdmin
    .from('saved_games')
    .select('game_state')
    .eq('id', savedGameId)
    .single();
  if (error) throw error;
  return data.game_state?.season_id;
}

router.use(authMiddleware);

router.post('/:savedGameId/initialize', leagueController.initializeLeague);
router.post('/:savedGameId/simulate-season', leagueController.simulateSeason);
router.post('/:savedGameId/simulate-week', leagueController.simulateWeek);

// ====================== Game routes (most specific first) ======================

// 1. Recent games (specific path segment)
router.get('/:savedGameId/games/recent', async (req, res) => {
  try {
    const { savedGameId } = req.params;
    const { limit = 10 } = req.query;

    const seasonId = await getCurrentSeasonId(savedGameId);

    const { data, error } = await supabaseAdmin
      .from('games')
      .select(`
        *,
        home_team:home_team_id(*),
        away_team:away_team_id(*)
      `)
      .eq('season_id', seasonId)
      .eq('status', 'final')
      .order('played_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Single game by ID (uses a UUID, so '/games/recent' won't match this)
router.get('/games/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;

    const { data: game, error: gameError } = await supabaseAdmin
      .from('games')
      .select(`
        *,
        home_team:home_team_id(*),
        away_team:away_team_id(*)
      `)
      .eq('id', gameId)
      .single();

    if (gameError) throw gameError;

    const { data: boxScores, error: boxError } = await supabaseAdmin
      .from('player_game_stats')
      .select(`
        *,
        player:player_id(*)
      `)
      .eq('game_id', gameId);

    if (boxError) throw boxError;

    res.json({
      success: true,
      data: { ...game, boxScores }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. All games (with optional limit)
router.get('/:savedGameId/games', async (req, res) => {
  try {
    const { savedGameId } = req.params;
    const { limit } = req.query;

    let query = supabaseAdmin
      .from('games')
      .select(`
        *,
        home_team:home_team_id(*),
        away_team:away_team_id(*)
      `)
      .eq('season_id', (await getCurrentSeasonId(savedGameId)))
      .order('played_at', { ascending: false });

    if (limit) query = query.limit(parseInt(limit));

    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// ====================== Standings & leaders ======================

router.get('/:savedGameId/standings', leagueController.getStandings);
router.get('/:savedGameId/leaders/:stat', leagueController.getLeagueLeaders);
router.get('/:savedGameId/schedule', leagueController.getSchedule);

// ====================== Team & player data ======================

router.get('/:savedGameId/teams', leagueController.getTeams);
router.get('/:savedGameId/players', leagueController.getPlayers);
router.get('/:savedGameId/players/:playerId', leagueController.getPlayerStats);

// ====================== Trades & archetypes ======================

router.post('/:savedGameId/trade', leagueController.tradePlayer);
router.get('/:savedGameId/archetypes', leagueController.getArchetypes);

router.get('/test', (req, res) => res.json({ ok: true }));


router.use((req, res) => {
  console.log('❌ Unmatched league route:', req.method, req.originalUrl);
  res.status(404).json({ error: 'Route not found' });
});

module.exports = router;