const { supabaseAdmin } = require('../config/supabase'); // <-- ADD THIS IMPORT
const LeagueService = require('../services/LeagueService');

const leagueController = {
  // Initialize a new league
  async initializeLeague(req, res, next) {
    try {
      const { savedGameId } = req.params;
      const { season = 1 } = req.body; // <-- READ FROM BODY, NOT PARAMS

      // Verify game ownership using admin client (or regular client with user token)
      const { data: game, error: gameError } = await supabaseAdmin
        .from('saved_games')
        .select('*')
        .eq('id', savedGameId)
        .eq('user_id', req.user.id)
        .single();

      if (gameError || !game) {
        return res.status(404).json({ error: 'Game not found or unauthorized' });
      }

      const leagueService = new LeagueService(savedGameId);
      const result = await leagueService.initializeLeague(season);

      res.json({
        success: true,
        message: 'League initialized successfully',
        data: result
      });
    } catch (error) {
      console.error('League initialization error:', error);
      next(error);
    }
  },

  // Simulate a season
  async simulateSeason(req, res, next) {
    try {
      const { savedGameId } = req.params;

      const { data: game, error: gameError } = await supabaseAdmin
        .from('saved_games')
        .select('*')
        .eq('id', savedGameId)
        .eq('user_id', req.user.id)
        .single();

      if (gameError || !game) {
        return res.status(404).json({ error: 'Game not found or unauthorized' });
      }

      const leagueService = new LeagueService(savedGameId);
      const result = await leagueService.simulateSeason();

      await supabaseAdmin
        .from('saved_games')
        .update({
          current_season: game.current_season + 1,
          game_state: {
            ...game.game_state,
            last_simulated: new Date().toISOString(),
            season_complete: true
          },
          updated_at: new Date()
        })
        .eq('id', savedGameId);

      res.json({
        success: true,
        message: 'Season simulated successfully',
        data: result
      });
    } catch (error) {
      console.error('Season simulation error:', error);
      next(error);
    }
  },

  // Get league standings
  async getStandings(req, res, next) {
    try {
      const { savedGameId } = req.params;

      const { data: standings, error } = await supabaseAdmin
        .from('team_season_stats')
        .select('*')
        .eq('saved_game_id', savedGameId)
        .order('wins', { ascending: false });

      if (error) throw error;

      res.json({
        success: true,
        data: standings
      });
    } catch (error) {
      next(error);
    }
  },

  // Get league leaders
  async getLeagueLeaders(req, res, next) {
    try {
      const { savedGameId, stat } = req.params;

      const { data: players, error } = await supabaseAdmin
        .from('players')
        .select('*')
        .eq('saved_game_id', savedGameId)
        .order(stat, { ascending: false })
        .limit(10);

      if (error) throw error;

      res.json({
        success: true,
        data: players
      });
    } catch (error) {
      next(error);
    }
  },

  // Get player stats
  async getPlayerStats(req, res, next) {
    try {
      const { savedGameId, playerId } = req.params;

      const { data: player, error } = await supabaseAdmin
        .from('players')
        .select('*')
        .eq('saved_game_id', savedGameId)
        .eq('player_id', playerId)
        .single();

      if (error) throw error;

      res.json({
        success: true,
        data: player
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = leagueController;