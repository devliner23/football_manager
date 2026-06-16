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
      
      const { data: profile, error } = await supabase
        .from('profiles')
        .update({
          username,
          avatar_url,
          preferred_team_id,
          updated_at: new Date()
        })
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
  }
};

module.exports = userController;