// services/gameSimulationEngine.js

/**
 * Advanced Basketball Game Simulation Engine
 * Fully config‑driven with realistic systems:
 * – momentum, chemistry, fatigue
 * – detailed play types, turnover model, foul drawing, rebounds
 * – defensive schemes, clutch moments, home crowd intangibles
 * – automatic substitutions based on fatigue and depth
 * 
 * Configuration is loaded from src/data/gameData.json
 */

const gameData = require('../data/gameData.json');

class GameSimulationEngine {
  /**
   * Simulate a complete basketball game.
   * @param {Array} homePlayers
   * @param {Array} awayPlayers
   * @param {Object} options - can include { config: overrides }
   */
  static simulateGame(homePlayers, awayPlayers, options = {}) {
    const config = this._mergeConfig(options.config || {});
    const g = config.global;

    const gameState = {
      config,
      momentum: 0,
      homeChemistry: config.chemistry.minChemistry + 0.5 * (config.chemistry.maxChemistry - config.chemistry.minChemistry),
      awayChemistry: config.chemistry.minChemistry + 0.5 * (config.chemistry.maxChemistry - config.chemistry.minChemistry),
      homeFatigue: new Map(),
      awayFatigue: new Map(),
      periodClock: 0,
      totalGameSeconds: 0,
      clutchActive: false,
      overtimeCount: 0,
      isOvertime: false,
      homeScore: 0,
      awayScore: 0,
      gameLog: [],
      homeStats: this._initTeamStats(),
      awayStats: this._initTeamStats(),
    };

    const homeTeam = this._createTeam(homePlayers, 'home', g.homeCourtAdvantageFactor);
    const awayTeam = this._createTeam(awayPlayers, 'away', 1);
    gameState.homeTeam = homeTeam;
    gameState.awayTeam = awayTeam;

    // Substitution state
    gameState.homeActiveIds = [];
    gameState.homeBenchIds = [];
    gameState.awayActiveIds = [];
    gameState.awayBenchIds = [];
    gameState.lastHomeSubTime = -9999;
    gameState.lastAwaySubTime = -9999;

    // Initialize fatigue for all players
    for (const p of [...homePlayers, ...awayPlayers]) {
      gameState.homeFatigue.set(p.id, 0);
      gameState.awayFatigue.set(p.id, 0);
    }

    // Regulation quarters
    for (let q = 0; q < g.quarters; q++) {
      const period = `Q${q + 1}`;
      this._simulatePeriod(gameState, period, g.minutesPerQuarter, false);
      this._applyFatigueRecovery(gameState, config.fatigue.fatigueRecoveryPerQuarter);
    }

    // Overtime
    while (gameState.homeScore === gameState.awayScore && gameState.overtimeCount < g.maxOvertimes) {
      gameState.overtimeCount++;
      gameState.isOvertime = true;
      const period = `OT${gameState.overtimeCount}`;
      this._simulatePeriod(gameState, period, g.overtimeMinutes, true);
      this._applyFatigueRecovery(gameState, config.fatigue.fatigueRecoveryPerQuarter);
    }

    const homeBoxScores = this._generateBoxScoresFromStats(gameState, homePlayers, 'home');
    const awayBoxScores = this._generateBoxScoresFromStats(gameState, awayPlayers, 'away');

    return {
      homeScore: gameState.homeScore,
      awayScore: gameState.awayScore,
      winner: gameState.homeScore > gameState.awayScore ? 'home' : 'away',
      homeBoxScores,
      awayBoxScores,
      gameLog: gameState.gameLog,
      totalPossessions: gameState.homeStats.possessions + gameState.awayStats.possessions,
      overtime: gameState.isOvertime,
      overtimeCount: gameState.overtimeCount,
    };
  }

  // ── Lineup initialization for a period ──────────────────────────────
  static _setPeriodLineups(gameState, period) {
    const setSide = (teamSide) => {
      const players = gameState[teamSide + 'Team'].players;
      const sorted = [...players].sort((a, b) => b.overall_rating - a.overall_rating);
      const allIds = sorted.map(p => p.id);

      const starters = allIds.slice(0, 5);
      const bench = allIds.slice(5);

      if (period.startsWith('Q')) {
        const q = parseInt(period[1]);
        if (q === 1 || q === 3) {
          gameState[teamSide + 'ActiveIds'] = [...starters];
          gameState[teamSide + 'BenchIds'] = [...bench];
        } else if (q === 2 || q === 4) {
          const mixed = [starters[0], starters[1], starters[2], bench[0], bench[1]];
          gameState[teamSide + 'ActiveIds'] = mixed;
          gameState[teamSide + 'BenchIds'] = [
            ...starters.slice(3),
            ...bench.slice(2)
          ];
        }
      } else {
        // Overtime: pick 5 based on lowest fatigue and highest rating
        const fatigueMap = gameState[teamSide + 'Fatigue'];
        const candidates = allIds.map(id => {
          const player = players.find(p => p.id === id);
          return {
            id,
            fatigue: fatigueMap.get(id) || 0,
            rating: player.overall_rating || 0
          };
        });
        candidates.sort((a, b) => (a.fatigue - b.fatigue) || (b.rating - a.rating));
        gameState[teamSide + 'ActiveIds'] = candidates.slice(0, 5).map(c => c.id);
        gameState[teamSide + 'BenchIds'] = candidates.slice(5).map(c => c.id);
      }
    };
    setSide('home');
    setSide('away');
  }

  // ── Period simulation ────────────────────────────────────────────────
  static _simulatePeriod(gameState, periodName, minutes, isOvertime) {
    const g = gameState.config.global;
    gameState.periodClock = minutes * 60;
    const possessionsTotal = Math.floor(minutes * g.possessionsPerMinute * 2);
    const periodLog = [];

    this._setPeriodLineups(gameState, periodName);

    // Clutch detection
    if (gameState.periodClock <= g.clutchThresholdSeconds &&
        Math.abs(gameState.homeScore - gameState.awayScore) <= g.clutchScoreDiff) {
      gameState.clutchActive = true;
    } else {
      gameState.clutchActive = false;
    }

    let offense = gameState.homeTeam;
    let defense = gameState.awayTeam;
    let isHomeOffense = true;
    if (Math.random() > 0.5) {
      offense = gameState.awayTeam;
      defense = gameState.homeTeam;
      isHomeOffense = false;
    }

    for (let i = 0; i < possessionsTotal; i++) {
      gameState.periodClock -= 24;
      gameState.totalGameSeconds += 24;       // track elapsed game time
      if (gameState.periodClock <= 0) break;

      if (!gameState.clutchActive &&
          gameState.periodClock <= g.clutchThresholdSeconds &&
          Math.abs(gameState.homeScore - gameState.awayScore) <= g.clutchScoreDiff) {
        gameState.clutchActive = true;
      }

      const offSide = isHomeOffense ? 'home' : 'away';
      const defSide = isHomeOffense ? 'away' : 'home';
      const activeOffenseIds = isHomeOffense ? gameState.homeActiveIds : gameState.awayActiveIds;
      const activeDefenseIds = isHomeOffense ? gameState.awayActiveIds : gameState.homeActiveIds;

      const activeOffense = isHomeOffense
        ? gameState.homeTeam.players.filter(p => activeOffenseIds.includes(p.id))
        : gameState.awayTeam.players.filter(p => activeOffenseIds.includes(p.id));
      const activeDefense = isHomeOffense
        ? gameState.awayTeam.players.filter(p => activeDefenseIds.includes(p.id))
        : gameState.homeTeam.players.filter(p => activeDefenseIds.includes(p.id));

      this._applyFatigueTick(activeOffense, offSide, 24 / 60, gameState);
      this._applyFatigueTick(activeDefense, defSide, 24 / 60, gameState);

      const result = this._simulatePossession(activeOffense, activeDefense, isHomeOffense, gameState);

      if (isHomeOffense) {
        gameState.homeScore += result.points;
        gameState.homeStats.possessions++;
      } else {
        gameState.awayScore += result.points;
        gameState.awayStats.possessions++;
      }

      this._accumulateStats(gameState, result, isHomeOffense);
      this._updateMomentum(gameState, result);

      if (result.assist) {
        this._updateChemistry(gameState, isHomeOffense, gameState.config.chemistry.assistBonusPerGame || 0.005);
      }

      periodLog.push({
        period: periodName,
        possession: i + 1,
        team: isHomeOffense ? 'home' : 'away',
        clock: gameState.periodClock,
        ...result,
      });

      if (gameState.clutchActive && Math.random() < 0.1) {
        this._checkCriticalMoment(gameState, isHomeOffense, result);
      }

      // Perform substitutions based on current fatigue
      this._performSubstitutions(gameState, isHomeOffense, periodLog, periodName);

      if (!result.offensiveRebound) {
        isHomeOffense = !isHomeOffense;
        [offense, defense] = [defense, offense];
      }
    }

    gameState.gameLog.push(periodLog);
  }

  // ── Substitution logic ───────────────────────────────────────────────
  static _performSubstitutions(gameState, isHomePossession, periodLog, periodName) {
    const subConfig = gameState.config.substitutions || {};
    const teamSide = isHomePossession ? 'home' : 'away';
    const now = gameState.totalGameSeconds;
    const lastSubTime = teamSide === 'home' ? gameState.lastHomeSubTime : gameState.lastAwaySubTime;
    const cooldown = subConfig.subCooldownSeconds || 120;

    if (now - lastSubTime < cooldown) return;

    const activeIds = gameState[teamSide + 'ActiveIds'];
    const benchIds = gameState[teamSide + 'BenchIds'];
    const fatigueMap = gameState[teamSide + 'Fatigue'];
    const threshold = subConfig.fatigueThreshold || 0.65;

    let subOutId = null;
    let maxFatigue = 0;
    for (const id of activeIds) {
      const fatigue = fatigueMap.get(id) || 0;
      if (fatigue > threshold && fatigue > maxFatigue) {
        maxFatigue = fatigue;
        subOutId = id;
      }
    }

    if (!subOutId) return;

    const players = gameState[teamSide + 'Team'].players;
    const benchPlayers = players.filter(p => benchIds.includes(p.id));
    if (benchPlayers.length === 0) return;

    benchPlayers.sort((a, b) => {
      const fa = fatigueMap.get(a.id) || 0;
      const fb = fatigueMap.get(b.id) || 0;
      return fa - fb || b.overall_rating - a.overall_rating;
    });
    const subIn = benchPlayers[0];

    const idx = activeIds.indexOf(subOutId);
    activeIds.splice(idx, 1, subIn.id);
    const benchIdx = benchIds.indexOf(subIn.id);
    benchIds.splice(benchIdx, 1, subOutId);

    if (teamSide === 'home') gameState.lastHomeSubTime = now;
    else gameState.lastAwaySubTime = now;

    // Log substitution within the period log for accurate timeline
    periodLog.push({
      type: 'substitution',
      team: teamSide,
      period: periodName,
      clock: gameState.periodClock,
      out: subOutId,
      in: subIn.id,
    });
  }

  // ── Possession simulation (unchanged except for minor clarifications) ──
  static _simulatePossession(offense, defense, isHomePossession, gameState) {
    const config = gameState.config;
    const primaryHandler = this._selectPrimaryHandler(offense);
    const primaryDefender = this._selectPrimaryDefender(defense);
    const playType = this._selectPlayType(offense, defense, gameState);
    const defenseScheme = this._selectDefensiveScheme(defense);

    let shotResult;
    switch (playType) {
      case 'isolation':
        shotResult = this._executeIsolation(primaryHandler, primaryDefender, defenseScheme, gameState);
        break;
      case 'pick_and_roll': {
        const screener = this._selectScreener(offense);
        const rollDefender = this._selectRollDefender(defense);
        shotResult = this._executePickAndRoll(primaryHandler, screener, primaryDefender, rollDefender, defenseScheme, gameState);
        break;
      }
      case 'spot_up': {
        const shooter = this._selectShooter(offense);
        const defender = this._selectClosestDefender(defense, shooter);
        shotResult = this._executeSpotUp(shooter, defender, defenseScheme, gameState);
        break;
      }
      case 'post_up': {
        const postPlayer = this._selectPostPlayer(offense);
        const postDefender = this._selectClosestDefender(defense, postPlayer);
        shotResult = this._executePostUp(postPlayer, postDefender, defenseScheme, gameState);
        break;
      }
      case 'transition':
        shotResult = this._executeTransition(offense, defense, defenseScheme, gameState);
        break;
      default:
        shotResult = this._executeIsolation(primaryHandler, primaryDefender, defenseScheme, gameState);
    }

    const turnover = Math.random() < this._calculateTurnoverProbability(primaryHandler, primaryDefender, playType, gameState);
    const points = turnover ? 0 : shotResult.points;

    let offensiveRebound = false;
    if (shotResult.missed && !shotResult.isFoul) {
      offensiveRebound = this._checkOffensiveRebound(offense, defense, shotResult, gameState);
    }

    // Steal attribution
    let steal = null;
    if (turnover && Math.random() < 0.55) {
      steal = defense.reduce((best, p) => {
        let score = (p.steal_rating || p.perimeter_defense || 50);
        if (p.position === 'PG' || p.position === 'SG') score *= 1.2;
        else if (p.position === 'SF') score *= 1.1;
        else score *= 0.9;
        const bestScore = (best.steal_rating || best.perimeter_defense || 50) *
                          (best.position === 'PG' || best.position === 'SG' ? 1.2 : 1);
        return score > bestScore ? p : best;
      });
    }

    // Block attribution
    let block = null;
    if (!turnover && shotResult.missed && !shotResult.isFoul) {
      const baseProb =
        shotResult.shotType === 'rim' ? 0.08
        : shotResult.shotType === 'midRange' ? 0.025
        : 0.005;
      const blockCandidate = defense.reduce((best, p) => {
        let score = (p.blocks || 0) * 0.6 + (p.post_defense || 50) * 0.4;
        if (p.position === 'C') score *= 1.4;
        else if (p.position === 'PF') score *= 1.25;
        else if (p.position === 'SF') score *= 1.0;
        else score *= 0.8;
        const bestScore = (best.blocks || 0) * 0.6 + (best.post_defense || 50) * 0.4 +
                          (best.position === 'C' ? 0.4 : 0);
        return score > bestScore ? p : best;
      });
      const ratingFactor = (blockCandidate.blocks || 50) / 50;
      const blockProb = Math.min(0.30, baseProb * ratingFactor);
      if (Math.random() < blockProb) {
        block = blockCandidate;
      }
    }

    let fouler = null;
    if (shotResult.isFoul) {
      fouler = defense[Math.floor(Math.random() * defense.length)];
    }

    let assistedBy = null;
    if (shotResult.assist && !turnover) {
      const teammates = offense.filter(p => p.id !== primaryHandler.id);
      if (teammates.length) {
        const scores = teammates.map(p => p.passing || 50);
        const total = scores.reduce((s, v) => s + v, 0);
        let r = Math.random() * total;
        for (let i = 0; i < teammates.length; i++) {
          r -= scores[i];
          if (r <= 0) { assistedBy = teammates[i]; break; }
        }
        if (!assistedBy) assistedBy = teammates[teammates.length - 1];
      }
    }

    return {
      playType,
      points,
      shotResult,
      turnovers: turnover,
      handler: primaryHandler,
      defender: primaryDefender,
      assist: shotResult.assist || false,
      assistedBy,
      offensiveRebound,
      steal,
      block,
      fouler,
    };
  }

  // ── Defensive scheme selection ───────────────────────────────────────
  static _selectDefensiveScheme(defense) {
    const avgPerimeter = defense.reduce((s, p) => s + p.perimeter_defense, 0) / defense.length;
    const avgPost = defense.reduce((s, p) => s + p.post_defense, 0) / defense.length;
    if (avgPerimeter > 80 && avgPost > 80) return 'manToMan';
    if (avgPerimeter > 75) return 'switch';
    if (avgPost > 75) return 'drop';
    return 'manToMan';
  }

  // ── Offensive rebound check ──────────────────────────────────────────
  static _checkOffensiveRebound(offense, defense, shotResult, gameState) {
    const reb = gameState.config.rebounds;
    const shotType = shotResult.shotType || 'midRange';
    const offRebMod = reb.shotTypeOffReboundModifier[shotType] || 0.25;
    const baseOffRate = reb.offensiveReboundRateBase * offRebMod;

    const selectRebounder = (players) =>
      players.reduce((best, p) => {
        const score = p.rebounding * reb.rebounderRatingWeight +
                      (reb.positionReboundAdjustment[p.position] || 0.1);
        const bestScore = best.rebounding * reb.rebounderRatingWeight +
                          (reb.positionReboundAdjustment[best.position] || 0.1);
        return score > bestScore ? p : best;
      });

    const offRebounder = selectRebounder(offense);
    const defRebounder = selectRebounder(defense);

    const offRate = baseOffRate * (offRebounder.rebounding / 80);
    const defRate = (1 - baseOffRate) * (defRebounder.rebounding / 80);
    const total = offRate + defRate;
    return total > 0 && Math.random() < offRate / total;
  }

  // ── Player selection helpers (unused _selectLineup kept for compatibility) ──
  static _selectLineup(players, gameState, teamSide) {
    const fatigueMap = teamSide === 'home' ? gameState.homeFatigue : gameState.awayFatigue;
    const sorted = [...players].sort((a, b) => b.overall_rating - a.overall_rating);
    const lineup = [];
    const bench = [];
    for (const p of sorted) {
      const fatigue = fatigueMap.get(p.id) || 0;
      if (lineup.length < 5 && fatigue < 0.7) {
        lineup.push(p);
      } else {
        bench.push(p);
      }
    }
    while (lineup.length < 5 && bench.length) {
      lineup.push(bench.shift());
    }
    return lineup.slice(0, 5);
  }

  static _selectPrimaryHandler(players) {
    const scores = players.map(p => {
      let base = (p.ball_handling || 50) * 0.6 + (p.passing || 50) * 0.4;
      if (p.position === 'PG') base *= 1.2;
      else if (p.position === 'SG' || p.position === 'SF') base *= 1.1;
      return Math.pow(base, 2);
    });
    const total = scores.reduce((s, v) => s + v, 0);
    let r = Math.random() * total;
    for (let i = 0; i < players.length; i++) {
      r -= scores[i];
      if (r <= 0) return players[i];
    }
    return players[players.length - 1];
  }

  static _selectPrimaryDefender(players) {
    return players.reduce((best, p) =>
      (p.perimeter_defense * 0.7 + p.speed * 0.3) > (best.perimeter_defense * 0.7 + best.speed * 0.3) ? p : best
    );
  }

  static _selectScreener(players) {
    return players.reduce((best, p) =>
      (p.inside_scoring * 0.5 + p.rebounding * 0.3 + p.strength * 0.2) > (best.inside_scoring * 0.5 + best.rebounding * 0.3 + best.strength * 0.2) ? p : best
    );
  }

  static _selectRollDefender(players) {
    return players.reduce((best, p) =>
      (p.post_defense * 0.6 + p.rebounding * 0.4) > (best.post_defense * 0.6 + best.rebounding * 0.4) ? p : best
    );
  }

  static _selectShooter(players) {
    const scores = players.map(p => {
      let base = (p.three_point || 50) * 0.7 + (p.mid_range || 50) * 0.3;
      if (p.position === 'SG' || p.position === 'SF') base *= 1.15;
      if (p.position === 'PG') base *= 1.05;
      return Math.pow(base, 1.8);
    });
    const total = scores.reduce((s, v) => s + v, 0);
    let r = Math.random() * total;
    for (let i = 0; i < players.length; i++) {
      r -= scores[i];
      if (r <= 0) return players[i];
    }
    return players[players.length - 1];
  }

  static _selectPostPlayer(players) {
    return players.reduce((best, p) =>
      (p.inside_scoring * 0.5 + p.strength * 0.3 + p.post_defense * 0.2) > (best.inside_scoring * 0.5 + best.strength * 0.3 + best.post_defense * 0.2) ? p : best
    );
  }

  static _selectClosestDefender(players) {
    return players.reduce((best, p) =>
      (p.speed * 0.6 + p.perimeter_defense * 0.4) > (best.speed * 0.6 + best.perimeter_defense * 0.4) ? p : best
    );
  }

  // ── Play type selection ─────────────────────────────────────────────
  static _selectPlayType(offense, defense, gameState) {
    const threeAvg = offense.reduce((s, p) => s + p.three_point, 0) / offense.length;
    const insideAvg = offense.reduce((s, p) => s + p.inside_scoring, 0) / offense.length;
    const passAvg = offense.reduce((s, p) => s + p.passing, 0) / offense.length;

    const weights = {
      isolation: 20 + (gameState.isOvertime ? 20 : 0),
      pick_and_roll: 30 + (passAvg > 80 ? 15 : 0),
      spot_up: 25 + (threeAvg > 80 ? 15 : 0),
      post_up: 20 + (insideAvg > 80 ? 15 : 0),
      transition: 5,
    };
    if (gameState.isOvertime) weights.pick_and_roll -= 10;

    if (gameState.momentum > 0.3) {
      weights.transition += 5;
      weights.isolation += 5;
    }

    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (const [play, w] of Object.entries(weights)) {
      r -= w;
      if (r <= 0) return play;
    }
    return 'isolation';
  }

  // ── Turnover probability ────────────────────────────────────────────
  static _calculateTurnoverProbability(handler, defender, playType, gameState) {
    const tm = gameState.config.turnoverModel;
    const handlerSkill = handler.ball_handling * tm.handlerSkillWeight.ballHandling +
                        handler.passing * tm.handlerSkillWeight.passing;
    const defSkill = defender.perimeter_defense * tm.defenderSkillWeight.perimeterDefense +
                    (defender.steal_rating || 50) * tm.defenderSkillWeight.stealRating;
    const skillDiff = (defSkill - handlerSkill) / 100;
    
    let rate = tm.baseRate * 1.5 + skillDiff * tm.skillDiffScale * 1.8;
    rate += (tm.playTypeModifiers[playType] || 0);

    const fatigue = gameState.homeFatigue.get(handler.id) || gameState.awayFatigue.get(handler.id) || 0;
    rate += fatigue * gameState.config.fatigue.fatigueEffectOnTurnoverRate;
    rate -= gameState.momentum * Math.abs(gameState.config.momentumSystem.momentumEffectOnTurnoverRate);

    return Math.min(tm.maxRate, Math.max(tm.minRate, rate));
  }

  // ── Shot quality calculation (FIXED: cap removed) ──────────────────
  static _calculateShotQuality(player, defender, playType, gameState, defenseScheme = 'manToMan') {
    const sqc = gameState.config.shotQualityCalculation;
    const mapAttr = (camel) => camel.replace(/([A-Z])/g, '_$1').toLowerCase();

    const getOffWeights = () => {
      if (playType === 'pick_and_roll') return sqc.offensiveSkillWeights.pick_and_roll.handler;
      return sqc.offensiveSkillWeights[playType] || sqc.offensiveSkillWeights.isolation;
    };
    const getDefWeights = () => {
      if (playType === 'pick_and_roll') return sqc.defensiveSkillWeights.pick_and_roll.handlerDefender;
      return sqc.defensiveSkillWeights[playType] || sqc.defensiveSkillWeights.isolation;
    };

    const offWeights = getOffWeights();
    let offSkill = 0;
    for (const [skill, w] of Object.entries(offWeights)) {
      const attr = mapAttr(skill);
      offSkill += (player[attr] || 0) * w;
    }

    const defWeights = getDefWeights();
    let defSkill = 0;
    for (const [skill, w] of Object.entries(defWeights)) {
      const attr = mapAttr(skill);
      defSkill += (defender[attr] || 0) * w;
    }

    let posFactor = 1;
    if (player.position && defender.position && sqc.positionAdvantageMatrix) {
      posFactor = sqc.positionAdvantageMatrix[player.position]?.[defender.position] || 1;
    }

    let quality = (offSkill / 100) * 0.7 - (defSkill / 100) * 0.3;
    quality = Math.max(0, Math.min(1, quality + sqc.baseQualityOffset)) * posFactor;
    quality += (Math.random() - 0.5) * sqc.randomnessFactor;

    const chemistry = gameState.homeChemistry || gameState.awayChemistry;
    quality += chemistry * gameState.config.chemistry.chemistryEffectOnShotQuality;
    quality += gameState.momentum * gameState.config.momentumSystem.momentumEffectOnSuccess;

    const fatigue = gameState.homeFatigue.get(player.id) || gameState.awayFatigue.get(player.id) || 0;
    quality += fatigue * gameState.config.fatigue.fatigueEffectOnShotQuality;

    const schemeMod = gameState.config.defensiveSchemes[defenseScheme] || {};
    const schemeKey = playType === 'pick_and_roll' ? 'pickAndRollMod' : playType + 'Mod';
    quality += (schemeMod[schemeKey] || 0);

    // Clamp to [0, 1] to prevent extremes; no artificial ceiling at 0.19
    return Math.min(1.0, Math.max(0.0, quality));
  }

  // ── Shot attempt (with improved baseMakeRate) ───────────────────────
  static _attemptShot(player, defender, shotQuality, playType, gameState) {
    const config = gameState.config;
    const ff = config.foulAndFreeThrow;
    const playCfg = config.plays[playType] || {};

    const dist = playCfg.shotDistribution || { midRange: 0.5, threePoint: 0.3, rim: 0.2 };
    const rand = Math.random();
    let shotType, isThree;
    if (rand < (dist.threePoint || 0)) {
      shotType = 'threePoint';
      isThree = true;
    } else if (rand < (dist.threePoint || 0) + (dist.midRange || 0)) {
      shotType = 'midRange';
      isThree = false;
    } else {
      shotType = 'rim';
      isThree = false;
    }

    // Foul
    const foulBase = ff.foulPerPlayType[playType] || ff.baseFoulProbability;
    const foulProb = foulBase + (1 - defender.perimeter_defense / 100) * ff.defenderDisciplineFactor;
    if (Math.random() < foulProb) {
      const isThreeFoul = isThree && Math.random() < ff.threePointFoulChance;
      const isAndOne = !isThreeFoul && Math.random() < ff.andOneChanceOnFoul;
      const ftAttempts = isThreeFoul ? 3 : (isAndOne ? 1 : 2);
      const ftBase   = (typeof ff.freeThrowBase        === 'number') ? ff.freeThrowBase        : 0.68;
      const ftWeight = (typeof ff.freeThrowSkillWeight === 'number') ? ff.freeThrowSkillWeight : 0.14;
      const ftSkill  = (typeof player.three_point === 'number' && player.three_point > 0)
                         ? player.three_point
                         : (typeof player.mid_range === 'number' && player.mid_range > 0)
                           ? player.mid_range * 0.9
                           : 68;
      const ftMakeRate = Math.min(0.94, Math.max(0.60, ftBase + (ftSkill / 100) * ftWeight));
      let ftm = 0;
      for (let i = 0; i < ftAttempts; i++) {
        if (Math.random() < ftMakeRate) ftm++;
      }
      return {
        points: ftm,
        fga: 0, fgm: 0, fga3: 0, fgm3: 0,
        fta: ftAttempts, ftm,
        shotQuality, isFoul: true, missed: false,
        shotType, assist: false
      };
    }

    // Regular shot – baseMakeRate uses larger coefficient for realistic percentages
    const baseMakeRate = 0.50 + shotQuality * 0.22;   // range ~0.50–0.72

    const threeAttr  = (typeof player.three_point    === 'number' && player.three_point    > 0) ? player.three_point    : 70;
    const insideAttr = (typeof player.inside_scoring === 'number' && player.inside_scoring > 0) ? player.inside_scoring : 70;
    const midAttr    = (typeof player.mid_range      === 'number' && player.mid_range      > 0) ? player.mid_range      : 68;

    let makeRate;
    if (isThree) {
      makeRate = baseMakeRate * (threeAttr / 99) * 0.78;
      makeRate = Math.min(0.54, Math.max(0.26, makeRate));
    } else if (shotType === 'rim') {
      makeRate = baseMakeRate * (insideAttr / 99) * 1.28;
      makeRate = Math.min(0.84, Math.max(0.44, makeRate));
    } else {
      makeRate = baseMakeRate * (midAttr / 99) * 0.92;
      makeRate = Math.min(0.66, Math.max(0.30, makeRate));
    }

    makeRate = Math.min(0.78, Math.max(0.08, makeRate));
    const made = Math.random() < makeRate;

    const assistProb = playCfg.assistProbability || 0.3;
    let adjustedAssistProb = assistProb;
    if (playType === 'pick_and_roll') adjustedAssistProb += 0.15;
    if (playType === 'spot_up') adjustedAssistProb += 0.10;
    const isAssist = made && Math.random() < adjustedAssistProb;

    return {
      points: made ? (isThree ? 3 : 2) : 0,
      fga: isThree ? 0 : 1, fgm: (made && !isThree) ? 1 : 0,
      fga3: isThree ? 1 : 0, fgm3: (made && isThree) ? 1 : 0,
      fta: 0, ftm: 0,
      shotQuality, isFoul: false,
      missed: !made,
      shotType,
      assist: isAssist
    };
  }

  static _selectDefensiveRebounder(defense) {
    return defense.reduce((best, p) => {
      let score = (p.rebounding || 50) * 0.8;
      if (p.position === 'C') score *= 1.3;
      else if (p.position === 'PF') score *= 1.2;
      else if (p.position === 'SF') score *= 1.0;
      else score *= 0.9;
      const bestScore = (best.rebounding || 50) * 0.8 + 
                        (best.position === 'C' ? 0.3 : best.position === 'PF' ? 0.2 : 0);
      return score > bestScore ? p : best;
    });
  }

  // ── Play executions ─────────────────────────────────────────────────
  static _executeIsolation(handler, defender, scheme, gameState) {
    const qual = this._calculateShotQuality(handler, defender, 'isolation', gameState, scheme);
    return this._attemptShot(handler, defender, qual, 'isolation', gameState);
  }

  static _executePickAndRoll(handler, screener, defender, rollDefender, scheme, gameState) {
    const playCfg = gameState.config.plays.pick_and_roll;
    const rollSuccess = (screener.inside_scoring + screener.strength) / 200;
    const defQuality = (rollDefender.post_defense + rollDefender.rebounding) / 200;
    if (Math.random() < rollSuccess * (1 - defQuality * 0.5)) {
      const qual = this._calculateShotQuality(screener, rollDefender, 'post_up', gameState, scheme);
      return this._attemptShot(screener, rollDefender, qual, 'post_up', gameState);
    } else {
      const qual = this._calculateShotQuality(handler, defender, 'isolation', gameState, scheme);
      return this._attemptShot(handler, defender, qual, 'isolation', gameState);
    }
  }

  static _executeSpotUp(shooter, defender, scheme, gameState) {
    const qual = this._calculateShotQuality(shooter, defender, 'spot_up', gameState, scheme);
    return this._attemptShot(shooter, defender, qual, 'spot_up', gameState);
  }

  static _executePostUp(postPlayer, defender, scheme, gameState) {
    const qual = this._calculateShotQuality(postPlayer, defender, 'post_up', gameState, scheme);
    return this._attemptShot(postPlayer, defender, qual, 'post_up', gameState);
  }

  static _executeTransition(offense, defense, scheme, gameState) {
    const player = offense[Math.floor(Math.random() * offense.length)];
    const defender = defense[Math.floor(Math.random() * defense.length)];
    const qual = this._calculateShotQuality(player, defender, 'transition', gameState, scheme);
    return this._attemptShot(player, defender, qual, 'transition', gameState);
  }

  // ── Momentum, chemistry, fatigue ────────────────────────────────────
  static _updateMomentum(gameState, result) {
    const ms = gameState.config.momentumSystem;
    let delta = 0;
    if (result.points >= 2) {
      delta += ms.runBonusPerPoint * result.points;
      if (result.points >= 3) delta += ms.bigPlayBonus.threePointer || 0.04;
    }
    if (result.turnovers) delta -= 0.02;
    delta -= ms.decayRatePerMinute * (24 / 60);
    gameState.momentum = Math.max(ms.minMomentum, Math.min(ms.maxMomentum, gameState.momentum + delta));
  }

  static _updateChemistry(gameState, isHome, amount) {
    const chem = gameState.config.chemistry;
    if (isHome) {
      gameState.homeChemistry = Math.min(chem.maxChemistry, gameState.homeChemistry + amount);
    } else {
      gameState.awayChemistry = Math.min(chem.maxChemistry, gameState.awayChemistry + amount);
    }
  }

  static _applyFatigueTick(players, teamSide, minutes, gameState) {
    const fm = gameState.config.fatigue;
    const map = teamSide === 'home' ? gameState.homeFatigue : gameState.awayFatigue;
    for (const p of players) {
      const baseRate = fm.baseFatiguePerMinute * (fm.positionFatigueFactor[p.position] || 1);
      let increase = baseRate * minutes;
      if (gameState.clutchActive) increase *= fm.clutchFatigueReduction;
      const current = map.get(p.id) || 0;
      map.set(p.id, Math.min(1, current + increase));
    }
  }

  static _applyFatigueRecovery(gameState, amount) {
    for (const map of [gameState.homeFatigue, gameState.awayFatigue]) {
      for (const [id, val] of map.entries()) {
        map.set(id, Math.max(0, val - amount));
      }
    }
  }

  // ── Critical moments ────────────────────────────────────────────────
  static _checkCriticalMoment(gameState, isHomeOffense, result) {
    const cmList = gameState.config.criticalMoments;
    if (!cmList || cmList.length === 0) return;
    const moment = cmList[Math.floor(Math.random() * cmList.length)];
    if (Math.random() < (moment.prob || 0.1)) {
      if (moment.name === 'clutch_three' && (!result.shotResult || result.shotResult.missed)) {
        result.points = 3;
        result.shotResult = { points: 3, fga3: 1, fgm3: 1, missed: false, assist: false, shotType: 'threePoint' };
        result.turnovers = false;
      }
      const lastLog = gameState.gameLog[gameState.gameLog.length - 1];
      if (lastLog) lastLog.criticalMoment = moment.name;
    }
  }

  // ── Stats accumulation ──────────────────────────────────────────────
  static _initTeamStats() {
    return {
      possessions: 0,
      playerStats: new Map()
    };
  }

  static _accumulateStats(gameState, result, isHomeOffense) {
    const offStats = isHomeOffense ? gameState.homeStats : gameState.awayStats;
    const defStats = isHomeOffense ? gameState.awayStats : gameState.homeStats;

    const ensure = (statsObj, id) => {
      if (!statsObj.playerStats.has(id)) {
        statsObj.playerStats.set(id, {
          fga: 0, fgm: 0, fga3: 0, fgm3: 0,
          fta: 0, ftm: 0, points: 0,
          oreb: 0, dreb: 0,
          assists: 0, steals: 0, blocks: 0,
          turnovers: 0, fouls: 0,
        });
      }
    };

    const handler = result.handler;
    const sr = result.shotResult;

    ensure(offStats, handler.id);
    const ps = offStats.playerStats.get(handler.id);

    if (!result.turnovers && sr) {
      ps.fga += sr.fga || 0;
      ps.fgm += sr.fgm || 0;
      ps.fga3 += sr.fga3 || 0;
      ps.fgm3 += sr.fgm3 || 0;
      ps.fta += sr.fta || 0;
      ps.ftm += sr.ftm || 0;
      ps.points += result.points || 0;
    }

    if (result.turnovers) ps.turnovers++;

    if (result.assist && result.assistedBy) {
      ensure(offStats, result.assistedBy.id);
      offStats.playerStats.get(result.assistedBy.id).assists++;
    }

    if (result.offensiveRebound) {
      const bigs = [handler];
      ensure(offStats, bigs[0].id);
      offStats.playerStats.get(bigs[0].id).oreb++;
    }

    if (sr && sr.missed && !sr.isFoul && !result.offensiveRebound && !result.block && result.defender) {
      ensure(defStats, result.defender.id);
      defStats.playerStats.get(result.defender.id).dreb++;
    }

    if (result.steal) {
      ensure(defStats, result.steal.id);
      defStats.playerStats.get(result.steal.id).steals++;
    }

    if (result.block) {
      ensure(defStats, result.block.id);
      defStats.playerStats.get(result.block.id).blocks++;
      ensure(defStats, result.block.id);
      defStats.playerStats.get(result.block.id).dreb++;
    }

    if (result.fouler) {
      ensure(defStats, result.fouler.id);
      defStats.playerStats.get(result.fouler.id).fouls++;
    }
  }

  // ── Team creation ───────────────────────────────────────────────────
  static _createTeam(players, teamType, advantage) {
    const boostAttrs = ['overall_rating','three_point','mid_range','inside_scoring','passing',
                        'ball_handling','perimeter_defense','post_defense','rebounding','speed','strength'];
    return {
      players: players.map(p => {
        if (teamType !== 'home') return { ...p };
        const boosted = { ...p };
        for (const attr of boostAttrs) {
          if (p[attr] !== undefined) {
            boosted[attr] = Math.min(99, p[attr] * advantage);
          }
        }
        return boosted;
      }),
    };
  }

  // ── Box score generation ────────────────────────────────────────────
  static _generateBoxScoresFromStats(gameState, players, teamSide) {
    const stats = teamSide === 'home' ? gameState.homeStats : gameState.awayStats;
    const score = teamSide === 'home' ? gameState.homeScore : gameState.awayScore;
    const oppScore = teamSide === 'home' ? gameState.awayScore : gameState.homeScore;
    const scoreDiff = score - oppScore;
    const totalMinutes = 48 * 5;
    const fatigueMap = teamSide === 'home' ? gameState.homeFatigue : gameState.awayFatigue;

    const sorted = [...players].sort((a, b) => (b.overall_rating || 0) - (a.overall_rating || 0));
    const rankOf = new Map(sorted.map((p, i) => [p.id, i]));

    const playerMinutes = new Map();
    for (const p of players) {
      const rank = rankOf.get(p.id) ?? players.length;
      const fatigue = fatigueMap.get(p.id) || 0;
      let base;
      if (rank <= 1) base = 30 + ((p.overall_rating || 70) - 70) * 0.30;
      else if (rank <= 4) base = 24 + ((p.overall_rating || 65) - 65) * 0.25;
      else if (rank <= 8) base = 13 + ((p.overall_rating || 60) - 60) * 0.20;
      else base = 2 + ((p.overall_rating || 50) - 50) * 0.10;
      playerMinutes.set(p.id, Math.max(1, Math.round(base - fatigue * 6)));
    }
    const totalAlloc = [...playerMinutes.values()].reduce((a, b) => a + b, 0);
    const scale = totalMinutes / totalAlloc;

    return players.map(p => {
      const mins = Math.round((playerMinutes.get(p.id) || 0) * scale);
      const ps = stats.playerStats.get(p.id) || {
        fga:0,fgm:0,fga3:0,fgm3:0,fta:0,ftm:0,points:0,rebounds:0,oreb:0,dreb:0,
        assists:0,steals:0,blocks:0,turnovers:0,fouls:0
      };
      const plusMinus = Math.round(scoreDiff * (p.overall_rating/100) * (mins/48) + (Math.random()-0.5)*4);
      return {
        player_id: p.id,
        team_id: p.team_id,
        minutes_played: mins,
        points: ps.points,
        rebounds: (ps.oreb || 0) + (ps.dreb || 0),
        offensive_rebounds: ps.oreb || 0,
        defensive_rebounds: ps.dreb || 0,
        assists: ps.assists,
        steals: ps.steals,
        blocks: ps.blocks,
        turnovers: ps.turnovers,
        personal_fouls: ps.fouls,
        plus_minus: plusMinus,
        fga: ps.fga, fgm: ps.fgm,
        fga_3: ps.fga3, fgm_3: ps.fgm3,
        fta: ps.fta, ftm: ps.ftm,
      };
    });
  }

  // ── Config merging ──────────────────────────────────────────────────
  static _mergeConfig(overrides) {
    const base = JSON.parse(JSON.stringify(gameData));
    this._deepMerge(base, overrides);
    return base;
  }

  static _deepMerge(target, source) {
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        this._deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }
}

module.exports = GameSimulationEngine;