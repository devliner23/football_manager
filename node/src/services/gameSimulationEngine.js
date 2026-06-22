// services/gameSimulationEngine.js

/**
 * Advanced Basketball Game Simulation Engine
 * Simulates realistic basketball games based on player attributes
 * Uses possession-based simulation with play-by-play logic
 */

class GameSimulationEngine {
  /**
   * Simulate a complete basketball game between two teams.
   * @param {Array}  homePlayers - Array of player objects for the home team
   * @param {Array}  awayPlayers - Array of player objects for the away team
   * @param {Object} options     - Simulation options
   * @returns {Object} Complete game results with box scores
   */
  static simulateGame(homePlayers, awayPlayers, options = {}) {
    const {
      quarters           = 4,
      minutesPerQuarter  = 12,
      overtimeMinutes    = 5,
      maxOvertimes       = 1,
      homeCourtAdvantage = 1.03,
    } = options;

    const homeTeam = this._createTeam(homePlayers, 'home', homeCourtAdvantage);
    const awayTeam = this._createTeam(awayPlayers, 'away', 1);

    let homeScore    = 0;
    let awayScore    = 0;
    let overtimeCount = 0;
    let isOvertime   = false;
    const gameLog    = [];

    // Simulate regulation quarters
    for (let q = 0; q < quarters; q++) {
      const result = this._simulatePeriod(homeTeam, awayTeam, minutesPerQuarter, `Q${q + 1}`, false);
      homeScore += result.homeScore;
      awayScore += result.awayScore;
      gameLog.push(result.log);
    }

    // Overtime periods (up to maxOvertimes)
    while (homeScore === awayScore && overtimeCount < maxOvertimes) {
      overtimeCount++;
      isOvertime = true;
      const result = this._simulatePeriod(homeTeam, awayTeam, overtimeMinutes, `OT${overtimeCount}`, true);
      homeScore += result.homeScore;
      awayScore += result.awayScore;
      gameLog.push(result.log);
    }

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
      overtime:         isOvertime,
      overtimeCount,
    };
  }

  // ── Period simulation ─────────────────────────────────────────────────────

  static _simulatePeriod(homeTeam, awayTeam, minutes, periodName, isOvertime) {
    const possessions  = Math.floor(minutes * 2.5); // ~2.5 possessions per minute per team
    let homeScore      = 0;
    let awayScore      = 0;
    const log          = [];
    let homeHasBall    = Math.random() > 0.5;

    for (let i = 0; i < possessions; i++) {
      const offense = homeHasBall ? homeTeam : awayTeam;
      const defense = homeHasBall ? awayTeam : homeTeam;

      const lineup          = this._selectLineup(offense.players);
      const defensiveLineup = this._selectLineup(defense.players);

      const possessionResult = this._simulatePossession(lineup, defensiveLineup, homeHasBall, isOvertime);

      if (homeHasBall) {
        homeScore += possessionResult.points;
        homeTeam.totalPossessions++;
      } else {
        awayScore += possessionResult.points;
        awayTeam.totalPossessions++;
      }

      log.push({
        period:     periodName,
        possession: i + 1,
        team:       homeHasBall ? 'home' : 'away',
        ...possessionResult,
      });

      homeHasBall = !homeHasBall;
    }

    return { homeScore, awayScore, log };
  }

  // ── Possession simulation ─────────────────────────────────────────────────

  static _simulatePossession(offense, defense, isHomePossession, isOvertime) {
    const primaryHandler  = this._selectPrimaryHandler(offense);
    const primaryDefender = this._selectPrimaryDefender(defense, primaryHandler);
    const playType        = this._selectPlayType(offense, defense, isOvertime);

    let shotResult;

    switch (playType) {
      case 'isolation':
        shotResult = this._executeIsolation(primaryHandler, primaryDefender);
        break;
      case 'pick_and_roll': {
        const screener     = this._selectScreener(offense);
        const rollDefender = this._selectRollDefender(defense);
        shotResult = this._executePickAndRoll(primaryHandler, screener, primaryDefender, rollDefender);
        break;
      }
      case 'spot_up': {
        const shooter  = this._selectShooter(offense);
        const defender = this._selectClosestDefender(defense, shooter);
        shotResult = this._executeSpotUp(shooter, defender);
        break;
      }
      case 'post_up': {
        const postPlayer  = this._selectPostPlayer(offense);
        const postDefender = this._selectClosestDefender(defense, postPlayer);
        shotResult = this._executePostUp(postPlayer, postDefender);
        break;
      }
      case 'transition':
        shotResult = this._executeTransition(offense, defense);
        break;
      default:
        shotResult = this._executeIsolation(primaryHandler, primaryDefender);
    }

    const turnover = Math.random() < this._calculateTurnoverProbability(primaryHandler, primaryDefender);

    return {
      playType,
      points:    turnover ? 0 : shotResult.points,
      shotResult,
      turnovers: turnover,
      handler:   primaryHandler,
      defender:  primaryDefender,
    };
  }

  // ── Player selection helpers ──────────────────────────────────────────────

  /** Top 5 players by overall rating */
  static _selectLineup(players) {
    return [...players].sort((a, b) => b.overall_rating - a.overall_rating).slice(0, 5);
  }

  /** Best ball-handler + passer combination */
  static _selectPrimaryHandler(players) {
    return players.reduce((best, current) => {
      const score     = current.ball_handling * 0.6 + current.passing * 0.4;
      const bestScore = best.ball_handling    * 0.6 + best.passing    * 0.4;
      return score > bestScore ? current : best;
    });
  }

  /**
   * Best perimeter defender.
   * FIX: original code returned `best` when score > bestScore (inverted condition),
   * meaning the WORST defender was always selected.
   */
  static _selectPrimaryDefender(players) {
    return players.reduce((best, current) => {
      const score     = current.perimeter_defense * 0.7 + current.speed * 0.3;
      const bestScore = best.perimeter_defense    * 0.7 + best.speed    * 0.3;
      return score > bestScore ? current : best; // FIX: was `? best : current`
    });
  }

  /** Best screener / roll man (big with interior scoring) */
  static _selectScreener(players) {
    return players.reduce((best, current) => {
      const score     = current.inside_scoring * 0.5 + current.rebounding * 0.3 + current.strength * 0.2;
      const bestScore = best.inside_scoring    * 0.5 + best.rebounding    * 0.3 + best.strength    * 0.2;
      return score > bestScore ? current : best;
    });
  }

  /** Best post / roll defender */
  static _selectRollDefender(players) {
    return players.reduce((best, current) => {
      const score     = current.post_defense * 0.6 + current.rebounding * 0.4;
      const bestScore = best.post_defense    * 0.6 + best.rebounding    * 0.4;
      return score > bestScore ? current : best;
    });
  }

  /** Best three-point / mid-range shooter */
  static _selectShooter(players) {
    return players.reduce((best, current) => {
      const score     = current.three_point * 0.7 + current.mid_range * 0.3;
      const bestScore = best.three_point    * 0.7 + best.mid_range    * 0.3;
      return score > bestScore ? current : best;
    });
  }

  /** Best post-up player */
  static _selectPostPlayer(players) {
    return players.reduce((best, current) => {
      const score     = current.inside_scoring * 0.5 + current.strength * 0.3 + current.post_defense * 0.2;
      const bestScore = best.inside_scoring    * 0.5 + best.strength    * 0.3 + best.post_defense    * 0.2;
      return score > bestScore ? current : best;
    });
  }

  /** Closest (fastest + best perimeter D) defender to an offensive player */
  static _selectClosestDefender(players) {
    return players.reduce((best, current) => {
      const score     = current.speed * 0.6 + current.perimeter_defense * 0.4;
      const bestScore = best.speed    * 0.6 + best.perimeter_defense    * 0.4;
      return score > bestScore ? current : best;
    });
  }

  // ── Play type selection ───────────────────────────────────────────────────

  static _selectPlayType(offense, defense, isOvertime) {
    const threePointAvg = offense.reduce((sum, p) => sum + p.three_point,     0) / offense.length;
    const insideAvg     = offense.reduce((sum, p) => sum + p.inside_scoring,  0) / offense.length;
    const passingAvg    = offense.reduce((sum, p) => sum + p.passing,         0) / offense.length;

    const weights = {
      isolation:    20,
      pick_and_roll: 30,
      spot_up:       25,
      post_up:       20,
      transition:     5,
    };

    if (threePointAvg > 80) weights.spot_up       += 15;
    if (insideAvg     > 80) weights.post_up        += 15;
    if (passingAvg    > 80) weights.pick_and_roll  += 15;

    if (isOvertime) {
      weights.isolation    += 20;
      weights.pick_and_roll -= 10;
    }

    const total  = Object.values(weights).reduce((a, b) => a + b, 0);
    let   random = Math.random() * total;

    for (const [playType, weight] of Object.entries(weights)) {
      random -= weight;
      if (random <= 0) return playType;
    }

    return 'isolation';
  }

  // ── Turnover probability ──────────────────────────────────────────────────

  static _calculateTurnoverProbability(handler, defender) {
    const baseRate     = 0.12;
    const handlerSkill = (handler.ball_handling + handler.passing) / 2;
    const defSkill     = defender.perimeter_defense;
    const skillDiff    = (defSkill - handlerSkill) / 100;
    return Math.min(0.35, Math.max(0.03, baseRate + skillDiff * 0.3));
  }

  // ── Play execution ────────────────────────────────────────────────────────

  static _executeIsolation(handler, defender) {
    const shotQuality = this._calculateShotQuality(handler, defender, 'isolation');
    return this._attemptShot(handler, defender, shotQuality, 'isolation');
  }

  static _executePickAndRoll(handler, screener, defender, rollDefender) {
    const rollSuccess    = (screener.inside_scoring + screener.strength) / 200;
    const defenderQuality = (rollDefender.post_defense + rollDefender.rebounding) / 200;

    if (Math.random() < rollSuccess * (1 - defenderQuality * 0.5)) {
      const shotQuality = this._calculateShotQuality(screener, rollDefender, 'post_up');
      return this._attemptShot(screener, rollDefender, shotQuality, 'post_up');
    }
    const shotQuality = this._calculateShotQuality(handler, defender, 'isolation');
    return this._attemptShot(handler, defender, shotQuality, 'isolation');
  }

  static _executeSpotUp(shooter, defender) {
    const shotQuality = this._calculateShotQuality(shooter, defender, 'spot_up');
    return this._attemptShot(shooter, defender, shotQuality, 'spot_up');
  }

  static _executePostUp(postPlayer, defender) {
    const shotQuality = this._calculateShotQuality(postPlayer, defender, 'post_up');
    return this._attemptShot(postPlayer, defender, shotQuality, 'post_up');
  }

  static _executeTransition(offense, defense) {
    const avgSpeed    = offense.reduce((sum, p) => sum + p.speed, 0) / offense.length;
    const defAvgSpeed = defense.reduce((sum, p) => sum + p.speed, 0) / defense.length;
    const speedAdv    = (avgSpeed - defAvgSpeed) / 100;
    const shotQuality = Math.min(0.9, 0.6 + speedAdv * 0.3);
    const player      = offense[Math.floor(Math.random() * offense.length)];
    const defender    = defense[Math.floor(Math.random() * defense.length)];
    return this._attemptShot(player, defender, shotQuality, 'transition');
  }

  // ── Shot quality & attempt ────────────────────────────────────────────────

  static _calculateShotQuality(player, defender, playType) {
    let offensiveSkill  = 0;
    let defensiveSkill  = 0;
    let positionFactor  = 1;

    switch (playType) {
      case 'isolation':
        offensiveSkill = player.ball_handling * 0.3 + player.mid_range * 0.4 + player.three_point * 0.3;
        defensiveSkill = defender.perimeter_defense;
        positionFactor = (player.position === 'PG' || player.position === 'SG') ? 1.1 : 1;
        break;
      case 'spot_up':
        offensiveSkill = player.three_point * 0.7 + player.mid_range * 0.3;
        defensiveSkill = defender.perimeter_defense * 0.8 + defender.speed * 0.2;
        positionFactor = (player.position === 'SG' || player.position === 'SF') ? 1.2 : 1;
        break;
      case 'post_up':
        offensiveSkill = player.inside_scoring * 0.6 + player.strength * 0.4;
        defensiveSkill = defender.post_defense  * 0.7 + defender.strength * 0.3;
        positionFactor = (player.position === 'C'  || player.position === 'PF') ? 1.2 : 0.9;
        break;
      default:
        offensiveSkill = player.overall_rating;
        defensiveSkill = defender.overall_rating;
    }

    let quality = (offensiveSkill / 100) * 0.7 - (defensiveSkill / 100) * 0.3;
    quality = Math.max(0, Math.min(1, quality + 0.3)) * positionFactor;
    quality += (Math.random() - 0.5) * 0.15;
    return Math.max(0, Math.min(1, quality));
  }

  static _attemptShot(player, defender, shotQuality, playType) {
    const baseMakeRate = 0.35 + shotQuality * 0.35;
    const isThree      = playType === 'spot_up' || (playType === 'isolation' && player.three_point > 75);

    // Check for foul first
    const foulProbability = 0.08 + (1 - defender.perimeter_defense / 100) * 0.05;
    if (Math.random() < foulProbability) {
      const ftMakeRate = 0.7 + (player.three_point / 100) * 0.2;
      let ftm = 0;
      for (let i = 0; i < 2; i++) if (Math.random() < ftMakeRate) ftm++;
      return { points: ftm, fga: 0, fgm: 0, fga3: 0, fgm3: 0, fta: 2, ftm, shotQuality, isFoul: true };
    }

    // Regular shot
    if (isThree) {
      const makeRate = baseMakeRate * (player.three_point / 80);
      const made     = Math.random() < Math.min(0.85, makeRate);
      return { points: made ? 3 : 0, fga: 0, fgm: 0, fga3: 1, fgm3: made ? 1 : 0, fta: 0, ftm: 0, shotQuality, isFoul: false };
    }

    const makeRate = baseMakeRate * (player.mid_range / 80);
    const made     = Math.random() < Math.min(0.85, makeRate);
    return { points: made ? 2 : 0, fga: 1, fgm: made ? 1 : 0, fga3: 0, fgm3: 0, fta: 0, ftm: 0, shotQuality, isFoul: false };
  }

  // ── Team creation ─────────────────────────────────────────────────────────

  static _createTeam(players, teamType, advantage) {
    return {
      players: players.map(p => ({
        ...p,
        ...(teamType === 'home' && {
          overall_rating:     Math.min(99, p.overall_rating     * advantage),
          three_point:        Math.min(99, p.three_point        * advantage),
          mid_range:          Math.min(99, p.mid_range          * advantage),
          inside_scoring:     Math.min(99, p.inside_scoring     * advantage),
          passing:            Math.min(99, p.passing            * advantage),
          ball_handling:      Math.min(99, p.ball_handling      * advantage),
          perimeter_defense:  Math.min(99, p.perimeter_defense  * advantage),
          post_defense:       Math.min(99, p.post_defense       * advantage),
          rebounding:         Math.min(99, p.rebounding         * advantage),
          speed:              Math.min(99, p.speed              * advantage),
          strength:           Math.min(99, p.strength           * advantage),
        }),
      })),
      totalPossessions: 0,
    };
  }

  // ── Box score generation ──────────────────────────────────────────────────

  static _generateBoxScores(players, teamScore, opponentScore, isHome) {
    const totalMinutes = 48 * 5;
    const sorted       = [...players].sort((a, b) => b.overall_rating - a.overall_rating);
    const scoreDiff    = teamScore - opponentScore;

    // Allocate raw minutes before normalising
    const ratedPlayers = sorted.map((p, index) => {
      let minutes;
      if      (index < 5)  minutes = 28 + Math.random() * 10;
      else if (index < 9)  minutes = 12 + Math.random() * 10;
      else                 minutes =  2 + Math.random() *  6;

      const ratingFactor = (p.overall_rating - 40) / 60;
      minutes *= (0.8 + ratingFactor * 0.4);
      return { ...p, minutes };
    });

    // Normalise so the five starters + bench sum to 240 team-minutes
    const totalAllocated = ratedPlayers.reduce((sum, p) => sum + p.minutes, 0);
    const scaleFactor    = totalMinutes / totalAllocated;

    return ratedPlayers.map(p => {
      const minutes      = Math.round(p.minutes * scaleFactor);
      const ratingFactor = p.overall_rating / 100;
      const minuteFactor = minutes / 36;

      // Shot distribution
      const shotAttempts = Math.round(minuteFactor * 12 * (0.7 + ratingFactor * 0.6));
      const threeRate    = Math.min(0.6, p.three_point    / 120);
      const midRate      = Math.min(0.5, p.mid_range      / 120);

      let fga = 0, fgm = 0, fga3 = 0, fgm3 = 0, fta = 0, ftm = 0;

      for (let i = 0; i < shotAttempts; i++) {
        const shotType = Math.random();
        if (shotType < threeRate) {
          fga3++;
          const makeRate = 0.25 + (p.three_point    / 100) * 0.35;
          if (Math.random() < makeRate) fgm3++;
        } else if (shotType < threeRate + midRate) {
          fga++;
          const makeRate = 0.35 + (p.mid_range      / 100) * 0.25;
          if (Math.random() < makeRate) fgm++;
        } else {
          fga++;
          const makeRate = 0.40 + (p.inside_scoring / 100) * 0.30;
          if (Math.random() < makeRate) fgm++;
        }
      }

      // Free throws
      const ftAttempts = Math.round(shotAttempts * (0.1 + ratingFactor * 0.2) * (1 + Math.random() * 0.5));
      for (let i = 0; i < ftAttempts; i++) {
        fta++;
        const makeRate = 0.70 + (p.three_point / 100) * 0.15;
        if (Math.random() < makeRate) ftm++;
      }

      const points = fgm * 2 + fgm3 * 3 + ftm;

      // Rebounds (split 25 % offensive / 75 % defensive)
      const totalRebounds    = Math.round(minuteFactor * 4 * (0.5 + (p.rebounding / 100) * 0.6) * (isHome ? 1.05 : 1));
      const offensiveRebounds = Math.round(totalRebounds * (0.25 + Math.random() * 0.1));
      const defensiveRebounds = totalRebounds - offensiveRebounds;

      const assists      = Math.round(minuteFactor * 3   * (0.5 + (p.passing           / 100) * 0.6));
      const steals       = Math.round(minuteFactor * 1.5 * (0.5 + (p.perimeter_defense / 100) * 0.5));
      const blocks       = Math.round(minuteFactor * 1   * (0.5 + (p.post_defense      / 100) * 0.5));
      const turnovers    = Math.round(minuteFactor * 2   * (1   - (p.ball_handling     / 100) * 0.4));
      const foulRate     = 0.15 + (1 - p.perimeter_defense / 100) * 0.3;
      const personalFouls = Math.min(6, Math.round(minuteFactor * foulRate * 8));

      // Plus/minus
      const playerImpact = (p.overall_rating / 100) * (minutes / 48);
      const plusMinus    = Math.round(scoreDiff * playerImpact * 0.5 + (Math.random() - 0.5) * 4);

      return {
        player_id:          p.id,
        team_id:            p.team_id,
        minutes_played:     minutes,
        points,
        rebounds:           totalRebounds,
        offensive_rebounds: offensiveRebounds,
        defensive_rebounds: defensiveRebounds,
        assists,
        steals,
        blocks,
        turnovers,
        personal_fouls:     personalFouls,
        plus_minus:         plusMinus,
        fga,
        fgm,
        fga_3:  fga3,
        fgm_3:  fgm3,
        fta,
        ftm,
      };
    });
  }
}

module.exports = GameSimulationEngine;