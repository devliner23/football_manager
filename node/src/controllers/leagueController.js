// controllers/leagueController.js
const { supabaseAdmin } = require('../config/supabase');
const LeagueService = require('../services/leagueService');

// Columns on `players` that are safe to sort by - validates the :stat
// route param before it ever reaches a query, since it comes straight
// from the URL.
const SORTABLE_PLAYER_COLUMNS = new Set([
  'overall_rating', 'potential_rating', 'age', 'height', 'weight',
  'points', 'rebounds', 'assists',
]);

async function loadOwnedGame(savedGameId, userId) {
  const { data: game, error } = await supabaseAdmin
    .from('saved_games')
    .select('*')
    .eq('id', savedGameId)
    .eq('user_id', userId)
    .single();

  if (error || !game) return null;
  return game;
}

const leagueController = {
  // POST /saved-games/:savedGameId/league/initialize
  async initializeLeague(req, res, next) {
    try {
      const { savedGameId } = req.params;
      const { season = 1 } = req.body;

      const game = await loadOwnedGame(savedGameId, req.user.id);
      if (!game) return res.status(404).json({ error: 'Game not found or unauthorized' });

      const leagueService = new LeagueService(savedGameId);
      const result = await leagueService.initializeLeague(season);

      res.json({ success: true, message: 'League initialized successfully', data: result });
    } catch (error) {
      if (error.message.includes('already initialized')) {
        return res.status(409).json({ error: error.message });
      }
      console.error('League initialization error:', error);
      next(error);
    }
  },

  // POST /saved-games/:savedGameId/league/simulate-season
  async simulateSeason(req, res, next) {
    try {
      const { savedGameId } = req.params;

      const game = await loadOwnedGame(savedGameId, req.user.id);
      if (!game) return res.status(404).json({ error: 'Game not found or unauthorized' });

      const leagueService = new LeagueService(savedGameId);
      const result = await leagueService.simulateSeason();

      await supabaseAdmin
        .from('saved_games')
        .update({
          current_season: game.current_season + 1,
          game_state: {
            ...game.game_state,
            last_simulated: new Date().toISOString(),
            season_complete: true,
          },
          updated_at: new Date(),
        })
        .eq('id', savedGameId);

      res.json({ success: true, message: 'Season simulated successfully', data: result });
    } catch (error) {
      if (error.message.includes('not implemented')) {
        return res.status(501).json({ error: 'Season simulation is not built yet' });
      }
      console.error('Season simulation error:', error);
      next(error);
    }
  },

  async getTeams(req, res, next) {
    try {
        const { savedGameId } = req.params;
        const { data, error } = await supabaseAdmin
        .from('teams')
        .select('*')
        .eq('saved_game_id', savedGameId);
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
    },

    // GET /saved-games/:savedGameId/players
  async getPlayers(req, res, next) {
    try {
        const { savedGameId } = req.params;
        const { data, error } = await supabaseAdmin
        .from('players')
        .select('*')
        .eq('saved_game_id', savedGameId);
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
  },

  // GET /saved-games/:savedGameId/league/standings
  async getStandings(req, res, next) {
    try {
      const { savedGameId } = req.params;

      const { data: standings, error } = await supabaseAdmin
        .from('team_season_stats')
        .select('*')
        .eq('saved_game_id', savedGameId)
        .order('wins', { ascending: false });

      if (error) throw error;

      res.json({ success: true, data: standings });
    } catch (error) {
      next(error);
    }
  },

  // GET /saved-games/:savedGameId/league/leaders/:stat
  // Ranks players by a rating/attribute column. True box-score leaders
  // (points per game, etc.) need simulateSeason() to exist first - this
  // ranks current talent, not produced stats.
  async getLeagueLeaders(req, res, next) {
    try {
      const { savedGameId, stat } = req.params;

      if (!SORTABLE_PLAYER_COLUMNS.has(stat)) {
        return res.status(400).json({ error: `Unknown stat "${stat}"` });
      }

      const { data: players, error } = await supabaseAdmin
        .from('players')
        .select('*')
        .eq('saved_game_id', savedGameId)
        .order(stat, { ascending: false })
        .limit(10);

      if (error) throw error;

      res.json({ success: true, data: players });
    } catch (error) {
      next(error);
    }
  },

  // GET /saved-games/:savedGameId/league/players/:playerId
  async getPlayerStats(req, res, next) {
    try {
      const { savedGameId, playerId } = req.params;

      const { data: player, error } = await supabaseAdmin
        .from('players')
        .select('*')
        .eq('saved_game_id', savedGameId)
        .eq('id', playerId)
        .single();

      if (error) throw error;

      res.json({ success: true, data: player });
    } catch (error) {
      next(error);
    }
  },

  // POST /saved-games/:savedGameId/league/trade
  // body: { playerId, newTeamId }
  async tradePlayer(req, res, next) {
    try {
      const { savedGameId } = req.params;
      const { playerId, newTeamId } = req.body;

      if (!playerId || !newTeamId) {
        return res.status(400).json({ error: 'playerId and newTeamId are required' });
      }

      const game = await loadOwnedGame(savedGameId, req.user.id);
      if (!game) return res.status(404).json({ error: 'Game not found or unauthorized' });

      const leagueService = new LeagueService(savedGameId);
      const player = await leagueService.tradePlayer(playerId, newTeamId);

      res.json({ success: true, message: 'Trade completed', data: player });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = leagueController;