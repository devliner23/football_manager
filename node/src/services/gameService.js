const gameService = {
  // Simulate a single match
  async simulateMatch(homeTeamId, awayTeamId, competition) {
    // Basic simulation logic
    const homeStrength = Math.random() * 100;
    const awayStrength = Math.random() * 100;
    const homeAdvantage = 1.1;
    
    let homeScore = Math.floor(homeStrength * homeAdvantage);
    let awayScore = Math.floor(awayStrength);
    
    // Ensure scores are reasonable (basketball scores 60-140)
    homeScore = Math.max(60, Math.min(140, homeScore + 60));
    awayScore = Math.max(60, Math.min(140, awayScore + 60));
    
    // Generate some stats
    const stats = {
      home_score: homeScore,
      away_score: awayScore,
      winner: homeScore > awayScore ? homeTeamId : awayTeamId,
      home_stats: {
        points: homeScore,
        rebounds: Math.floor(Math.random() * 50) + 20,
        assists: Math.floor(Math.random() * 30) + 10,
        steals: Math.floor(Math.random() * 15),
        blocks: Math.floor(Math.random() * 10),
        turnovers: Math.floor(Math.random() * 20) + 5,
        fouls: Math.floor(Math.random() * 25) + 10
      },
      away_stats: {
        points: awayScore,
        rebounds: Math.floor(Math.random() * 50) + 20,
        assists: Math.floor(Math.random() * 30) + 10,
        steals: Math.floor(Math.random() * 15),
        blocks: Math.floor(Math.random() * 10),
        turnovers: Math.floor(Math.random() * 20) + 5,
        fouls: Math.floor(Math.random() * 25) + 10
      }
    };
    
    return stats;
  },
  
  // Simulate entire season
  async simulateSeason(gameState) {
    // This will be implemented later
    return gameState;
  }
};

module.exports = gameService;