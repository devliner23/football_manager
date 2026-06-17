const { supabase } = require('../config/supabase');

const teamController = {
  // Get team statistics
  async getTeamStats(req, res, next) {
    try {
      const { saved_game_id, team_id } = req.params;
      
      // Verify game ownership
      const { data: game, error: verifyError } = await supabase
        .from('saved_games')
        .select('id')
        .eq('id', saved_game_id)
        .eq('user_id', req.user.id)
        .single();
      
      if (verifyError || !game) {
        return res.status(404).json({ error: 'Game not found or unauthorized' });
      }
      
      // Get team stats from game_logs
      const { data: homeGames, error: homeError } = await supabase
        .from('game_logs')
        .select('*')
        .eq('saved_game_id', saved_game_id)
        .eq('home_team_id', team_id);
      
      if (homeError) throw homeError;
      
      const { data: awayGames, error: awayError } = await supabase
        .from('game_logs')
        .select('*')
        .eq('saved_game_id', saved_game_id)
        .eq('away_team_id', team_id);
      
      if (awayError) throw awayError;
      
      // Calculate stats
      const allGames = [...(homeGames || []), ...(awayGames || [])];
      
      let wins = 0;
      let losses = 0;
      let totalPoints = 0;
      let totalConceded = 0;
      
      allGames.forEach(game => {
        const isHome = game.home_team_id === team_id;
        const teamScore = isHome ? game.home_score : game.away_score;
        const opponentScore = isHome ? game.away_score : game.home_score;
        const won = teamScore > opponentScore;
        
        if (won) wins++;
        else losses++;
        
        totalPoints += teamScore;
        totalConceded += opponentScore;
      });
      
      const gamesPlayed = allGames.length;
      const winPercentage = gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : 0;
      const avgPoints = gamesPlayed > 0 ? totalPoints / gamesPlayed : 0;
      const avgConceded = gamesPlayed > 0 ? totalConceded / gamesPlayed : 0;
      
      res.json({
        success: true,
        data: {
          team_id,
          games_played: gamesPlayed,
          wins,
          losses,
          win_percentage: winPercentage,
          avg_points: avgPoints,
          avg_conceded: avgConceded,
          points_differential: avgPoints - avgConceded
        }
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
      
      // Verify game ownership
      const { data: game, error: verifyError } = await supabase
        .from('saved_games')
        .select('id')
        .eq('id', saved_game_id)
        .eq('user_id', req.user.id)
        .single();
      
      if (verifyError || !game) {
        return res.status(404).json({ error: 'Game not found or unauthorized' });
      }
      
      const { data: games, error } = await supabase
        .from('game_logs')
        .select('*')
        .eq('saved_game_id', saved_game_id)
        .or(`home_team_id.eq.${team_id},away_team_id.eq.${team_id}`)
        .order('game_date', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      
      // Add result info
      const enrichedGames = games.map(game => {
        const isHome = game.home_team_id === team_id;
        const teamScore = isHome ? game.home_score : game.away_score;
        const opponentScore = isHome ? game.away_score : game.home_score;
        const won = teamScore > opponentScore;
        
        return {
          ...game,
          team_result: won ? 'W' : 'L',
          team_score: teamScore,
          opponent_score: opponentScore,
          is_home: isHome
        };
      });
      
      res.json({
        success: true,
        data: enrichedGames,
        count: enrichedGames.length
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = teamController;