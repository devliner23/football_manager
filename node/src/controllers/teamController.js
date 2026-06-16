const { supabase } = require('../config/supabase');

const teamController = {
  // Get team statistics
  async getTeamStats(req, res, next) {
    try {
      const { saved_game_id, team_id } = req.params;
      
      const { data: stats, error } = await supabase
        .from('team_performance_summary')
        .select('*')
        .eq('saved_game_id', saved_game_id)
        .eq('team_id', team_id);
      
      if (error) throw error;
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      next(error);
    }
  },
  
  // Get recent games for a team
  async getTeamRecentGames(req, res, next) {
    try {
      const { saved_game_id, team_id } = req.params;
      const { limit = 10 } = req.query;
      
      const { data: games, error } = await supabase
        .from('game_logs')
        .select('*')
        .eq('saved_game_id', saved_game_id)
        .or(`home_team_id.eq.${team_id},away_team_id.eq.${team_id}`)
        .order('game_date', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      
      res.json({
        success: true,
        data: games
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = teamController;