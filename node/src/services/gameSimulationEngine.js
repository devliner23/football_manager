// services/GameSimulationEngine.js

/**
 * Advanced Basketball Game Simulation Engine
 * Simulates realistic basketball games based on player attributes
 * Uses possession-based simulation with play-by-play logic
 */

class GameSimulationEngine {
  /**
   * Simulate a complete basketball game between two teams
   * @param {Array} homePlayers - Array of player objects for home team
   * @param {Array} awayPlayers - Array of player objects for away team
   * @param {Object} options - Simulation options
   * @returns {Object} - Complete game results with box scores
   */
  static simulateGame(homePlayers, awayPlayers, options = {}) {
    const {
      quarters = 4,
      minutesPerQuarter = 12,
      overtimeMinutes = 5,
      maxOvertimes = 1,
      homeCourtAdvantage = 1.03, // 3% boost for home team
    } = options;

    // Create team objects with full rosters
    const homeTeam = this._createTeam(homePlayers, 'home', homeCourtAdvantage);
    const awayTeam = this._createTeam(awayPlayers, 'away', 1);

    // Simulate regulation
    let gameLog = [];
    let homeScore = 0;
    let awayScore = 0;
    let overtimeCount = 0;
    let isOvertime = false;

    const totalQuarters = quarters + (isOvertime ? 1 : 0);
    
    for (let q = 0; q < totalQuarters; q++) {
      const period = isOvertime ? `OT${overtimeCount}` : `Q${q + 1}`;
      const minutes = isOvertime ? overtimeMinutes : minutesPerQuarter;
      
      const result = this._simulatePeriod(
        homeTeam, 
        awayTeam, 
        minutes, 
        period,
        isOvertime
      );
      
      homeScore += result.homeScore;
      awayScore += result.awayScore;
      gameLog.push(result.log);
    }

    // Handle overtime if needed
    while (homeScore === awayScore && overtimeCount < maxOvertimes) {
      overtimeCount++;
      isOvertime = true;
      
      const result = this._simulatePeriod(
        homeTeam, 
        awayTeam, 
        overtimeMinutes, 
        `OT${overtimeCount}`,
        true
      );
      
      homeScore += result.homeScore;
      awayScore += result.awayScore;
      gameLog.push(result.log);
    }

    // Generate box scores
    const homeBoxScores = this._generateBoxScores(homeTeam.players, homeScore, awayScore, true);
    const awayBoxScores = this._generateBoxScores(awayTeam.players, awayScore, homeScore, false);

    return {
      homeScore,
      awayScore,
      winner: homeScore > awayScore ? 'home' : 'away',
      homeBoxScores,
      awayBoxScores,
      gameLog,
      totalPossessions: homeTeam.totalPossessions + awayTeam.totalPossessions,
      overtime: overtimeCount > 0,
      overtimeCount,
    };
  }

  /**
   * Simulate a single period (quarter or overtime)
   */
  static _simulatePeriod(homeTeam, awayTeam, minutes, periodName, isOvertime) {
    const possessions = Math.floor(minutes * 2.5); // ~2.5 possessions per minute
    let homeScore = 0;
    let awayScore = 0;
    let log = [];

    // Determine starting possession (alternate)
    let homeHasBall = Math.random() > 0.5;

    for (let i = 0; i < possessions; i++) {
      const isHomePossession = homeHasBall;
      const offense = isHomePossession ? homeTeam : awayTeam;
      const defense = isHomePossession ? awayTeam : homeTeam;
      
      // Select offensive players for the possession
      const lineup = this._selectLineup(offense.players);
      const defensiveLineup = this._selectLineup(defense.players);
      
      // Simulate the possession
      const possessionResult = this._simulatePossession(
        lineup,
        defensiveLineup,
        isHomePossession,
        isOvertime
      );
      
      // Record possession
      if (isHomePossession) {
        homeScore += possessionResult.points;
        homeTeam.totalPossessions++;
      } else {
        awayScore += possessionResult.points;
        awayTeam.totalPossessions++;
      }
      
      log.push({
        period: periodName,
        possession: i + 1,
        team: isHomePossession ? 'home' : 'away',
        ...possessionResult
      });
      
      // Alternate possession
      homeHasBall = !homeHasBall;
    }

    return { homeScore, awayScore, log };
  }

  /**
   * Simulate a single possession
   */
  static _simulatePossession(offense, defense, isHomePossession, isOvertime) {
    // Select primary ball handler (PG or best ball handler)
    const primaryHandler = this._selectPrimaryHandler(offense);
    const primaryDefender = this._selectPrimaryDefender(defense, primaryHandler);
    
    // Determine play type based on personnel and situation
    const playType = this._selectPlayType(offense, defense, isOvertime);
    
    let points = 0;
    let shotResult = null;
    let turnovers = false;
    
    // Execute the play
    switch(playType) {
      case 'isolation':
        shotResult = this._executeIsolation(primaryHandler, primaryDefender);
        break;
      case 'pick_and_roll':
        const screener = this._selectScreener(offense);
        const rollDefender = this._selectRollDefender(defense);
        shotResult = this._executePickAndRoll(primaryHandler, screener, primaryDefender, rollDefender);
        break;
      case 'spot_up':
        const shooter = this._selectShooter(offense);
        const defender = this._selectClosestDefender(defense, shooter);
        shotResult = this._executeSpotUp(shooter, defender);
        break;
      case 'post_up':
        const postPlayer = this._selectPostPlayer(offense);
        const postDefender = this._selectClosestDefender(defense, postPlayer);
        shotResult = this._executePostUp(postPlayer, postDefender);
        break;
      case 'transition':
        shotResult = this._executeTransition(offense, defense);
        break;
      default:
        shotResult = this._executeIsolation(primaryHandler, primaryDefender);
    }
    
    // Check for turnovers
    if (Math.random() < this._calculateTurnoverProbability(primaryHandler, primaryDefender)) {
      turnovers = true;
      points = 0;
    } else {
      points = shotResult.points;
    }
    
    return {
      playType,
      points,
      shotResult,
      turnovers,
      handler: primaryHandler,
      defender: primaryDefender,
    };
  }

  /**
   * Select starting lineup for a possession
   */
  static _selectLineup(players) {
    // Sort by overall rating and take top 5
    return [...players]
      .sort((a, b) => b.overall_rating - a.overall_rating)
      .slice(0, 5);
  }

  /**
   * Select primary ball handler (best combination of ball handling and passing)
   */
  static _selectPrimaryHandler(players) {
    return players.reduce((best, current) => {
      const score = current.ball_handling * 0.6 + current.passing * 0.4;
      const bestScore = best.ball_handling * 0.6 + best.passing * 0.4;
      return score > bestScore ? current : best;
    });
  }

  /**
   * Select primary defender (best perimeter defender)
   */
  static _selectPrimaryDefender(players, handler) {
    return players.reduce((best, current) => {
      const score = current.perimeter_defense * 0.7 + current.speed * 0.3;
      const bestScore = best.perimeter_defense * 0.7 + best.speed * 0.3;
      return score > bestScore ? best : current;
    });
  }

  /**
   * Select screener for pick and roll (best inside scorer or big man)
   */
  static _selectScreener(players) {
    return players.reduce((best, current) => {
      const score = current.inside_scoring * 0.5 + current.rebounding * 0.3 + current.strength * 0.2;
      const bestScore = best.inside_scoring * 0.5 + best.rebounding * 0.3 + best.strength * 0.2;
      return score > bestScore ? current : best;
    });
  }

  /**
   * Select roll defender
   */
  static _selectRollDefender(players) {
    return players.reduce((best, current) => {
      const score = current.post_defense * 0.6 + current.rebounding * 0.4;
      const bestScore = best.post_defense * 0.6 + best.rebounding * 0.4;
      return score > bestScore ? current : best;
    });
  }

  /**
   * Select shooter for spot up
   */
  static _selectShooter(players) {
    return players.reduce((best, current) => {
      const score = current.three_point * 0.7 + current.mid_range * 0.3;
      const bestScore = best.three_point * 0.7 + best.mid_range * 0.3;
      return score > bestScore ? current : best;
    });
  }

  /**
   * Select post player
   */
  static _selectPostPlayer(players) {
    return players.reduce((best, current) => {
      const score = current.inside_scoring * 0.5 + current.strength * 0.3 + current.post_defense * 0.2;
      const bestScore = best.inside_scoring * 0.5 + best.strength * 0.3 + best.post_defense * 0.2;
      return score > bestScore ? current : best;
    });
  }

  /**
   * Select closest defender to a player
   */
  static _selectClosestDefender(players, offensivePlayer) {
    return players.reduce((best, current) => {
      // Simulate defensive positioning based on speed and position
      const score = current.speed * 0.6 + current.perimeter_defense * 0.4;
      const bestScore = best.speed * 0.6 + best.perimeter_defense * 0.4;
      return score > bestScore ? current : best;
    });
  }

  /**
   * Select play type based on personnel
   */
  static _selectPlayType(offense, defense, isOvertime) {
    const ratings = offense.map(p => p.overall_rating);
    const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    
    // Calculate team tendencies
    const threePointAvg = offense.reduce((sum, p) => sum + p.three_point, 0) / offense.length;
    const insideAvg = offense.reduce((sum, p) => sum + p.inside_scoring, 0) / offense.length;
    const passingAvg = offense.reduce((sum, p) => sum + p.passing, 0) / offense.length;
    
    let weights = {
      isolation: 20,
      pick_and_roll: 30,
      spot_up: 25,
      post_up: 20,
      transition: 5,
    };
    
    // Adjust based on team strengths
    if (threePointAvg > 80) weights.spot_up += 15;
    if (insideAvg > 80) weights.post_up += 15;
    if (passingAvg > 80) weights.pick_and_roll += 15;
    
    // Overtime adjustments - more isolation plays
    if (isOvertime) {
      weights.isolation += 20;
      weights.pick_and_roll -= 10;
    }
    
    // Weighted random selection
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let random = Math.random() * total;
    
    for (const [playType, weight] of Object.entries(weights)) {
      random -= weight;
      if (random <= 0) return playType;
    }
    
    return 'isolation';
  }

  /**
   * Calculate turnover probability
   */
  static _calculateTurnoverProbability(handler, defender) {
    const baseRate = 0.12; // 12% base turnover rate
    const handlerSkill = (handler.ball_handling + handler.passing) / 2;
    const defenderSkill = defender.perimeter_defense;
    
    // Adjust probability based on skill differential
    const skillDiff = (defenderSkill - handlerSkill) / 100;
    return Math.min(0.35, Math.max(0.03, baseRate + skillDiff * 0.3));
  }

  /**
   * Execute isolation play
   */
  static _executeIsolation(handler, defender) {
    const shotQuality = this._calculateShotQuality(handler, defender, 'isolation');
    return this._attemptShot(handler, defender, shotQuality, 'isolation');
  }

  /**
   * Execute pick and roll
   */
  static _executePickAndRoll(handler, screener, defender, rollDefender) {
    // Calculate if roll or pass
    const rollSuccess = (screener.inside_scoring + screener.strength) / 200;
    const defenderQuality = (rollDefender.post_defense + rollDefender.rebounding) / 200;
    
    let shotQuality;
    if (Math.random() < rollSuccess * (1 - defenderQuality * 0.5)) {
      // Roll to basket
      shotQuality = this._calculateShotQuality(screener, rollDefender, 'post_up');
      return this._attemptShot(screener, rollDefender, shotQuality, 'post_up');
    } else {
      // Pull up jumper
      shotQuality = this._calculateShotQuality(handler, defender, 'isolation');
      return this._attemptShot(handler, defender, shotQuality, 'isolation');
    }
  }

  /**
   * Execute spot up
   */
  static _executeSpotUp(shooter, defender) {
    const shotQuality = this._calculateShotQuality(shooter, defender, 'spot_up');
    return this._attemptShot(shooter, defender, shotQuality, 'spot_up');
  }

  /**
   * Execute post up
   */
  static _executePostUp(postPlayer, defender) {
    const shotQuality = this._calculateShotQuality(postPlayer, defender, 'post_up');
    return this._attemptShot(postPlayer, defender, shotQuality, 'post_up');
  }

  /**
   * Execute transition
   */
  static _executeTransition(offense, defense) {
    // Higher chance of easy basket
    const avgSpeed = offense.reduce((sum, p) => sum + p.speed, 0) / offense.length;
    const defAvgSpeed = defense.reduce((sum, p) => sum + p.speed, 0) / defense.length;
    
    const speedAdvantage = (avgSpeed - defAvgSpeed) / 100;
    const shotQuality = 0.6 + speedAdvantage * 0.3;
    
    // Randomly select a player for transition
    const player = offense[Math.floor(Math.random() * offense.length)];
    const defender = defense[Math.floor(Math.random() * defense.length)];
    
    return this._attemptShot(player, defender, Math.min(0.9, shotQuality), 'transition');
  }

  /**
   * Calculate shot quality based on player and defender ratings
   */
  static _calculateShotQuality(player, defender, playType) {
    let offensiveSkill = 0;
    let defensiveSkill = 0;
    let positionFactor = 1;
    
    switch(playType) {
      case 'isolation':
        offensiveSkill = (player.ball_handling * 0.3 + player.mid_range * 0.4 + player.three_point * 0.3);
        defensiveSkill = defender.perimeter_defense;
        positionFactor = player.position === 'PG' || player.position === 'SG' ? 1.1 : 1;
        break;
      case 'spot_up':
        offensiveSkill = player.three_point * 0.7 + player.mid_range * 0.3;
        defensiveSkill = defender.perimeter_defense * 0.8 + defender.speed * 0.2;
        positionFactor = player.position === 'SG' || player.position === 'SF' ? 1.2 : 1;
        break;
      case 'post_up':
        offensiveSkill = player.inside_scoring * 0.6 + player.strength * 0.4;
        defensiveSkill = defender.post_defense * 0.7 + defender.strength * 0.3;
        positionFactor = player.position === 'C' || player.position === 'PF' ? 1.2 : 0.9;
        break;
      default:
        offensiveSkill = player.overall_rating;
        defensiveSkill = defender.overall_rating;
    }
    
    // Calculate base quality (0-1 scale)
    let quality = (offensiveSkill / 100) * 0.7 - (defensiveSkill / 100) * 0.3;
    quality = Math.max(0, Math.min(1, quality + 0.3));
    quality *= positionFactor;
    
    // Add randomness
    quality += (Math.random() - 0.5) * 0.15;
    return Math.max(0, Math.min(1, quality));
  }

  /**
   * Attempt a shot based on shot quality
   */
  static _attemptShot(player, defender, shotQuality, playType) {
    const baseMakeRate = 0.35 + shotQuality * 0.35; // 35-70% range
    const isThree = playType === 'spot_up' || 
                    (playType === 'isolation' && player.three_point > 75);
    
    // Determine shot type
    let fga = 1;
    let fgm = 0;
    let fga3 = 0;
    let fgm3 = 0;
    let fta = 0;
    let ftm = 0;
    let points = 0;
    
    // Check for foul
    const foulProbability = 0.08 + (1 - defender.perimeter_defense / 100) * 0.05;
    const isFoul = Math.random() < foulProbability;
    
    if (isFoul) {
      // Free throws
      const ftAttempts = 2;
      const ftMakeRate = 0.7 + (player.three_point / 100) * 0.2; // 70-90%
      let makes = 0;
      for (let i = 0; i < ftAttempts; i++) {
        if (Math.random() < ftMakeRate) makes++;
      }
      fta = ftAttempts;
      ftm = makes;
      points = makes;
      
      return {
        points,
        fga: 0,
        fgm: 0,
        fga3: 0,
        fgm3: 0,
        fta,
        ftm,
        shotQuality,
        isFoul: true,
      };
    }
    
    // Regular shot
    const makeRate = isThree ? 
      baseMakeRate * (player.three_point / 80) : 
      baseMakeRate * (player.mid_range / 80);
    
    const made = Math.random() < Math.min(0.85, makeRate);
    
    if (isThree) {
      fga3 = 1;
      fgm3 = made ? 1 : 0;
      points = made ? 3 : 0;
    } else {
      fga = 1;
      fgm = made ? 1 : 0;
      points = made ? 2 : 0;
    }
    
    return {
      points,
      fga,
      fgm,
      fga3,
      fgm3,
      fta,
      ftm,
      shotQuality,
      isFoul: false,
    };
  }

  /**
   * Create team object from player array
   */
  static _createTeam(players, teamType, advantage) {
    return {
      players: players.map(p => ({
        ...p,
        // Apply home court advantage to all ratings
        ...(teamType === 'home' && {
          overall_rating: Math.min(99, p.overall_rating * advantage),
          three_point: Math.min(99, p.three_point * advantage),
          mid_range: Math.min(99, p.mid_range * advantage),
          inside_scoring: Math.min(99, p.inside_scoring * advantage),
          passing: Math.min(99, p.passing * advantage),
          ball_handling: Math.min(99, p.ball_handling * advantage),
          perimeter_defense: Math.min(99, p.perimeter_defense * advantage),
          post_defense: Math.min(99, p.post_defense * advantage),
          rebounding: Math.min(99, p.rebounding * advantage),
          speed: Math.min(99, p.speed * advantage),
          strength: Math.min(99, p.strength * advantage),
        })
      })),
      totalPossessions: 0,
    };
  }

  /**
   * Generate detailed box scores for players
   */
  static _generateBoxScores(players, teamScore, opponentScore, isHome) {
    const totalMinutes = 48 * 5;
    const sorted = [...players].sort((a, b) => b.overall_rating - a.overall_rating);
    
    // Distribute minutes based on ratings
    const ratedPlayers = sorted.map((p, index) => {
      let minutes;
      if (index < 5) {
        // Starters get 28-38 minutes
        minutes = 28 + Math.random() * 10;
      } else if (index < 9) {
        // Bench rotation gets 12-22 minutes
        minutes = 12 + Math.random() * 10;
      } else {
        // Deep bench gets 2-8 minutes
        minutes = 2 + Math.random() * 6;
      }
      
      // Adjust based on rating
      const ratingFactor = (p.overall_rating - 40) / 60;
      minutes = minutes * (0.8 + ratingFactor * 0.4);
      
      return { ...p, minutes };
    });
    
    // Normalize minutes to total
    const totalAllocated = ratedPlayers.reduce((sum, p) => sum + p.minutes, 0);
    const scaleFactor = totalMinutes / totalAllocated;
    
    const boxScores = ratedPlayers.map(p => {
      const minutes = Math.round(p.minutes * scaleFactor);
      
      // Calculate stats based on minutes and ratings
      const ratingFactor = p.overall_rating / 100;
      const minuteFactor = minutes / 36;
      
      // Calculate points with realistic distribution
      const usageRate = 0.15 + ratingFactor * 0.2;
      const shotAttempts = Math.round(minuteFactor * 12 * (0.7 + ratingFactor * 0.6));
      
      // Distribute shot types based on position and ratings
      const threeRate = Math.min(0.6, p.three_point / 120);
      const midRate = Math.min(0.5, p.mid_range / 120);
      const insideRate = 1 - threeRate - midRate;
      
      let fga = 0, fgm = 0, fga3 = 0, fgm3 = 0;
      let fta = 0, ftm = 0;
      
      // Simulate shot attempts
      for (let i = 0; i < shotAttempts; i++) {
        const shotType = Math.random();
        let made = false;
        
        if (shotType < threeRate) {
          fga3++;
          const makeRate = 0.25 + (p.three_point / 100) * 0.35;
          made = Math.random() < makeRate;
          if (made) fgm3++;
        } else if (shotType < threeRate + midRate) {
          fga++;
          const makeRate = 0.35 + (p.mid_range / 100) * 0.25;
          made = Math.random() < makeRate;
          if (made) fgm++;
        } else {
          fga++;
          const makeRate = 0.4 + (p.inside_scoring / 100) * 0.3;
          made = Math.random() < makeRate;
          if (made) fgm++;
        }
      }
      
      // Free throws
      const ftRate = 0.1 + ratingFactor * 0.2;
      const ftAttempts = Math.round(shotAttempts * ftRate * (1 + Math.random() * 0.5));
      for (let i = 0; i < ftAttempts; i++) {
        fta++;
        const makeRate = 0.7 + (p.three_point / 100) * 0.15;
        if (Math.random() < makeRate) ftm++;
      }
      
      // Calculate points
      const points = fgm * 2 + fgm3 * 3 + ftm;
      
      // Other stats
      const rebounds = Math.round(
        minuteFactor * 4 * (0.5 + (p.rebounding / 100) * 0.6) * (isHome ? 1.05 : 1)
      );
      const assists = Math.round(
        minuteFactor * 3 * (0.5 + (p.passing / 100) * 0.6)
      );
      const steals = Math.round(
        minuteFactor * 1.5 * (0.5 + (p.perimeter_defense / 100) * 0.5)
      );
      const blocks = Math.round(
        minuteFactor * 1 * (0.5 + (p.post_defense / 100) * 0.5)
      );
      const turnovers = Math.round(
        minuteFactor * 2 * (1 - (p.ball_handling / 100) * 0.4)
      );
      
      return {
        player_id: p.id,
        team_id: p.team_id,
        minutes_played: minutes,
        points,
        rebounds,
        assists,
        steals,
        blocks,
        turnovers,
        fga,
        fgm,
        fga_3: fga3,
        fgm_3: fgm3,
        fta,
        ftm,
      };
    });
    
    return boxScores;
  }
}

module.exports = GameSimulationEngine;