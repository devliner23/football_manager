const { supabase, supabaseAdmin } = require('../config/supabase');
const gameService = require('../services/gameService');

const gameController = {
  // Create a new saved game
  async createGame(req, res, next) {
    try {
      const { name, managed_club_id, difficulty = 'pro' } = req.body;
      
      const gameData = {
        user_id: req.user.id,
        name,
        managed_club_id,
        difficulty,
        current_season: 1,
        current_game_date: new Date(),
        game_state: {
          season: 1,
          clubs: [],
          players: [],
          standings: {},
          settings: {
            difficulty,
            quarters: 4,
            quarter_length: 12
          }
        }
      };
      
      const { data: game, error } = await supabase
        .from('saved_games')
        .insert([gameData])
        .select()
        .single();
      
      if (error) throw error;
      
      // Create initial league history entry
      await supabase
        .from('league_history')
        .insert([{
          saved_game_id: game.id,
          season: 1,
          champion_id: '',
          champion_name: '',
          season_data: { initial: true }
        }]);
      
      res.status(201).json({
        success: true,
        data: game,
        message: 'Game created successfully'
      });
    } catch (error) {
      next(error);
    }
  },
  
  // Get game by ID
  async getGame(req, res, next) {
    try {
      const { id } = req.params;
      
      const { data: game, error } = await supabase
        .from('saved_games')
        .select('*')
        .eq('id', id)
        .eq('user_id', req.user.id)
        .single();
      
      if (error) throw error;
      if (!game) return res.status(404).json({ error: 'Game not found' });
      
      // Update last_played
      await supabase
        .from('saved_games')
        .update({ last_played: new Date() })
        .eq('id', id);
      
      res.json({
        success: true,
        data: game
      });
    } catch (error) {
      next(error);
    }
  },
  
  // Update game state
  async updateGame(req, res, next) {
    try {
      const { id } = req.params;
      const { game_state, current_season, current_game_date } = req.body;
      
      const updateData = {
        updated_at: new Date(),
        ...(game_state && { game_state }),
        ...(current_season && { current_season }),
        ...(current_game_date && { current_game_date })
      };
      
      const { data: game, error } = await supabase
        .from('saved_games')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', req.user.id)
        .select()
        .single();
      
      if (error) throw error;
      
      res.json({
        success: true,
        data: game,
        message: 'Game updated successfully'
      });
    } catch (error) {
      next(error);
    }
  },
  
  // Delete game
  async deleteGame(req, res, next) {
    try {
      const { id } = req.params;
      
      const { error } = await supabase
        .from('saved_games')
        .delete()
        .eq('id', id)
        .eq('user_id', req.user.id);
      
      if (error) throw error;
      
      res.json({
        success: true,
        message: 'Game deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  },
  
  // Simulate a game
  async simulateGame(req, res, next) {
    try {
      const { id } = req.params;
      const { home_team_id, away_team_id, competition } = req.body;
      
      const simulationResult = await gameService.simulateMatch(
        home_team_id,
        away_team_id,
        competition
      );
      
      // Save game log
      const { data: gameLog, error } = await supabase
        .from('game_logs')
        .insert([{
          saved_game_id: id,
          game_result: simulationResult,
          home_team_id,
          away_team_id,
          home_score: simulationResult.home_score,
          away_score: simulationResult.away_score,
          game_date: new Date(),
          competition
        }])
        .select()
        .single();
      
      if (error) throw error;
      
      res.json({
        success: true,
        data: {
          game_log: gameLog,
          simulation: simulationResult
        }
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = gameController;