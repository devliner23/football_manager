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
router.post('/simulate-next-game', leagueController.simulateNextGame);
router.post('/:savedGameId/simulate-week', leagueController.simulateWeek);
router.post('/:savedGameId/league/simulate-next-game', leagueController.simulateNextGame);

router.get('/saved-games/:savedGameId/league/archetypes', 
  authMiddleware, 
  leagueController.getArchetypes
);

// routes/leagueRoutes.js

// Get all games for a saved game
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

// Get recent games (last N)
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

// Get single game details with box scores
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

// Helper function
async function getCurrentSeasonId(savedGameId) {
  const { data, error } = await supabaseAdmin
    .from('saved_games')
    .select('game_state')
    .eq('id', savedGameId)
    .single();
  
  if (error) throw error;
  return data.game_state?.season_id;
}

// Initialize league with archetypes
router.post('/saved-games/:savedGameId/league/initialize', 
  authMiddleware, 
  leagueController.initializeLeague
);

module.exports = router;