// services/gameSimulationEngine.js

/**
 * Advanced Basketball Game Simulation Engine
 * Fully config‑driven with realistic systems:
 * – momentum, chemistry, fatigue
 * – detailed play types, turnover model, foul drawing, rebounds
 * – defensive schemes, clutch moments, home crowd intangibles
 * – automatic substitutions based on fatigue and depth
 * – Markov-chain play calling, weighted passing/defensive graphs,
 *   and Bayesian (Beta-Binomial) per-player shooting models
 *
 * Configuration is loaded from src/data/gameData.json
 */

const gameData = require('../../data/gameData.json');
const { MarkovChain, WeightedDirectedGraph, PlayerShotModelRegistry } = require('./mathModels');

const PLAY_TYPES = ['isolation', 'pick_and_roll', 'spot_up', 'post_up', 'transition', 'cut'];

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

      // ── New: per-team Markov chains over play types, seeded from the
      // static weight table so day-one behaviour matches the old model,
      // but the chain drifts as the game unfolds (Bayesian updating). ──
      homePlayChain: this._buildPlayChainPrior(),
      awayPlayChain: this._buildPlayChainPrior(),
      homeLastPlay: 'isolation',
      awayLastPlay: 'isolation',

      // ── New: passing networks (weighted directed graphs) per team.
      // Edge weight = likelihood of A passing to B; built from passing/
      // chemistry ratings and reinforced by successful assists. ──
      homePassGraph: new WeightedDirectedGraph(),
      awayPassGraph: new WeightedDirectedGraph(),

      // ── New: Bayesian per-player, per-zone shot models (Beta-Binomial).
      // These let hot/cold streaks emerge from actual makes/misses rather
      // than being purely re-derived from static ratings every possession.
      shotModels: new PlayerShotModelRegistry(),
    };

    const homeTeam = this._createTeam(homePlayers, 'home', g.homeCourtAdvantageFactor);
    const awayTeam = this._createTeam(awayPlayers, 'away', 1);
    gameState.homeTeam = homeTeam;
    gameState.awayTeam = awayTeam;

    gameState.homeLineup = options.homeLineup || null;
    gameState.awayLineup = options.awayLineup || null;

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

    // Seed passing graphs from static passing/chemistry ratings
    this._seedPassGraph(gameState.homePassGraph, homeTeam.players);
    this._seedPassGraph(gameState.awayPassGraph, awayTeam.players);

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

  // ── Markov chain prior, derived from the same base weights the old
  // _selectPlayType used, so behaviour is backward-compatible at tip-off. ──
  static _buildPlayChainPrior() {
    const baseWeights = {
      isolation: 10, pick_and_roll: 25, spot_up: 22,
      post_up: 8, transition: 18, cut: 17,
    };
    const priorCounts = {};
    for (const from of PLAY_TYPES) {
      priorCounts[from] = {};
      for (const to of PLAY_TYPES) {
        // Slight inertia: repeating the same play type that just worked is
        // marginally favored (teams "ride the hot hand" play-type-wise).
        priorCounts[from][to] = baseWeights[to] * (from === to ? 1.15 : 1.0);
      }
    }
    return new MarkovChain(PLAY_TYPES, priorCounts);
  }

  // ── Seed a team's passing graph from ball-handling/passing ratings and
  // positional fit chemistry so early-game ball movement isn't uniform. ──
  static _seedPassGraph(graph, players) {
    const chemMatrix = gameData.chemistry.positionalFitMatrix;
    for (const a of players) {
      for (const b of players) {
        if (a.id === b.id) continue;
        const receiverScore = (b.three_point || 50) * 0.35 + (b.inside_scoring || 50) * 0.35 + (b.overall_rating || 50) * 0.30;
        const passerSkill = (a.passing || 50) / 100;
        const fit = (chemMatrix[a.position] && chemMatrix[a.position][b.position]) || 0.02;
        const weight = passerSkill * receiverScore * (1 + fit * 4);
        graph.setEdge(a.id, b.id, Math.max(0.5, weight));
      }
    }
  }

  static _setPeriodLineups(gameState, period) {
    const setSide = (teamSide) => {
      const players = gameState[teamSide + 'Team'].players;
      const lineup = gameState[teamSide + 'Lineup'];
      const validIds = new Set(players.map(p => p.id));

      let starters, bench;
      if (lineup && Array.isArray(lineup.starters) && lineup.starters.length === 5) {
        starters = lineup.starters.filter(id => validIds.has(id));
        bench = (Array.isArray(lineup.rotation) ? lineup.rotation : [])
          .filter(id => validIds.has(id) && !starters.includes(id));

        // Anyone not in starters/rotation (shouldn't normally happen) still plays
        const accounted = new Set([...starters, ...bench]);
        for (const p of players) {
          if (!accounted.has(p.id)) bench.push(p.id);
        }
        // Safety net: if the supplied lineup is malformed/short, top off from ratings
        if (starters.length < 5) {
          const sorted = [...players].sort((a, b) => b.overall_rating - a.overall_rating);
          for (const p of sorted) {
            if (starters.length >= 5) break;
            if (!starters.includes(p.id)) {
              starters.push(p.id);
              bench = bench.filter(id => id !== p.id);
            }
          }
        }
      } else {
        const sorted = [...players].sort((a, b) => b.overall_rating - a.overall_rating);
        const allIds = sorted.map(p => p.id);
        starters = allIds.slice(0, 5);
        bench = allIds.slice(5);
      }

      if (period.startsWith('Q')) {
        const q = parseInt(period[1]);
        if (q === 1 || q === 3) {
          gameState[teamSide + 'ActiveIds'] = [...starters];
          gameState[teamSide + 'BenchIds'] = [...bench];
        } else if (q === 2 || q === 4) {
          const mixed = [starters[0], starters[1], starters[2], bench[0], bench[1]].filter(Boolean);
          gameState[teamSide + 'ActiveIds'] = mixed;
          gameState[teamSide + 'BenchIds'] = [...starters.slice(3), ...bench.slice(2)].filter(Boolean);
        }
      } else {
        // Overtime: best available 5 by lowest fatigue / highest rating, regardless of lineup
        const fatigueMap = gameState[teamSide + 'Fatigue'];
        const candidates = players.map(p => ({
          id: p.id,
          fatigue: fatigueMap.get(p.id) || 0,
          rating: p.overall_rating || 0,
        }));
        candidates.sort((a, b) => (a.fatigue - b.fatigue) || (b.rating - a.rating));
        gameState[teamSide + 'ActiveIds'] = candidates.slice(0, 5).map(c => c.id);
        gameState[teamSide + 'BenchIds'] = candidates.slice(5).map(c => c.id);
      }
    };
    setSide('home');
    setSide('away');
  }

  // ── Period simulation (revised with realistic possession times) ──────
  static _simulatePeriod(gameState, periodName, minutes, isOvertime) {
    const g = gameState.config.global;
    gameState.periodClock = minutes * 60; // seconds remaining
    const possessionsTotal = Math.floor(minutes * g.possessionsPerMinute * 2);
    const periodLog = [];

    this._setPeriodLineups(gameState, periodName);

    // Initial clutch detection
    if (gameState.periodClock <= g.clutchThresholdSeconds &&
        Math.abs(gameState.homeScore - gameState.awayScore) <= g.clutchScoreDiff) {
      gameState.clutchActive = true;
    } else {
      gameState.clutchActive = false;
    }

    let offense = gameState.homeTeam;
    let defense = gameState.awayTeam;
    let isHomeOffense = Math.random() > 0.5 ? false : true;

    for (let i = 0; i < possessionsTotal; i++) {
      // Realistic possession duration (~14.5 sec avg)
      const possessionDuration = Math.min(
        24.0,
        Math.max(6.0, this._randomNormal(14.5, 3.5))
      );
      gameState.periodClock -= possessionDuration;
      gameState.totalGameSeconds += possessionDuration;

      if (gameState.periodClock <= 0) break;

      // Update clutch if crossing threshold during this possession
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

      // Fatigue based on actual time on floor
      this._applyFatigueTick(activeOffense, offSide, possessionDuration / 60, gameState);
      this._applyFatigueTick(activeDefense, defSide, possessionDuration / 60, gameState);

      const result = this._simulatePossession(activeOffense, activeDefense, isHomeOffense, gameState);

      if (isHomeOffense) {
        gameState.homeScore += result.points;
        gameState.homeStats.possessions++;
      } else {
        gameState.awayScore += result.points;
        gameState.awayStats.possessions++;
      }

      this._accumulateStats(gameState, result, isHomeOffense);
      this._updateMomentum(gameState, result, isHomeOffense);

      // ── Markov chain update: record the transition from the team's last
      // play type to this one, then reinforce/punish based on outcome so
      // the chain adapts to what's actually working tonight. ──
      {
        const chainKey = isHomeOffense ? 'homePlayChain' : 'awayPlayChain';
        const lastKey = isHomeOffense ? 'homeLastPlay' : 'awayLastPlay';
        const chain = gameState[chainKey];
        const lastPlay = gameState[lastKey];
        chain.update(lastPlay, result.playType, 1);
        if (result.points > 0 && !result.turnovers) {
          chain.reinforce(lastPlay, result.playType, 0.35 * (result.points / 2));
        } else if (result.turnovers) {
          chain.reinforce(lastPlay, result.playType, -0.5);
        }
        gameState[lastKey] = result.playType;
      }

      // ── Passing graph reinforcement: strengthen the handler -> assister
      // edge on a successful assist, weaken it slightly on a turnover. ──
      {
        const graph = isHomeOffense ? gameState.homePassGraph : gameState.awayPassGraph;
        if (result.assist && result.assistedBy && result.handler) {
          graph.addToEdge(result.handler.id, result.assistedBy.id, 0.6);
        }
        if (result.turnovers && result.handler) {
          // Diffuse ball-dominance away from a handler who just turned it over
          for (const [to] of graph.neighbors(result.handler.id)) {
            graph.addToEdge(result.handler.id, to, -0.05);
          }
        }
      }

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

      // Perform substitutions for both teams only on change of possession
      if (!result.offensiveRebound) {
        this._performSubstitutions(gameState, 'home', periodLog, periodName);
        this._performSubstitutions(gameState, 'away', periodLog, periodName);
        isHomeOffense = !isHomeOffense;
        [offense, defense] = [defense, offense];
      }
    }

    gameState.gameLog.push(periodLog);
  }

  // ── Substitution logic (called for a specific team) ──────────────────
  static _performSubstitutions(gameState, teamSide, periodLog, periodName) {
    const subConfig = gameState.config.substitutions || {};
    const now = gameState.totalGameSeconds;
    const lastSubTime = teamSide === 'home' ? gameState.lastHomeSubTime : gameState.lastAwaySubTime;
    const cooldown = subConfig.subCooldownSeconds || 120;

    if (now - lastSubTime < cooldown) return;

    const activeIds = gameState[teamSide + 'ActiveIds'];
    const benchIds = gameState[teamSide + 'BenchIds'];
    const fatigueMap = gameState[teamSide + 'Fatigue'];
    const threshold = subConfig.fatigueThreshold || 0.68;

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

    periodLog.push({
      type: 'substitution',
      team: teamSide,
      period: periodName,
      clock: gameState.periodClock,
      out: subOutId,
      in: subIn.id,
    });
  }

  // ── Possession simulation (revised with new play types & helpers) ────
  static _simulatePossession(offense, defense, isHomePossession, gameState) {
      const config = gameState.config;
      const primaryHandler = this._selectPrimaryHandler(offense);
      const primaryDefender = this._selectPrimaryDefender(defense);
      const playType = this._selectPlayType(offense, defense, gameState, isHomePossession);
      const defenseScheme = this._selectDefensiveScheme(defense);

      // ── Execute the play ──────────────────────────────────────────
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
          const shooter = this._selectShooter(offense, gameState, isHomePossession, primaryHandler);
          const defender = this._selectClosestDefender(defense);
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
        case 'cut':
          shotResult = this._executeCut(offense, defense, defenseScheme, gameState);
          break;
        default:
          shotResult = this._executeIsolation(primaryHandler, primaryDefender, defenseScheme, gameState);
      }

      // ── Turnover check ────────────────────────────────────────────
      const turnover = Math.random() < this._calculateTurnoverProbability(primaryHandler, primaryDefender, playType, gameState);
      const points = turnover ? 0 : shotResult.points;

      // ── Offensive rebound (only when shot missed, no foul) ────────
      let offensiveRebound = false;
      let offRebounderId = null;
      if (shotResult.missed && !shotResult.isFoul) {
        const orebCheck = this._checkOffensiveRebound(offense, defense, shotResult, gameState);
        offensiveRebound = orebCheck.success;
        offRebounderId = orebCheck.rebounderId;
      }

      // ── Steal attribution (consistent scoring) ────────────────────
      const stealScore = (p) => {
        let base = (p.steal_rating || p.perimeter_defense || 50);
        if (p.position === 'PG' || p.position === 'SG') base *= 1.2;
        else if (p.position === 'SF') base *= 1.1;
        else base *= 0.9;  // big men less likely to get steals
        return base;
      };
      let steal = null;
      if (turnover && Math.random() < 0.55) {
        steal = defense.reduce((best, p) => stealScore(p) > stealScore(best) ? p : best);
      }

      // ── Block attribution (consistent scoring) ────────────────────
      const blockScore = (p) => {
        let base = (p.blocks || 0) * 0.6 + (p.post_defense || 50) * 0.4;
        if (p.position === 'C') base *= 1.4;
        else if (p.position === 'PF') base *= 1.25;
        else if (p.position === 'SF') base *= 1.0;
        else base *= 0.8;
        return base;
      };
      let block = null;
      if (!turnover && shotResult.missed && !shotResult.isFoul) {
        const baseProb =
          shotResult.shotType === 'rim' ? 0.08
          : shotResult.shotType === 'midRange' ? 0.03
          : 0.005;
        const bestBlocker = defense.reduce((best, p) => blockScore(p) > blockScore(best) ? p : best);
        const ratingFactor = (bestBlocker.blocks || 50) / 50;
        const blockProb = Math.min(0.30, baseProb * ratingFactor);
        if (Math.random() < blockProb) {
          block = bestBlocker;
        }
      }

      // ── Foul attribution ──────────────────────────────────────────
      let fouler = null;
      if (shotResult.isFoul) {
        fouler = defense[Math.floor(Math.random() * defense.length)];
      }

      // ── Assist attribution: walk the passing graph one hop from the
      // primary handler instead of a flat rating-weighted lottery. This
      // makes assist patterns follow the team's actual ball-movement
      // tendencies (which themselves evolve via graph reinforcement). ──
      let assistedBy = null;
      if (shotResult.assist && !turnover) {
        const graph = isHomePossession ? gameState.homePassGraph : gameState.awayPassGraph;
        const teammateIds = new Set(offense.filter(p => p.id !== primaryHandler.id).map(p => p.id));
        const nextId = graph.step(primaryHandler.id);
        if (nextId && teammateIds.has(nextId)) {
          assistedBy = offense.find(p => p.id === nextId) || null;
        }
        if (!assistedBy) {
          // fallback: rating-weighted lottery among teammates (old behaviour)
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
      }

      // ── Build and return the possession result ────────────────────
      return {
        playType,
        points,
        shotResult,
        turnovers: turnover,
        handler: primaryHandler,
        defender: primaryDefender,
        defensivePlayers: defense,           // fixed: use the `defense` parameter
        assist: shotResult.assist || false,
        assistedBy,
        offensiveRebound,
        offRebounderId,                      // added so _accumulateStats can use it
        steal,
        block,
        fouler,
      };
  }

  // ── Defensive scheme selection (unchanged) ──────────────────────────
  static _selectDefensiveScheme(defense) {
    const avgPerimeter = defense.reduce((s, p) => s + p.perimeter_defense, 0) / defense.length;
    const avgPost = defense.reduce((s, p) => s + p.post_defense, 0) / defense.length;
    if (avgPerimeter > 80 && avgPost > 80) return 'manToMan';
    if (avgPerimeter > 75) return 'switch';
    if (avgPost > 75) return 'drop';
    return 'manToMan';
  }

  // ── Offensive rebound check (revised – crash model) ──────────────────
  static _checkOffensiveRebound(offense, defense, shotResult, gameState) {
    const shotType = shotResult.shotType || 'midRange';
    const baseORebByType = {
      rim:       0.28,
      midRange:  0.22,
      threePoint:0.17,
    };
    let baseChance = baseORebByType[shotType] || 0.22;

    // size advantage
    const offensiveBigs = offense.filter(p => ['C','PF','SF'].includes(p.position)).length;
    const defensiveBigs = defense.filter(p => ['C','PF','SF'].includes(p.position)).length;
    baseChance += Math.max(0, offensiveBigs - defensiveBigs) * 0.04;

    // best rebounder difference
    const bestOffReb = Math.max(...offense.map(p => p.rebounding || 50));
    const bestDefReb = Math.max(...defense.map(p => p.rebounding || 50));
    const rebDiff = (bestOffReb - bestDefReb) / 50 * 0.10;
    baseChance += rebDiff;

    // fatigue penalty
    const avgFatigue = offense.reduce((s, p) =>
      s + (gameState.homeFatigue.get(p.id) || gameState.awayFatigue.get(p.id) || 0), 0) / offense.length;
    baseChance -= avgFatigue * 0.06;

    baseChance = Math.min(0.42, Math.max(0.08, baseChance));

    if (Math.random() < baseChance) {
      // Select the actual offensive rebounder weighted by rebounding rating
      const weighted = offense.map(p => ({
        id: p.id,
        weight: (p.rebounding || 50) * (['C','PF','SF'].includes(p.position) ? 1.3 : 1.0)
      }));
      const totalWeight = weighted.reduce((s, p) => s + p.weight, 0);
      let r = Math.random() * totalWeight;
      for (const p of weighted) {
        r -= p.weight;
        if (r <= 0) return { success: true, rebounderId: p.id };
      }
      return { success: true, rebounderId: weighted[0].id };
    }
    return { success: false, rebounderId: null };
  }

  // ── Player selection helpers (unchanged) ────────────────────────────
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

  static _selectShooter(players, gameState, isHomePossession, primaryHandler) {
    // Blend static rating-based selection with the passing graph: a
    // shooter who's currently "hot" in the ball-movement network (i.e.
    // receiving weighted passes from the handler) is more likely to get
    // the look, on top of raw shooting skill.
    const graph = gameState && isHomePossession !== undefined
      ? (isHomePossession ? gameState.homePassGraph : gameState.awayPassGraph)
      : null;
    const graphWeight = (id) => {
      if (!graph || !primaryHandler) return 1;
      const edges = graph.neighbors(primaryHandler.id);
      const found = edges.find(([to]) => to === id);
      return found ? 1 + found[1] / 20 : 1;
    };

    const scores = players.map(p => {
      let base = (p.three_point || 50) * 0.7 + (p.mid_range || 50) * 0.3;
      if (p.position === 'SG' || p.position === 'SF') base *= 1.15;
      if (p.position === 'PG') base *= 1.05;
      return Math.pow(base, 1.8) * graphWeight(p.id);
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

  // ── Play type selection (now driven by a Bayesian-updated Markov chain
  // rather than a fresh flat weight table every possession). The team's
  // static tendencies (shooting/passing/speed profile) and situational
  // factors (clutch, momentum, OT) are folded in as a multiplicative bias
  // on top of the chain's learned posterior. ─────────────────────────────
  static _selectPlayType(offense, defense, gameState, isHomePossession) {
    const threeAvg = offense.reduce((s, p) => s + p.three_point, 0) / offense.length;
    const insideAvg = offense.reduce((s, p) => s + p.inside_scoring, 0) / offense.length;
    const passAvg   = offense.reduce((s, p) => s + p.passing, 0) / offense.length;
    const speedAvg  = offense.reduce((s, p) => s + p.speed, 0) / offense.length;

    const bias = {
      isolation: 1, pick_and_roll: 1, spot_up: 1, post_up: 1, transition: 1, cut: 1,
    };

    if (threeAvg > 80)  { bias.spot_up *= 1.35; bias.cut *= 0.85; }
    if (insideAvg > 80) { bias.post_up *= 1.6; bias.isolation *= 1.2; bias.cut *= 1.15; }
    if (passAvg > 80)   { bias.pick_and_roll *= 1.15; bias.cut *= 1.2; }
    if (speedAvg > 80)  { bias.transition *= 1.25; bias.cut *= 1.1; }

    if (gameState.clutchActive) {
      bias.isolation *= 1.7;
      bias.pick_and_roll *= 0.8;
      bias.transition *= 0.85;
    }
    if (gameState.momentum > 0.3) {
      bias.transition *= 1.2;
      bias.isolation *= 1.1;
    }
    if (gameState.isOvertime) {
      bias.isolation *= 1.35;
      bias.pick_and_roll *= 0.85;
    }

    const chain = isHomePossession ? gameState.homePlayChain : gameState.awayPlayChain;
    const lastPlay = isHomePossession ? gameState.homeLastPlay : gameState.awayLastPlay;
    return chain.sample(lastPlay, (playType) => bias[playType] ?? 1);
  }

  // ── Turnover probability (revised with realistic base & scaling) ─────
  static _calculateTurnoverProbability(handler, defender, playType, gameState) {
    const baseRate = 0.130; // league‑average TOV%

    const offSkill = (handler.ball_handling || 50) * 0.65 +
                     (handler.passing || 50) * 0.35;
    const defSkill = (defender.steal_rating || defender.perimeter_defense || 50) * 0.7 +
                     (defender.perimeter_defense || 50) * 0.3;
    const skillDiff = (defSkill - offSkill) / 100;

    const playMod = {
      isolation:      0.01,
      pick_and_roll:  0.005,
      spot_up:       -0.015,
      post_up:        0.005,
      transition:     0.03,
      cut:           -0.01,
    }[playType] || 0;

    const fatigue = gameState.homeFatigue.get(handler.id) || gameState.awayFatigue.get(handler.id) || 0;
    const fatigueFactor = 0.12 * fatigue;
    const momentumFactor = -gameState.momentum * 0.04;

    let rate = baseRate + skillDiff * 0.10 + playMod + fatigueFactor + momentumFactor;
    return Math.min(0.24, Math.max(0.04, rate));
  }

  // ── Shot quality calculation (revised – centred at 0.5, realistic scaling) ──
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
      offSkill += (player[mapAttr(skill)] || 50) * w;
    }

    const defWeights = getDefWeights();
    let defSkill = 0;
    for (const [skill, w] of Object.entries(defWeights)) {
      defSkill += (defender[mapAttr(skill)] || 50) * w;
    }

    let posFactor = 1.0;
    if (player.position && defender.position && sqc.positionAdvantageMatrix) {
      posFactor = sqc.positionAdvantageMatrix[player.position]?.[defender.position] || 1.0;
    }

    let quality = (offSkill - defSkill) / 100;
    quality = quality * 0.50;   // changed from 0.35 to 0.50 for more realistic star power
    quality += 0.5;
    quality *= posFactor;

    quality += (Math.random() - 0.5) * (sqc.randomnessFactor || 0.12);

    const chemistry = gameState.homeChemistry || gameState.awayChemistry;
    quality += chemistry * gameState.config.chemistry.chemistryEffectOnShotQuality;
    quality += gameState.momentum * gameState.config.momentumSystem.momentumEffectOnSuccess;

    const fatigue = gameState.homeFatigue.get(player.id) || gameState.awayFatigue.get(player.id) || 0;
    quality -= fatigue * 0.12;

    const schemeMod = gameState.config.defensiveSchemes[defenseScheme] || {};
    const schemeKey = playType === 'pick_and_roll' ? 'pickAndRollMod' : playType + 'Mod';
    quality += (schemeMod[schemeKey] || 0);

    return Math.min(0.95, Math.max(0.05, quality));
  }

  // ── Shot attempt (revised – realistic per‑zone make rates, foul model,
  // now blended with each player's live Bayesian (Beta-Binomial) shot
  // model so hot/cold streaks affect outcomes and are learned from). ────
  static _attemptShot(player, defender, shotQuality, playType, gameState) {
    const config = gameState.config;
    const ff = config.foulAndFreeThrow;
    const playCfg = config.plays[playType] || {};

    const dist = playCfg.shotDistribution || this._defaultShotDistribution(playType);
    const rand = Math.random();
    let shotType, isThree;
    if (rand < (dist.threePoint || 0)) {
      shotType = 'threePoint'; isThree = true;
    } else if (rand < (dist.threePoint || 0) + (dist.midRange || 0)) {
      shotType = 'midRange'; isThree = false;
    } else {
      shotType = 'rim'; isThree = false;
    }

    const foulProb = this._calculateFoulProbability(player, defender, playType, shotType, gameState);

    if (Math.random() < foulProb) {
      const isThreeFoul = isThree && Math.random() < (ff.threePointFoulChance || 0.15);
      const isAndOne = !isThreeFoul && Math.random() < (ff.andOneChanceOnFoul || 0.12);
      const ftAttempts = isThreeFoul ? 3 : (isAndOne ? 1 : 2);
      const ftMakeRate = this._freeThrowPercentage(player);
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

    // Base make rates by zone (NBA averages)
    const baseMakes = {
      rim:       0.640,
      midRange:  0.420,
      threePoint:0.355,
    };
    let baseMake = baseMakes[shotType] || 0.50;
    const qualityMultiplier = 0.75 + (shotQuality * 0.9);
    baseMake *= qualityMultiplier;

    let playerSkill = 70;
    if (isThree) {
      playerSkill = player.three_point || 70;
      baseMake *= playerSkill / 70;
    } else if (shotType === 'rim') {
      playerSkill = player.inside_scoring || 70;
      baseMake *= playerSkill / 70;
    } else {
      playerSkill = player.mid_range || 70;
      baseMake *= playerSkill / 70;
    }

    let defImpact = 1.0;
    if (shotType === 'threePoint' || shotType === 'midRange') {
      defImpact = 1.0 - 0.25 * ((defender.perimeter_defense || 70) / 100);
    } else {
      defImpact = 1.0 - 0.40 * ((defender.post_defense || 70) / 100);
    }
    baseMake *= defImpact;

    const fatigue = gameState.homeFatigue.get(player.id) || gameState.awayFatigue.get(player.id) || 0;
    baseMake -= fatigue * 0.05;

    baseMake = Math.min(0.85, Math.max(0.10, baseMake));

    // ── Bayesian blend: pull baseMake toward this player's live posterior
    // mean for this zone tonight. Weight grows with the model's sample
    // size (inverse variance) so early in the game ratings dominate, and
    // later a real hot/cold streak has earned influence. ────────────────
    const shotModel = gameState.shotModels.get(player.id, shotType, playerSkill);
    const posteriorMean = shotModel.mean();
    const confidence = 1 - Math.min(1, shotModel.variance() * 12); // 0..~1
    const bayesWeight = 0.35 * confidence; // cap live-model influence at 35%
    let finalMake = baseMake * (1 - bayesWeight) + posteriorMean * bayesWeight;
    finalMake = Math.min(0.85, Math.max(0.10, finalMake));

    const made = Math.random() < finalMake;
    shotModel.update(made);

    const assistProb = playCfg.assistProbability || this._defaultAssistProb(playType);
    const isAssist = made && Math.random() < assistProb;

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

  // ── New helper methods for realism ───────────────────────────────────

  /** Default shot zone distribution per play type (NBA average) */
  static _defaultShotDistribution(playType) {
    const map = {
      isolation:      { threePoint: 0.30, midRange: 0.38, rim: 0.32 },
      pick_and_roll:  { threePoint: 0.35, midRange: 0.25, rim: 0.40 },
      spot_up:        { threePoint: 0.55, midRange: 0.25, rim: 0.20 },
      post_up:        { threePoint: 0.05, midRange: 0.40, rim: 0.55 },
      transition:     { threePoint: 0.25, midRange: 0.15, rim: 0.60 },
      cut:            { threePoint: 0.05, midRange: 0.10, rim: 0.85 },
    };
    return map[playType] || { threePoint: 0.30, midRange: 0.35, rim: 0.35 };
  }

  /** Default assist probabilities per play type */
  static _defaultAssistProb(playType) {
    const probs = {
      isolation:      0.18,
      pick_and_roll:  0.55,
      spot_up:        0.70,
      post_up:        0.30,
      transition:     0.50,
      cut:            0.75,
    };
    return probs[playType] || 0.35;
  }

  /** Realistic free throw percentage from player rating */
  static _freeThrowPercentage(player) {
    const skill = player.free_throw || player.three_point || 75;
    return Math.min(0.92, Math.max(0.55, 0.50 + (skill / 100) * 0.30));
  }

  /** Foul probability based on play type, shot type and defender */
  static _calculateFoulProbability(player, defender, playType, shotType, gameState) {
    const ff = gameState.config.foulAndFreeThrow;
    const base = ff.foulPerPlayType?.[playType] || 0.08;

    let defenderSkill;
    if (shotType === 'rim' || playType === 'post_up') {
      defenderSkill = defender.post_defense || 70;
    } else {
      defenderSkill = defender.perimeter_defense || 70;
    }

    const disciplineFactor = 1.0 + (1.0 - defenderSkill / 100) * 0.8;
    let prob = base * disciplineFactor;

    const drawFoul = (player.inside_scoring || 70) / 100 * 0.04;  // reduced from 0.06
    prob += drawFoul;

    if (gameState.clutchActive) prob += 0.01;
    prob += gameState.momentum * 0.02;

    return Math.min(0.22, Math.max(0.02, prob));  // cap lowered from 0.25
  }

  /** Normal distribution helper */
  static _randomNormal(mean, stdev) {
    const u = 1 - Math.random();
    const v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return z * stdev + mean;
  }

  // ── Play executions (updated to use new shot quality/attempt) ────────
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

  /** New: Cut play execution (off‑ball movement to the rim) */
  static _executeCut(offense, defense, scheme, gameState) {
    const cutter = offense.reduce((best, p) =>
      (p.speed * 0.4 + p.inside_scoring * 0.6) > (best.speed * 0.4 + best.inside_scoring * 0.6) ? p : best
    );
    const closestDef = this._selectClosestDefender(defense);
    const qual = this._calculateShotQuality(cutter, closestDef, 'cut', gameState, scheme);
    return this._attemptShot(cutter, closestDef, qual, 'cut', gameState);
  }

  // ── Momentum, chemistry, fatigue (unchanged) ────────────────────────
  static _updateMomentum(gameState, result, isHomeOffense) {
    const ms = gameState.config.momentumSystem;
    let delta = 0;
    if (result.points >= 2) {
      delta += ms.runBonusPerPoint * result.points;
      if (result.points >= 3) delta += ms.bigPlayBonus.threePointer || 0.04;
    }
    if (result.turnovers) delta -= 0.02;
    delta -= ms.decayRatePerMinute * (24 / 60);

    const signedDelta = isHomeOffense ? delta : -delta;
    gameState.momentum = Math.max(ms.minMomentum, Math.min(ms.maxMomentum, gameState.momentum + signedDelta));
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

  // ── Critical moments (unchanged) ────────────────────────────────────
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

  // ── Stats accumulation (unchanged) ──────────────────────────────────
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

    if (result.offensiveRebound && result.offRebounderId) {
      ensure(offStats, result.offRebounderId);
      offStats.playerStats.get(result.offRebounderId).oreb++;
    }

    // ── Defensive rebound (FIX) ──
    // defensive rebound occurs when shot missed, not foul, no OREB, and not a block (block handled separately)
    if (sr && sr.missed && !sr.isFoul && !result.offensiveRebound && !result.block) {
      // Select the best defensive rebounder from the defense
      const defRebCandidates = result.defensivePlayers || []; // we'll pass the defensive lineup
      const weighted = defRebCandidates.map(p => ({
        id: p.id,
        weight: (p.rebounding || 50) * (['C','PF','SF'].includes(p.position) ? 1.3 : 1.0)
      }));
      const total = weighted.reduce((s, p) => s + p.weight, 0);
      let r = Math.random() * total;
      let rebounderId = weighted[0].id;
      for (const p of weighted) {
        r -= p.weight;
        if (r <= 0) { rebounderId = p.id; break; }
      }
      ensure(defStats, rebounderId);
      defStats.playerStats.get(rebounderId).dreb++;
    }

    if (result.steal) {
      ensure(defStats, result.steal.id);
      defStats.playerStats.get(result.steal.id).steals++;
    }

    if (result.block) {
      ensure(defStats, result.block.id);
      defStats.playerStats.get(result.block.id).blocks++;
      // The block usually forces a missed shot, so a defensive rebound is needed.
      // Give the DREB to the blocker with higher chance, but not guaranteed.
      const defRebCandidates = result.defensivePlayers || [];
      // Weighted random: blocker gets bonus
      const weighted = defRebCandidates.map(p => ({
        id: p.id,
        weight: (p.rebounding || 50) * (p.id === result.block.id ? 2.5 : 1.0) *
                (['C','PF','SF'].includes(p.position) ? 1.3 : 1.0)
      }));
      const total = weighted.reduce((s, p) => s + p.weight, 0);
      let r = Math.random() * total;
      let rebounderId = weighted[0].id;
      for (const p of weighted) {
        r -= p.weight;
        if (r <= 0) { rebounderId = p.id; break; }
      }
      ensure(defStats, rebounderId);
      defStats.playerStats.get(rebounderId).dreb++;
    }

    if (result.fouler) {
      ensure(defStats, result.fouler.id);
      defStats.playerStats.get(result.fouler.id).fouls++;
    }
  }

  // ── Team creation (unchanged) ───────────────────────────────────────
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

  // ── Box score generation (unchanged) ────────────────────────────────
  static _generateBoxScoresFromStats(gameState, players, teamSide) {
    const stats = teamSide === 'home' ? gameState.homeStats : gameState.awayStats;
    const score = teamSide === 'home' ? gameState.homeScore : gameState.awayScore;
    const oppScore = teamSide === 'home' ? gameState.awayScore : gameState.homeScore;
    const scoreDiff = score - oppScore;
    const totalMinutes = 48 * 5;
    const fatigueMap = teamSide === 'home' ? gameState.homeFatigue : gameState.awayFatigue;

    const sorted = [...players].sort((a, b) => (b.overall_rating || 0) - (a.overall_rating || 0));
    const rankOf = new Map(sorted.map((p, i) => [p.id, i]));

    const lineup = gameState[teamSide + 'Lineup'];
    const playerMinutes = new Map();

    if (lineup && lineup.minutesTargets) {
      for (const p of players) {
        const target = lineup.minutesTargets[p.id];
        const fatigue = fatigueMap.get(p.id) || 0;
        const base = (target === undefined || target === null) ? 6 : target;
        playerMinutes.set(p.id, Math.max(1, Math.round(base - fatigue * 4)));
      }
    } else {
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

  // ── Config merging (unchanged) ──────────────────────────────────────
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