class SimulationEngine {
  constructor() {
    this.random = Math.random;
  }

  // ============================================================
  // GAME SIMULATION
  // ============================================================

  async simulateGame(homeTeamId, awayTeamId) {
    // Get team ratings
    const homeRating = this.getTeamRating(homeTeamId);
    const awayRating = this.getTeamRating(awayTeamId);

    // Calculate expected scores
    const homeAdvantage = 1.03; // 3% home advantage
    const expectedHomeScore = homeRating * homeAdvantage;
    const expectedAwayScore = awayRating;

    // Add randomness (normal distribution)
    const homeScore = this.generateScore(expectedHomeScore);
    const awayScore = this.generateScore(expectedAwayScore);

    // Generate detailed stats
    const stats = this.generateGameStats(homeTeamId, awayTeamId, homeScore, awayScore);

    return {
      home_team: homeTeamId,
      away_team: awayTeamId,
      home_score: homeScore,
      away_score: awayScore,
      winner: homeScore > awayScore ? homeTeamId : awayTeamId,
      ...stats
    };
  }

  getTeamRating(teamId) {
    // In a real implementation, this would fetch from database
    // For now, use a default rating
    return 75 + Math.floor(Math.random() * 20);
  }

  generateScore(expectedScore) {
    // Normal distribution around expected score
    const variation = this.randomNormal() * 8;
    const score = Math.round(expectedScore + variation);
    return Math.max(60, Math.min(140, score));
  }

  randomNormal() {
    // Box-Muller transform for normal distribution
    let u = 0, v = 0;
    while (u === 0) u = this.random();
    while (v === 0) v = this.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  // ============================================================
  // GAME STATS GENERATION
  // ============================================================

  generateGameStats(homeTeamId, awayTeamId, homeScore, awayScore) {
    const homeStats = this.generateTeamStats(homeScore);
    const awayStats = this.generateTeamStats(awayScore);

    // Generate player stats
    const homePlayers = this.generatePlayerStats(homeTeamId, homeScore, true);
    const awayPlayers = this.generatePlayerStats(awayTeamId, awayScore, false);

    return {
      home_stats: homeStats,
      away_stats: awayStats,
      home_players: homePlayers,
      away_players: awayPlayers
    };
  }

  generateTeamStats(score) {
    return {
      points: score,
      field_goals_made: Math.round(score * 0.45),
      field_goals_attempted: Math.round(score * 0.95),
      three_points_made: Math.round(score * 0.12),
      three_points_attempted: Math.round(score * 0.28),
      free_throws_made: Math.round(score * 0.18),
      free_throws_attempted: Math.round(score * 0.23),
      rebounds: 35 + Math.floor(Math.random() * 20),
      assists: 15 + Math.floor(Math.random() * 15),
      steals: 5 + Math.floor(Math.random() * 10),
      blocks: 3 + Math.floor(Math.random() * 8),
      turnovers: 10 + Math.floor(Math.random() * 15),
      fouls: 15 + Math.floor(Math.random() * 10)
    };
  }

  generatePlayerStats(teamId, teamScore, isHome) {
    // Generate stats for 5 starters and bench players
    const players = [];
    const numPlayers = 10; // 5 starters + 5 bench

    for (let i = 0; i < numPlayers; i++) {
      const isStarter = i < 5;
      const minutes = isStarter ? 
        28 + Math.floor(Math.random() * 8) : // 28-36 minutes
        10 + Math.floor(Math.random() * 15); // 10-25 minutes

      const usage = isStarter ? 0.2 + Math.random() * 0.15 : 0.05 + Math.random() * 0.1;
      const points = Math.round(teamScore * usage * (0.8 + Math.random() * 0.4));
      
      players.push({
        player_id: `${teamId}_${i + 1}`,
        minutes: minutes,
        points: points,
        rebounds: Math.round(3 + Math.random() * 8),
        assists: Math.round(1 + Math.random() * 8),
        steals: Math.round(Math.random() * 3),
        blocks: Math.round(Math.random() * 2),
        turnovers: Math.round(Math.random() * 4),
        fouls: Math.round(1 + Math.random() * 4),
        field_goals_made: Math.round(points * 0.45),
        field_goals_attempted: Math.round(points * 0.95),
        three_points_made: Math.round(points * 0.12),
        three_points_attempted: Math.round(points * 0.28),
        free_throws_made: Math.round(points * 0.18),
        free_throws_attempted: Math.round(points * 0.23)
      });
    }

    return players;
  }

  // ============================================================
  // PLAYER DEVELOPMENT
  // ============================================================

  developPlayer(player) {
    // Offseason development
    const developmentChance = Math.random();
    
    // Young players develop more
    const ageFactor = Math.max(0, 1 - (player.age - 19) / 15);
    const potentialGrowth = player.potential_rating - player.overall_rating;
    
    let improvement = 0;
    
    if (developmentChance < 0.3 * ageFactor) {
      // Significant improvement
      improvement = Math.min(3, Math.floor(Math.random() * 4));
    } else if (developmentChance < 0.6 * ageFactor) {
      // Moderate improvement
      improvement = Math.min(2, Math.floor(Math.random() * 3));
    } else if (developmentChance < 0.8 * ageFactor) {
      // Small improvement
      improvement = Math.floor(Math.random() * 2);
    }
    
    // Don't exceed potential
    const newRating = Math.min(
      player.overall_rating + improvement,
      player.potential_rating
    );
    
    return newRating;
  }

  // ============================================================
  // STATS PROCESSING
  // ============================================================

  calculateSeasonAverages(playerStats, gamesPlayed) {
    if (gamesPlayed === 0) return {};

    return {
      points_per_game: (playerStats.points / gamesPlayed).toFixed(1),
      rebounds_per_game: (playerStats.rebounds / gamesPlayed).toFixed(1),
      assists_per_game: (playerStats.assists / gamesPlayed).toFixed(1),
      steals_per_game: (playerStats.steals / gamesPlayed).toFixed(1),
      blocks_per_game: (playerStats.blocks / gamesPlayed).toFixed(1),
      field_goal_percentage: ((playerStats.field_goals_made / playerStats.field_goals_attempted) * 100).toFixed(1),
      three_point_percentage: ((playerStats.three_points_made / playerStats.three_points_attempted) * 100).toFixed(1),
      free_throw_percentage: ((playerStats.free_throws_made / playerStats.free_throws_attempted) * 100).toFixed(1)
    };
  }
}

module.exports = SimulationEngine;