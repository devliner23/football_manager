const { supabase } = require('../config/supabase');

const userController = {
  // Get user profile
  async getProfile(req, res, next) {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', req.user.id)
        .single();
      
      if (error) throw error;
      
      res.json({
        success: true,
        data: profile
      });
    } catch (error) {
      next(error);
    }
  },
  
  // Update user profile
  async updateProfile(req, res, next) {
    try {
      const { username, avatar_url, preferred_team_id } = req.body;
      
      const updateData = {
        updated_at: new Date()
      };
      
      if (username) updateData.username = username;
      if (avatar_url) updateData.avatar_url = avatar_url;
      if (preferred_team_id) updateData.preferred_team_id = preferred_team_id;
      
      const { data: profile, error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', req.user.id)
        .select()
        .single();
      
      if (error) throw error;
      
      res.json({
        success: true,
        data: profile,
        message: 'Profile updated successfully'
      });
    } catch (error) {
      next(error);
    }
  },
  
  // Get user's saved games
  async getSavedGames(req, res, next) {
    try {
      const { data: games, error } = await supabase
        .from('saved_games')
        .select('*')
        .eq('user_id', req.user.id)
        .order('last_played', { ascending: false });
      
      if (error) throw error;
      
      res.json({
        success: true,
        data: games,
        count: games.length
      });
    } catch (error) {
      next(error);
    }
  },
  
  // Get a specific saved game with all related data
  async getGameWithData(req, res, next) {
    try {
      const { gameId } = req.params;
      
      // Get the game
      const { data: game, error: gameError } = await supabase
        .from('saved_games')
        .select('*')
        .eq('id', gameId)
        .eq('user_id', req.user.id)
        .single();
      
      if (gameError) throw gameError;
      if (!game) return res.status(404).json({ error: 'Game not found' });
      
      // Get game logs
      const { data: gameLogs, error: logsError } = await supabase
        .from('game_logs')
        .select('*')
        .eq('saved_game_id', gameId)
        .order('game_date', { ascending: false })
        .limit(20);
      
      if (logsError) throw logsError;
      
      // Get league history
      const { data: leagueHistory, error: historyError } = await supabase
        .from('league_history')
        .select('*')
        .eq('saved_game_id', gameId)
        .order('season', { ascending: false });
      
      if (historyError) throw historyError;
      
      // Update last_played
      await supabase
        .from('saved_games')
        .update({ last_played: new Date() })
        .eq('id', gameId);
      
      res.json({
        success: true,
        data: {
          game,
          gameLogs,
          leagueHistory
        }
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = userController;