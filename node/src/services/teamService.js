const teamService = {
  // Calculate team rating based on roster
  calculateTeamRating(team) {
    let totalRating = 0;
    let playerCount = 0;
    
    if (team.players && team.players.length > 0) {
      team.players.forEach(player => {
        totalRating += player.rating || 75;
        playerCount++;
      });
    }
    
    return playerCount > 0 ? totalRating / playerCount : 75;
  },
  
  // Generate team statistics
  generateTeamStats(gameLogs, teamId) {
    const stats = {
      wins: 0,
      losses: 0,
      pointsScored: 0,
      pointsConceded: 0,
      games: 0
    };
    
    gameLogs.forEach(log => {
      const isHome = log.home_team_id === teamId;
      const teamScore = isHome ? log.home_score : log.away_score;
      const opponentScore = isHome ? log.away_score : log.home_score;
      const won = teamScore > opponentScore;
      
      if (won) stats.wins++;
      else stats.losses++;
      
      stats.pointsScored += teamScore;
      stats.pointsConceded += opponentScore;
      stats.games++;
    });
    
    if (stats.games > 0) {
      stats.avgPointsScored = stats.pointsScored / stats.games;
      stats.avgPointsConceded = stats.pointsConceded / stats.games;
      stats.winPercentage = stats.wins / stats.games;
    }
    
    return stats;
  }
};

module.exports = teamService;