// services/gameSimulationEngine.js

/**
 * Advanced Basketball Game Simulation Engine v2.0
 * 
 * Realism improvements over v1:
 * – Accurate NBA pace (~48 possessions/team per 12-min quarter)
 * – Shot contest levels (open/tight/blanket) driving realistic make rates
 * – Team foul tracking with bonus/free throw situations
 * – Usage rate model: stars dominate shots proportionally
 * – Transition opportunities generated from defensive events
 * – Shot clock awareness affecting play type and urgency
 * – End-of-quarter shot timing (final 2-4 seconds)
 * – Foul disqualification at 6 personals
 * – More accurate block/steal rates per game
 * – Defensive rebound attribution with box-out modeling
 * – Pick-and-roll decision tree (roll/pop/ pull-up/ reject)
 * – Double-team triggers for elite scorers
 * – Late-game intentional foul / free throw strategy
 * – Improved assist rate modeling by play type
 * – Home court advantage affects refs, crowd noise, comfort
 * – Realistic rotation minute targets
 */

const gameData = require('../../data/gameData.json');
const { MarkovChain, WeightedDirectedGraph, PlayerShotModelRegistry } = require('./mathModels');

const PLAY_TYPES = ['isolation', 'pick_and_roll', 'spot_up', 'post_up', 'transition', 'cut'];

// ── NBA-calibrated constants ──────────────────────────────────────────
const NBA = {
  // Possessions per team per 12-minute quarter (league avg ~48, range 44-54)
  POSSESIONS_PER_QUARTER: 48,
  // Possessions per team per OT period (slower in OT)
  POSSESSIONS_PER_OT: 11,
  // League average turnover rate
  TURNOVER_RATE: 0.138,
  // League average offensive rebound rate (on missed shots)
  OREB_RATE: 0.228,
  // League average assist rate (assisted FGM / total FGM)
  ASSIST_RATE: 0.625,
  // Free throw rate (FTA / FGA)
  FT_RATE: 0.312,
  // Average fouls called per team per game
  FOULS_PER_GAME: 21.5,
  // Average blocks per team per game
  BLOCKS_PER_GAME: 5.4,
  // Average steals per team per game
  STEALS_PER_GAME: 7.8,
  // Average personal fouls per possession (to reach ~21.5/game over ~100 poss)
  FOULS_PER_POSSESSION: 0.215,
  // Shot clock length (seconds)
  SHOT_CLOCK: 24,
  // End-of-quarter buffer for final shot attempts
  END_OF_QTR_BUFFER: 4,
  // Disqualification foul count
  FOUL_LIMIT: 6,
  // Bonus foul count (team fouls per quarter to enter bonus)
  TEAM_FOUL_BONUS: 5,
  // Double bonus foul count
  TEAM_FOUL_DOUBLE_BONUS: 8,
  // Average seconds per possession (NBA ~14.5)
  AVG_POSSESSION_SECONDS: 14.5,
  // Home court advantage in points
  HOME_COURT_PTS: 2.5,
  // Free throw make rate baseline (75% league avg)
  FT_MAKE_BASELINE: 0.755,
};

// Shot distribution by play type (NBA Synergy Sports / Second Spectrum data)
const SHOT_DISTRIBUTIONS = {
  isolation:      { threePoint: 0.27, midRange: 0.39, rim: 0.34 },
  pick_and_roll:  { threePoint: 0.32, midRange: 0.24, rim: 0.44 },
  pick_and_roll_pop: { threePoint: 0.72, midRange: 0.18, rim: 0.10 },
  spot_up:        { threePoint: 0.64, midRange: 0.21, rim: 0.15 },
  post_up:        { threePoint: 0.04, midRange: 0.36, rim: 0.60 },
  transition:     { threePoint: 0.22, midRange: 0.13, rim: 0.65 },
  cut:            { threePoint: 0.02, midRange: 0.06, rim: 0.92 },
  putback:        { threePoint: 0.00, midRange: 0.05, rim: 0.95 },
  offensive_rebound_shot: { threePoint: 0.05, midRange: 0.15, rim: 0.80 },
};

// Base make rates by zone and contest level (NBA tracking data)
const MAKE_RATES = {
  rim: {
    open: 0.735,    // 0-2 ft, no defender within 4 ft
    tight: 0.575,   // defender 2-4 ft
    blanket: 0.420, // defender within 2 ft
  },
  midRange: {
    open: 0.455,
    tight: 0.365,
    blanket: 0.280,
  },
  threePoint: {
    open: 0.395,    // 6+ ft from defender
    tight: 0.330,   // 2-6 ft
    blanket: 0.245, // within 2 ft (rare, mostly on closeouts)
  },
};

// Assist probability by play type (NBA average)
const ASSIST_PROBS = {
  isolation: 0.15,
  pick_and_roll: 0.52,
  pick_and_roll_pop: 0.65,
  spot_up: 0.82,
  post_up: 0.28,
  transition: 0.55,
  cut: 0.88,
  putback: 0.00,
  offensive_rebound_shot: 0.12,
};

// Foul probability per shot attempt by zone and play type
const FOUL_PROBS = {
  rim: {
    isolation: 0.145,
    pick_and_roll: 0.165,
    post_up: 0.195,
    transition: 0.095,
    cut: 0.125,
    spot_up: 0.065,
    putback: 0.110,
    offensive_rebound_shot: 0.095,
  },
  midRange: {
    isolation: 0.045,
    pick_and_roll: 0.055,
    post_up: 0.085,
    transition: 0.025,
    cut: 0.020,
    spot_up: 0.025,
    putback: 0.040,
    offensive_rebound_shot: 0.035,
  },
  threePoint: {
    isolation: 0.025,
    pick_and_roll: 0.030,
    post_up: 0.005,
    transition: 0.020,
    cut: 0.005,
    spot_up: 0.035,
    putback: 0.000,
    offensive_rebound_shot: 0.010,
  },
};

class GameSimulationEngine {
  /**
   * Simulate a complete basketball game.
   * @param {Array} homePlayers
   * @param {Array} awayPlayers
   * @param {Object} options - can include { config: overrides, homeLineup, awayLineup }
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
      shotClock: NBA.SHOT_CLOCK,
      totalGameSeconds: 0,
      clutchActive: false,
      overtimeCount: 0,
      isOvertime: false,
      homeScore: 0,
      awayScore: 0,
      gameLog: [],
      homeStats: this._initTeamStats(),
      awayStats: this._initTeamStats(),

      // Team foul tracking per quarter (resets each quarter)
      homeTeamFouls: 0,
      awayTeamFouls: 0,

      // Personal foul tracking (persists, leads to disqualification)
      homePlayerFouls: new Map(),
      awayPlayerFouls: new Map(),

      // Previous possession result (for transition generation)
      lastPossessionResult: null,

      // Markov chains for play calling
      homePlayChain: this._buildPlayChainPrior(),
      awayPlayChain: this._buildPlayChainPrior(),
      homeLastPlay: 'isolation',
      awayLastPlay: 'isolation',

      // Passing networks
      homePassGraph: new WeightedDirectedGraph(),
      awayPassGraph: new WeightedDirectedGraph(),

      // Bayesian shot models
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

    // Track minutes played per player
    gameState.homeMinutesPlayed = new Map();
    gameState.awayMinutesPlayed = new Map();

    // Initialize fatigue and foul maps
    for (const p of [...homePlayers, ...awayPlayers]) {
      gameState.homeFatigue.set(p.id, 0);
      gameState.awayFatigue.set(p.id, 0);
      gameState.homePlayerFouls.set(p.id, 0);
      gameState.awayPlayerFouls.set(p.id, 0);
      gameState.homeMinutesPlayed.set(p.id, 0);
      gameState.awayMinutesPlayed.set(p.id, 0);
    }

    // Seed passing graphs
    this._seedPassGraph(gameState.homePassGraph, homeTeam.players);
    this._seedPassGraph(gameState.awayPassGraph, awayTeam.players);

    // Calculate team paces (some teams play faster/slower)
    const homePace = this._calculateTeamPace(homeTeam.players, config);
    const awayPace = this._calculateTeamPace(awayTeam.players, config);
    gameState.homePace = homePace;
    gameState.awayPace = awayPace;
    // Average pace for the game
    gameState.gamePace = (homePace + awayPace) / 2;

    // Regulation quarters
    for (let q = 0; q < g.quarters; q++) {
      const period = `Q${q + 1}`;
      gameState.homeTeamFouls = 0;  // Reset team fouls each quarter
      gameState.awayTeamFouls = 0;
      this._simulatePeriod(gameState, period, g.minutesPerQuarter, false);
      this._applyFatigueRecovery(gameState, config.fatigue.fatigueRecoveryPerQuarter);
    }

    // Overtime
    while (gameState.homeScore === gameState.awayScore && gameState.overtimeCount < g.maxOvertimes) {
      gameState.overtimeCount++;
      gameState.isOvertime = true;
      const period = `OT${gameState.overtimeCount}`;
      gameState.homeTeamFouls = 0;
      gameState.awayTeamFouls = 0;
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

  // ── Calculate team pace factor (0.90 to 1.10 range around 1.0) ─────
  static _calculateTeamPace(players, config) {
    const avgSpeed = players.reduce((s, p) => s + (p.speed || 70), 0) / players.length;
    const avgThree = players.reduce((s, p) => s + (p.three_point || 70), 0) / players.length;
    // Faster teams: high speed, high 3PT rate (more early shots in transition/early offense)
    const paceFactor = 0.92 + (avgSpeed / 100) * 0.06 + (avgThree / 100) * 0.04;
    return Math.max(0.88, Math.min(1.12, paceFactor));
  }

  // ── Markov chain prior ──────────────────────────────────────────────
  static _buildPlayChainPrior() {
    const baseWeights = {
      isolation: 10, pick_and_roll: 28, spot_up: 22,
      post_up: 7, transition: 15, cut: 18,
    };
    const priorCounts = {};
    for (const from of PLAY_TYPES) {
      priorCounts[from] = {};
      for (const to of PLAY_TYPES) {
        priorCounts[from][to] = baseWeights[to] * (from === to ? 1.12 : 1.0);
      }
    }
    return new MarkovChain(PLAY_TYPES, priorCounts);
  }

  // ── Seed passing graph ──────────────────────────────────────────────
  static _seedPassGraph(graph, players) {
    const chemMatrix = gameData.chemistry?.positionalFitMatrix || {};
    for (const a of players) {
      for (const b of players) {
        if (a.id === b.id) continue;
        const receiverScore = (b.three_point || 50) * 0.35 + (b.inside_scoring || 50) * 0.35 + (b.overall_rating || 50) * 0.30;
        const passerSkill = (a.passing || 50) / 100;
        const fit = (chemMatrix[a.position]?.[b.position]) || 0.02;
        const weight = passerSkill * receiverScore * (1 + fit * 4);
        graph.setEdge(a.id, b.id, Math.max(0.5, weight));
      }
    }
  }

  // ── Set period lineups with realistic rotation ──────────────────────
  static _setPeriodLineups(gameState, period) {
    const setSide = (teamSide) => {
      const players = gameState[teamSide + 'Team'].players;
      const lineup = gameState[teamSide + 'Lineup'];
      const foulMap = gameState[teamSide + 'PlayerFouls'];
      const validIds = new Set(players.map(p => p.id));

      let starters, bench;
      if (lineup && Array.isArray(lineup.starters) && lineup.starters.length === 5) {
        starters = lineup.starters.filter(id => validIds.has(id) && (foulMap.get(id) || 0) < NBA.FOUL_LIMIT);
        bench = (Array.isArray(lineup.rotation) ? lineup.rotation : [])
          .filter(id => validIds.has(id) && !starters.includes(id) && (foulMap.get(id) || 0) < NBA.FOUL_LIMIT);

        const accounted = new Set([...starters, ...bench]);
        for (const p of players) {
          if (!accounted.has(p.id) && (foulMap.get(p.id) || 0) < NBA.FOUL_LIMIT) bench.push(p.id);
        }
        if (starters.length < 5) {
          const sorted = [...players].filter(p => (foulMap.get(p.id) || 0) < NBA.FOUL_LIMIT)
            .sort((a, b) => b.overall_rating - a.overall_rating);
          for (const p of sorted) {
            if (starters.length >= 5) break;
            if (!starters.includes(p.id)) {
              starters.push(p.id);
              bench = bench.filter(id => id !== p.id);
            }
          }
        }
      } else {
        const sorted = [...players].filter(p => (foulMap.get(p.id) || 0) < NBA.FOUL_LIMIT)
          .sort((a, b) => b.overall_rating - a.overall_rating);
        starters = sorted.slice(0, 5).map(p => p.id);
        bench = sorted.slice(5).map(p => p.id);
      }

      if (period.startsWith('Q')) {
        const q = parseInt(period[1]);
        if (q === 1 || q === 3) {
          // Starters to open half
          gameState[teamSide + 'ActiveIds'] = [...starters];
          gameState[teamSide + 'BenchIds'] = [...bench];
        } else if (q === 2 || q === 4) {
          // Mix of starters and bench (typical NBA rotation: 2nd unit gets ~6-8 min in Q2)
          const primaryBench = bench.slice(0, 3);
          const keepStarters = starters.slice(0, 2);
          gameState[teamSide + 'ActiveIds'] = [...keepStarters, ...primaryBench].filter(Boolean);
          gameState[teamSide + 'BenchIds'] = [...starters.slice(2), ...bench.slice(3)].filter(Boolean);
          // Ensure we have 5
          while (gameState[teamSide + 'ActiveIds'].length < 5 && gameState[teamSide + 'BenchIds'].length) {
            gameState[teamSide + 'ActiveIds'].push(gameState[teamSide + 'BenchIds'].shift());
          }
        }
      } else {
        // Overtime: best available, prioritize low fatigue and low fouls
        const fatigueMap = gameState[teamSide + 'Fatigue'];
        const candidates = players
          .filter(p => (foulMap.get(p.id) || 0) < NBA.FOUL_LIMIT)
          .map(p => ({
            id: p.id,
            fatigue: fatigueMap.get(p.id) || 0,
            fouls: foulMap.get(p.id) || 0,
            rating: p.overall_rating || 0,
          }));
        candidates.sort((a, b) => {
          // Prioritize players who can stay on the floor (low fouls)
          const foulPenalty = (a.fouls - b.fouls) * 10;
          const fatigueDiff = a.fatigue - b.fatigue;
          const ratingDiff = b.rating - a.rating;
          return foulPenalty || fatigueDiff || ratingDiff;
        });
        gameState[teamSide + 'ActiveIds'] = candidates.slice(0, 5).map(c => c.id);
        gameState[teamSide + 'BenchIds'] = candidates.slice(5).map(c => c.id);
      }
    };
    setSide('home');
    setSide('away');
  }

  // ── Period simulation ───────────────────────────────────────────────
  static _simulatePeriod(gameState, periodName, minutes, isOvertime) {
    const g = gameState.config.global;
    const periodSeconds = minutes * 60;
    gameState.periodClock = periodSeconds;
    gameState.shotClock = NBA.SHOT_CLOCK;

    // Realistic possession count based on pace
    const basePossessions = isOvertime ? NBA.POSSESSIONS_PER_OT : NBA.POSSESIONS_PER_QUARTER;
    const possessionsTotal = Math.round(basePossessions * gameState.gamePace);
    const periodLog = [];

    this._setPeriodLineups(gameState, periodName);

    // Clutch detection
    this._updateClutchStatus(gameState);

    let isHomeOffense = Math.random() > 0.5;

    for (let i = 0; i < possessionsTotal; i++) {
      // Realistic possession duration
      let possessionDuration = Math.min(
        NBA.SHOT_CLOCK,
        Math.max(5.0, this._randomNormal(NBA.AVG_POSSESSION_SECONDS, 3.8))
      );

      // End of quarter: ensure there's time for a final shot
      const timeRemaining = gameState.periodClock;
      const isEndOfQuarter = timeRemaining <= NBA.END_OF_QTR_BUFFER && timeRemaining > 0;
      
      if (isEndOfQuarter) {
        possessionDuration = timeRemaining; // Use all remaining time for final shot
      }

      gameState.periodClock -= possessionDuration;
      gameState.totalGameSeconds += possessionDuration;

      if (gameState.periodClock <= 0 && !isEndOfQuarter) break;

      // Update clutch status
      this._updateClutchStatus(gameState);

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

      // Track minutes played
      const minutesMap = isHomeOffense ? gameState.homeMinutesPlayed : gameState.awayMinutesPlayed;
      for (const p of activeOffense) {
        minutesMap.set(p.id, (minutesMap.get(p.id) || 0) + possessionDuration / 60);
      }
      for (const p of activeDefense) {
        const defMinutesMap = !isHomeOffense ? gameState.homeMinutesPlayed : gameState.awayMinutesPlayed;
        defMinutesMap.set(p.id, (defMinutesMap.get(p.id) || 0) + possessionDuration / 60);
      }

      // Apply fatigue
      this._applyFatigueTick(activeOffense, offSide, possessionDuration / 60, gameState);
      this._applyFatigueTick(activeDefense, defSide, possessionDuration / 60, gameState);

      // Determine if this is a transition opportunity
      const isTransitionOpportunity = this._isTransitionOpportunity(gameState, offSide);

      // Shot clock situation
      const shotClockRemaining = gameState.shotClock;
      const isLateShotClock = shotClockRemaining <= 5;

      const result = this._simulatePossession(
        activeOffense, activeDefense, isHomeOffense, gameState,
        { isTransitionOpportunity, isEndOfQuarter, isLateShotClock, shotClockRemaining }
      );

      // Reset shot clock for next possession
      gameState.shotClock = NBA.SHOT_CLOCK;

      if (isHomeOffense) {
        gameState.homeScore += result.points;
        gameState.homeStats.possessions++;
        // Track team fouls on defense
        if (result.teamFoul) {
          gameState.awayTeamFouls++;
        }
      } else {
        gameState.awayScore += result.points;
        gameState.awayStats.possessions++;
        if (result.teamFoul) {
          gameState.homeTeamFouls++;
        }
      }

      this._accumulateStats(gameState, result, isHomeOffense);
      this._updateMomentum(gameState, result, isHomeOffense);

      // Markov chain update
      this._updatePlayChain(gameState, result, isHomeOffense);

      // Passing graph update
      this._updatePassGraph(gameState, result, isHomeOffense);

      // Chemistry update
      if (result.assist && !result.turnovers) {
        this._updateChemistry(gameState, isHomeOffense, gameState.config.chemistry.assistBonusPerGame || 0.004);
      }

      // Store result for transition generation
      gameState.lastPossessionResult = { ...result, isHomeOffense };

      periodLog.push({
        period: periodName,
        possession: i + 1,
        team: isHomeOffense ? 'home' : 'away',
        clock: Math.max(0, gameState.periodClock),
        ...result,
      });

      // Critical moment check
      if (gameState.clutchActive && Math.random() < 0.08) {
        this._checkCriticalMoment(gameState, isHomeOffense, result, periodLog);
      }

      // Substitutions (only on change of possession, not on OREB)
      if (!result.offensiveRebound) {
        this._performSubstitutions(gameState, 'home', periodLog, periodName);
        this._performSubstitutions(gameState, 'away', periodLog, periodName);
        isHomeOffense = !isHomeOffense;
      } else {
        // On offensive rebound, shot clock resets to 14
        gameState.shotClock = 14;
      }

      // Late-game intentional foul logic (down 3+ with < 2 minutes, foul to stop clock)
      if (this._shouldIntentionalFoul(gameState, isHomeOffense)) {
        const foulResult = this._executeIntentionalFoul(gameState, !isHomeOffense, periodLog, periodName);
        if (foulResult) {
          isHomeOffense = !isHomeOffense;
        }
      }
    }

    gameState.gameLog.push(periodLog);
  }

  // ── Transition opportunity detection ────────────────────────────────
  static _isTransitionOpportunity(gameState, offSide) {
    const last = gameState.lastPossessionResult;
    if (!last) return Math.random() < 0.15; // First possession: small chance

    // Transition more likely after:
    // 1. Defensive rebound (especially outlet passes)
    // 2. Steals (highest transition rate)
    // 3. Made baskets by opponent (push in transition before D sets)
    // Less likely after:
    // 1. Made free throws (defense can set up)
    // 2. Turnovers by opponent that take time (out of bounds, etc.)

    if (last.steal && last.isHomeOffense !== (offSide === 'home')) {
      return Math.random() < 0.78; // Steals lead to transition ~78% of time
    }
    if (last.defensiveRebound && last.isHomeOffense !== (offSide === 'home')) {
      return Math.random() < 0.22; // DREB leads to transition ~22%
    }
    if (last.points > 0 && !last.shotResult?.isFoul && last.isHomeOffense !== (offSide === 'home')) {
      return Math.random() < 0.15; // After made basket ~15%
    }
    // After made FTs or timeouts, defense is set
    if (last.shotResult?.isFoul) {
      return Math.random() < 0.03;
    }
    return Math.random() < 0.10; // Default
  }

  // ── Clutch status update ────────────────────────────────────────────
  static _updateClutchStatus(gameState) {
    const g = gameState.config.global;
    const isFourthOrLater = gameState.gameLog.length >= 3 || gameState.isOvertime;
    const timeLeft = gameState.periodClock;
    const scoreDiff = Math.abs(gameState.homeScore - gameState.awayScore);
    
    // NBA defines clutch as last 5 minutes of 4th quarter or OT, score within 5
    gameState.clutchActive = isFourthOrLater && 
      timeLeft <= 300 && 
      scoreDiff <= 5;
  }

  // ── Intentional foul logic (late game) ──────────────────────────────
  static _shouldIntentionalFoul(gameState, isHomeOffense) {
    const timeLeft = gameState.periodClock;
    if (timeLeft > 120) return false; // Only last 2 minutes
    
    const homeScore = gameState.homeScore;
    const awayScore = gameState.awayScore;
    const trailingTeam = isHomeOffense ? 
      (homeScore < awayScore - 2) : 
      (awayScore < homeScore - 2);
    
    // Only foul if trailing by 3+ with < 2 minutes
    // Don't foul if trailing by 1 or 2 (better to play defense)
    const scoreDiff = isHomeOffense ? (awayScore - homeScore) : (homeScore - awayScore);
    return trailingTeam && scoreDiff >= 3 && Math.random() < 0.65;
  }

  static _executeIntentionalFoul(gameState, foulingTeamIsHome, periodLog, periodName) {
    const defSide = foulingTeamIsHome ? 'home' : 'away';
    const offSide = foulingTeamIsHome ? 'away' : 'home';
    const activeDefIds = foulingTeamIsHome ? gameState.homeActiveIds : gameState.awayActiveIds;
    const activeOffIds = foulingTeamIsHome ? gameState.awayActiveIds : gameState.homeActiveIds;
    
    const defenders = gameState[foulingTeamIsHome ? 'homeTeam' : 'awayTeam'].players
      .filter(p => activeDefIds.includes(p.id));
    const offenders = gameState[foulingTeamIsHome ? 'awayTeam' : 'homeTeam'].players
      .filter(p => activeOffIds.includes(p.id));
    
    if (defenders.length === 0 || offenders.length === 0) return null;
    
    // Foul the worst free throw shooter
    const target = offenders.reduce((worst, p) => 
      ((p.free_throw || 75) < (worst.free_throw || 75)) ? p : worst
    );
    
    // Fouler is typically the closest defender
    const fouler = defenders[Math.floor(Math.random() * defenders.length)];
    
    // Track personal foul
    const foulMap = gameState[defSide + 'PlayerFouls'];
    foulMap.set(fouler.id, (foulMap.get(fouler.id) || 0) + 1);
    
    // Track team foul
    if (foulingTeamIsHome) {
      gameState.homeTeamFouls++;
    } else {
      gameState.awayTeamFouls++;
    }
    
    // Check for disqualification
    if (foulMap.get(fouler.id) >= NBA.FOUL_LIMIT) {
      this._handleDisqualification(gameState, fouler.id, defSide, periodLog, periodName);
    }
    
    // Shoot free throws
    const ftRate = this._getFreeThrowRate(target);
    let ftm = 0;
    const fta = 2;
    for (let i = 0; i < fta; i++) {
      if (Math.random() < ftRate) ftm++;
    }
    
    // Add points
    if (foulingTeamIsHome) {
      gameState.awayScore += ftm;
    } else {
      gameState.homeScore += ftm;
    }
    
    periodLog.push({
      type: 'intentional_foul',
      team: defSide,
      period: periodName,
      clock: Math.max(0, gameState.periodClock),
      fouler: fouler.id,
      fouled: target.id,
      fta,
      ftm,
      points: ftm,
    });
    
    return { points: ftm, teamFoul: true };
  }

  // ── Handle player disqualification ──────────────────────────────────
  static _handleDisqualification(gameState, playerId, teamSide, periodLog, periodName) {
    const activeIds = gameState[teamSide + 'ActiveIds'];
    const benchIds = gameState[teamSide + 'BenchIds'];
    const idx = activeIds.indexOf(playerId);
    
    if (idx === -1) return; // Player not on court
    
    // Must substitute out
    if (benchIds.length === 0) return; // No one to sub in (shouldn't happen in normal game)
    
    // Pick best available bench player
    const players = gameState[teamSide + 'Team'].players;
    const foulMap = gameState[teamSide + 'PlayerFouls'];
    const benchPlayers = players.filter(p => 
      benchIds.includes(p.id) && (foulMap.get(p.id) || 0) < NBA.FOUL_LIMIT
    );
    
    if (benchPlayers.length === 0) return;
    
    const subIn = benchPlayers.reduce((best, p) => 
      p.overall_rating > best.overall_rating ? p : best
    );
    
    activeIds.splice(idx, 1, subIn.id);
    const benchIdx = benchIds.indexOf(subIn.id);
    if (benchIdx !== -1) benchIds.splice(benchIdx, 1, playerId);
    
    periodLog.push({
      type: 'disqualification',
      team: teamSide,
      period: periodName,
      clock: Math.max(0, gameState.periodClock),
      player: playerId,
      replacedBy: subIn.id,
      fouls: NBA.FOUL_LIMIT,
    });
  }

  // ── Free throw rate from player rating ──────────────────────────────
  static _getFreeThrowRate(player) {
    const skill = player.free_throw || player.three_point || 75;
    // Map rating to realistic FT% with compression toward mean
    // 99 rating → ~92%, 75 rating → ~76%, 50 rating → ~63%
    return Math.min(0.92, Math.max(0.55, 0.55 + (skill / 100) * 0.37));
  }

  // ── Possession simulation ───────────────────────────────────────────
  static _simulatePossession(offense, defense, isHomePossession, gameState, context = {}) {
    const config = gameState.config;
    const { isTransitionOpportunity, isEndOfQuarter, isLateShotClock, shotClockRemaining } = context;

    // Select primary ball handler based on usage rate
    const primaryHandler = this._selectPrimaryHandler(offense, gameState, isHomePossession);
    const primaryDefender = this._selectPrimaryDefender(defense, primaryHandler);
    
    // Select play type (affected by transition opportunity, shot clock, clutch)
    const playType = this._selectPlayType(offense, defense, gameState, isHomePossession, {
      isTransitionOpportunity, isLateShotClock, isEndOfQuarter
    });
    
    const defenseScheme = this._selectDefensiveScheme(defense, offense);
    
    // Check for double team (elite scorers in clutch/isolation)
    const isDoubleTeamed = this._shouldDoubleTeam(primaryHandler, playType, gameState);

    // Execute the play
    let shotResult;
    switch (playType) {
      case 'isolation':
        shotResult = this._executeIsolation(primaryHandler, primaryDefender, defenseScheme, gameState, isDoubleTeamed);
        break;
      case 'pick_and_roll': {
        const screener = this._selectScreener(offense);
        const rollDefender = this._selectRollDefender(defense, screener);
        shotResult = this._executePickAndRoll(primaryHandler, screener, primaryDefender, rollDefender, defenseScheme, gameState);
        break;
      }
      case 'spot_up': {
        const shooterPick = this._selectShooter(offense, gameState, isHomePossession, primaryHandler);
        const defender = this._selectClosestDefender(defense, shooterPick);
        shotResult = this._executeSpotUp(shooterPick, defender, defenseScheme, gameState);
        break;
      }
      case 'post_up': {
        const postPlayer = this._selectPostPlayer(offense);
        const postDefender = this._selectPostDefender(defense, postPlayer);
        shotResult = this._executePostUp(postPlayer, postDefender, defenseScheme, gameState);
        break;
      }
      case 'transition':
        shotResult = this._executeTransition(offense, defense, defenseScheme, gameState);
        break;
      case 'cut':
        shotResult = this._executeCut(offense, defense, defenseScheme, gameState, primaryHandler);
        break;
      default:
        shotResult = this._executeIsolation(primaryHandler, primaryDefender, defenseScheme, gameState, false);
    }

    const shooter = shotResult.shooter || primaryHandler;

    // ── Turnover check ──────────────────────────────────────────────
    const turnoverProb = this._calculateTurnoverProbability(
      primaryHandler, primaryDefender, playType, gameState, isDoubleTeamed
    );
    const turnover = Math.random() < turnoverProb;
    const points = turnover ? 0 : shotResult.points;

    // ── Team foul tracking ──────────────────────────────────────────
    let teamFoul = false;
    let fouler = null;
    if (shotResult.isFoul) {
      // Select fouler based on defensive positioning and play type
      fouler = this._selectFouler(defense, shooter, playType, shotResult.shotType);
      
      const defSide = isHomePossession ? 'away' : 'home';
      const foulMap = gameState[defSide + 'PlayerFouls'];
      foulMap.set(fouler.id, (foulMap.get(fouler.id) || 0) + 1);
      teamFoul = true;

      // Check for disqualification
      if (foulMap.get(fouler.id) >= NBA.FOUL_LIMIT) {
        const periodName = gameState.gameLog.length > 0 ? 
          `Q${gameState.gameLog.length}` : 'Q1';
        this._handleDisqualification(gameState, fouler.id, defSide, 
          gameState.gameLog[gameState.gameLog.length - 1] || [], periodName);
      }
    }

    // ── Check for non-shooting fouls (before shot attempt) ─────────
    // These happen on drives, post-ups, etc. and can result in FTs if in bonus
    let nonShootingFoulFTs = null;
    if (!turnover && !shotResult.isFoul && Math.random() < this._nonShootingFoulProb(playType, gameState)) {
      const defSide = isHomePossession ? 'away' : 'home';
      const teamFouls = defSide === 'home' ? gameState.homeTeamFouls : gameState.awayTeamFouls;
      
      if (teamFouls >= NBA.TEAM_FOUL_BONUS) {
        // In bonus - award free throws
        const foulPlayer = this._selectFouler(defense, primaryHandler, playType, 'nonShooting');
        const foulMap = gameState[defSide + 'PlayerFouls'];
        foulMap.set(foulPlayer.id, (foulMap.get(foulPlayer.id) || 0) + 1);
        teamFoul = true;
        
        if (defSide === 'home') gameState.homeTeamFouls++;
        else gameState.awayTeamFouls++;
        
        const ftCount = teamFouls >= NBA.TEAM_FOUL_DOUBLE_BONUS ? 2 : 
          (Math.random() < 0.5 ? 1 : 2); // Single bonus: 1-and-1
        const ftRate = this._getFreeThrowRate(primaryHandler);
        let ftm = 0;
        let fta = ftCount;
        
        for (let i = 0; i < ftCount; i++) {
          if (Math.random() < ftRate) ftm++;
          // In 1-and-1, if first FT missed, no second attempt
          if (ftCount === 2 && teamFouls < NBA.TEAM_FOUL_DOUBLE_BONUS && i === 0 && ftm === 0) {
            fta = 1;
            break;
          }
        }
        
        nonShootingFoulFTs = { fta, ftm, points: ftm, fouler: foulPlayer };
        if (ftm > 0) {
          if (isHomePossession) gameState.homeScore += ftm;
          else gameState.awayScore += ftm;
        }
      }
    }

    // ── Offensive rebound ───────────────────────────────────────────
    let offensiveRebound = false;
    let offRebounderId = null;
    if (shotResult.missed && !shotResult.isFoul && !nonShootingFoulFTs) {
      const orebCheck = this._checkOffensiveRebound(offense, defense, shotResult, gameState, playType);
      offensiveRebound = orebCheck.success;
      offRebounderId = orebCheck.rebounderId;
    }

    // ── Defensive rebound (when no OREB and no foul) ────────────────
    let defensiveRebound = false;
    let defRebounderId = null;
    if (shotResult.missed && !shotResult.isFoul && !offensiveRebound && !nonShootingFoulFTs) {
      const drebCheck = this._selectDefensiveRebounder(defense, shotResult);
      defensiveRebound = true;
      defRebounderId = drebCheck;
    }

    // ── Steal attribution ───────────────────────────────────────────
    let steal = null;
    if (turnover && Math.random() < 0.58) { // ~58% of turnovers are steals
      steal = this._selectStealer(defense, primaryHandler, playType);
    }

    // ── Block attribution ───────────────────────────────────────────
    let block = null;
    if (!turnover && shotResult.missed && !shotResult.isFoul && !nonShootingFoulFTs) {
      block = this._checkForBlock(defense, shotResult, shooter);
      if (block) {
        // Block typically leads to defensive rebound or goes out of bounds
        if (Math.random() < 0.65) {
          // Rebound by blocking team (often the blocker)
          defensiveRebound = true;
          defRebounderId = block.id;
        } else {
          // Out of bounds - possession to defense
          defensiveRebound = false;
        }
      }
    }

    // ── Assist attribution ──────────────────────────────────────────
    let assistedBy = null;
    if (shotResult.assist && !turnover) {
      assistedBy = this._determineAssister(offense, shooter, primaryHandler, gameState, isHomePossession);
    }

    // ── Calculate total points for this possession ──────────────────
    const totalPoints = points + (nonShootingFoulFTs?.points || 0);

    return {
      playType,
      points: totalPoints,
      shotResult: nonShootingFoulFTs ? { ...shotResult, nonShootingFoulFTs } : shotResult,
      turnovers: turnover,
      handler: primaryHandler,
      shooter,
      defender: primaryDefender,
      defensivePlayers: defense,
      assist: shotResult.assist || false,
      assistedBy,
      offensiveRebound,
      offRebounderId,
      defensiveRebound,
      defRebounderId,
      steal,
      block,
      fouler,
      teamFoul,
      isDoubleTeamed,
      isTransitionOpportunity: context.isTransitionOpportunity,
    };
  }

  // ── Non-shooting foul probability ───────────────────────────────────
  static _nonShootingFoulProb(playType, gameState) {
    // Higher for drives, post-ups; lower for spot-ups
    const baseProbs = {
      isolation: 0.045,
      pick_and_roll: 0.055,
      spot_up: 0.015,
      post_up: 0.065,
      transition: 0.035,
      cut: 0.040,
    };
    let prob = baseProbs[playType] || 0.035;
    
    // Slight increase in clutch (more physical)
    if (gameState.clutchActive) prob *= 1.15;
    
    return prob;
  }

  // ── Select fouler based on situation ────────────────────────────────
  static _selectFouler(defense, offensivePlayer, playType, shotType) {
    if (shotType === 'nonShooting') {
      // On-ball foul - likely the primary defender
      return this._selectPrimaryDefender(defense, offensivePlayer);
    }
    
    // For shooting fouls, weight by position match and foul tendency
    const weights = defense.map(p => {
      let weight = 100;
      // Post defenders more likely to foul on inside shots
      if ((shotType === 'rim' || playType === 'post_up') && ['C', 'PF'].includes(p.position)) {
        weight *= 1.4;
      }
      // Perimeter defenders more likely to foul on jump shots
      if ((shotType === 'threePoint' || shotType === 'midRange') && ['PG', 'SG', 'SF'].includes(p.position)) {
        weight *= 1.2;
      }
      // Add randomness
      weight *= (0.7 + Math.random() * 0.6);
      return { player: p, weight };
    });
    
    const total = weights.reduce((s, w) => s + w.weight, 0);
    let r = Math.random() * total;
    for (const w of weights) {
      r -= w.weight;
      if (r <= 0) return w.player;
    }
    return weights[0].player;
  }

  // ── Double team logic ───────────────────────────────────────────────
  static _shouldDoubleTeam(player, playType, gameState) {
    // Double team in these situations:
    // 1. Elite scorer in isolation/post-up
    // 2. Clutch time
    // 3. Player has been hot
    
    const isEliteScorer = (player.inside_scoring || 70) > 85 || 
                          (player.three_point || 70) > 88 ||
                          (player.mid_range || 70) > 85;
    
    if (!isEliteScorer) return false;
    if (playType !== 'isolation' && playType !== 'post_up') return false;
    
    let prob = 0.25;
    if (gameState.clutchActive) prob += 0.20;
        
    return Math.random() < Math.min(0.60, prob);
  }

  // ── Select stealer ──────────────────────────────────────────────────
  static _selectStealer(defense, handler, playType) {
    const weights = defense.map(p => {
      let base = (p.steal_rating || p.perimeter_defense || 50);
      // Guards more likely to get steals
      if (p.position === 'PG') base *= 1.35;
      else if (p.position === 'SG') base *= 1.25;
      else if (p.position === 'SF') base *= 1.10;
      else base *= 0.75;
      // On-ball steals more likely for perimeter defenders
      if (playType === 'isolation' || playType === 'pick_and_roll') {
        if (['PG', 'SG', 'SF'].includes(p.position)) base *= 1.15;
      }
      // Add randomness
      return Math.pow(base, 1.5) * (0.5 + Math.random());
    });
    const total = weights.reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (let i = 0; i < defense.length; i++) {
      r -= weights[i];
      if (r <= 0) return defense[i];
    }
    return defense[defense.length - 1];
  }

  // ── Check for block ─────────────────────────────────────────────────
  static _checkForBlock(defense, shotResult, shooter) {
    const shotType = shotResult.shotType;
    
    // Base block rates by shot type
    const baseRates = {
      rim: 0.085,      // ~8.5% of rim attempts blocked
      midRange: 0.025, // ~2.5% of mid-range blocked
      threePoint: 0.004, // ~0.4% of 3s blocked (mostly on closeouts)
    };
    
    let blockProb = baseRates[shotType] || 0.03;
    
    // Find best potential blocker
    const blockerWeights = defense.map(p => {
      let weight = (p.blocks || 50) * 0.5 + (p.post_defense || 50) * 0.3 + (p.rebounding || 50) * 0.2;
      // Bigs much more likely to block
      if (p.position === 'C') weight *= 1.6;
      else if (p.position === 'PF') weight *= 1.35;
      else if (p.position === 'SF') weight *= 0.9;
      else weight *= 0.6;
      // Proximity to shooter matters (simplified: position match)
      if (shotType === 'rim' && ['C', 'PF'].includes(p.position)) weight *= 1.2;
      if (shotType === 'midRange' && ['SF', 'PF'].includes(p.position)) weight *= 1.1;
      return { player: p, weight };
    });
    
    const bestBlocker = blockerWeights.reduce((best, b) => b.weight > best.weight ? b : best);
    const ratingFactor = (bestBlocker.player.blocks || 50) / 50;
    
    // Scale probability by best blocker's ability
    blockProb *= (0.5 + ratingFactor * 0.5);
    
    if (Math.random() < blockProb) {
      return bestBlocker.player;
    }
    return null;
  }

  // ── Select defensive rebounder ──────────────────────────────────────
  static _selectDefensiveRebounder(defense, shotResult) {
    // Weighted by rebounding rating, position, and shot location
    const weights = defense.map(p => {
      let weight = p.rebounding || 50;
      // Bigs heavily favored for defensive rebounds
      if (p.position === 'C') weight *= 1.55;
      else if (p.position === 'PF') weight *= 1.35;
      else if (p.position === 'SF') weight *= 1.0;
      else weight *= 0.65;
      // Rim shots: bigs even more important
      if (shotResult.shotType === 'rim' && ['C', 'PF'].includes(p.position)) {
        weight *= 1.15;
      }
      // 3PT shots: guards have more chances (longer rebound)
      if (shotResult.shotType === 'threePoint' && ['PG', 'SG'].includes(p.position)) {
        weight *= 1.2;
      }
      // Add some randomness
      weight *= (0.7 + Math.random() * 0.6);
      return { id: p.id, weight };
    });
    
    const total = weights.reduce((s, w) => s + w.weight, 0);
    let r = Math.random() * total;
    for (const w of weights) {
      r -= w.weight;
      if (r <= 0) return w.id;
    }
    return weights[0].id;
  }

  // ── Determine assister ──────────────────────────────────────────────
  static _determineAssister(offense, shooter, handler, gameState, isHomePossession) {
    if (shooter.id !== handler.id) {
      // Most common: handler passed to shooter
      if (Math.random() < 0.85) return handler;
    }
    
    // Otherwise, use passing graph to find likely assister
    const graph = isHomePossession ? gameState.homePassGraph : gameState.awayPassGraph;
    const teammateIds = new Set(offense.filter(p => p.id !== shooter.id).map(p => p.id));
    const nextId = graph.step(shooter.id);
    if (nextId && teammateIds.has(nextId)) {
      return offense.find(p => p.id === nextId) || null;
    }
    
    // Fallback: rating-weighted lottery among teammates
    const teammates = offense.filter(p => p.id !== shooter.id);
    if (teammates.length === 0) return null;
    
    const scores = teammates.map(p => {
      let base = p.passing || 50;
      // Point guards more likely to have assists
      if (p.position === 'PG') base *= 1.4;
      else if (p.position === 'SG') base *= 1.1;
      return Math.pow(base, 1.5);
    });
    
    const total = scores.reduce((s, v) => s + v, 0);
    let r = Math.random() * total;
    for (let i = 0; i < teammates.length; i++) {
      r -= scores[i];
      if (r <= 0) return teammates[i];
    }
    return teammates[teammates.length - 1];
  }

  // ── Select primary handler with usage rate model ────────────────────
  static _selectPrimaryHandler(players, gameState, isHomePossession) {
    // Usage rate based on: ball handling, scoring ability, position
    // Stars should handle the ball more
    const weights = players.map(p => {
      let usage = (p.ball_handling || 50) * 0.35 + 
                  ((p.three_point || 70) + (p.inside_scoring || 70) + (p.mid_range || 70)) / 3 * 0.35 +
                  (p.overall_rating || 70) * 0.30;
      
      // Position modifier (PGs handle more)
      if (p.position === 'PG') usage *= 1.45;
      else if (p.position === 'SG') usage *= 1.15;
      else if (p.position === 'SF') usage *= 0.95;
      else if (p.position === 'PF') usage *= 0.75;
      else usage *= 0.65;
      
      // Clutch: stars take over even more
      if (gameState.clutchActive && (p.overall_rating || 70) > 82) {
        usage *= 1.35;
      }
      
      // Fatigue reduces usage (tired players get fewer touches)
      const fatigue = (gameState.homeFatigue.get(p.id) || gameState.awayFatigue.get(p.id) || 0);
      usage *= (1 - fatigue * 0.3);
      
      return Math.pow(usage, 2); // Square to amplify differences
    });
    
    const total = weights.reduce((s, v) => s + v, 0);
    let r = Math.random() * total;
    for (let i = 0; i < players.length; i++) {
      r -= weights[i];
      if (r <= 0) return players[i];
    }
    return players[players.length - 1];
  }

  // ── Select primary defender (matches up with offensive player) ───────
  static _selectPrimaryDefender(defense, offensivePlayer) {
    // Best perimeter defender typically guards the ball
    // But also consider position matching
    const positionMatchScore = (defender) => {
      const posOrder = { PG: 1, SG: 2, SF: 3, PF: 4, C: 5 };
      const offPos = posOrder[offensivePlayer.position] || 3;
      const defPos = posOrder[defender.position] || 3;
      const diff = Math.abs(offPos - defPos);
      return Math.max(0, 1 - diff * 0.25); // Penalty for position mismatch
    };
    
    const scores = defense.map(p => {
      const defSkill = (p.perimeter_defense || 50) * 0.5 + (p.speed || 70) * 0.3 + (p.steal_rating || 50) * 0.2;
      const posMatch = positionMatchScore(p);
      return defSkill * posMatch;
    });
    
    let bestIdx = 0;
    for (let i = 1; i < scores.length; i++) {
      if (scores[i] > scores[bestIdx]) bestIdx = i;
    }
    return defense[bestIdx];
  }

  // ── Select post defender ────────────────────────────────────────────
  static _selectPostDefender(defense, postPlayer) {
    // Best post defender, with some position match consideration
    const posOrder = { PG: 1, SG: 2, SF: 3, PF: 4, C: 5 };
    const postPos = posOrder[postPlayer.position] || 4;
    
    return defense.reduce((best, p) => {
      const defScore = (p.post_defense || 50) * 0.6 + (p.strength || 70) * 0.3 + (p.rebounding || 50) * 0.1;
      const posMatch = Math.max(0.5, 1 - Math.abs(posOrder[p.position] - postPos) * 0.2);
      const score = defScore * posMatch;
      const bestScore = (best.post_defense || 50) * 0.6 + (best.strength || 70) * 0.3 + (best.rebounding || 50) * 0.1;
      const bestPosMatch = Math.max(0.5, 1 - Math.abs(posOrder[best.position] - postPos) * 0.2);
      return score > bestScore * bestPosMatch ? p : best;
    });
  }

  // ── Defensive scheme selection ──────────────────────────────────────
  static _selectDefensiveScheme(defense, offense) {
    const avgPerimeter = defense.reduce((s, p) => s + p.perimeter_defense, 0) / defense.length;
    const avgPost = defense.reduce((s, p) => s + p.post_defense, 0) / defense.length;
    const avgSpeed = defense.reduce((s, p) => s + p.speed, 0) / defense.length;
    
    // Check if offense is 3PT heavy
    const offThreeAvg = offense.reduce((s, p) => s + p.three_point, 0) / offense.length;
    
    // Elite perimeter defense + speed = switch everything
    if (avgPerimeter > 82 && avgSpeed > 82) return 'switch';
    // Good post defense = drop coverage
    if (avgPost > 80 && avgPerimeter < 78) return 'drop';
    // Zone if defense is balanced but not elite anywhere
    if (avgPerimeter > 72 && avgPost > 72 && avgPerimeter < 82 && avgPost < 82) {
      // More likely to zone against 3PT heavy teams
      if (offThreeAvg > 78) return 'zone';
    }
    return 'manToMan';
  }

  // ── Play type selection with Markov chain + situational factors ─────
  static _selectPlayType(offense, defense, gameState, isHomePossession, context = {}) {
    const { isTransitionOpportunity, isLateShotClock, isEndOfQuarter } = context;
    
    const threeAvg = offense.reduce((s, p) => s + p.three_point, 0) / offense.length;
    const insideAvg = offense.reduce((s, p) => s + p.inside_scoring, 0) / offense.length;
    const passAvg = offense.reduce((s, p) => s + p.passing, 0) / offense.length;
    const speedAvg = offense.reduce((s, p) => s + p.speed, 0) / offense.length;

    const bias = {
      isolation: 1, pick_and_roll: 1, spot_up: 1, post_up: 1, transition: 1, cut: 1,
    };

    // Team tendency adjustments
    if (threeAvg > 82) { bias.spot_up *= 1.40; bias.pick_and_roll *= 1.10; bias.post_up *= 0.6; }
    if (insideAvg > 82) { bias.post_up *= 1.65; bias.isolation *= 1.15; bias.cut *= 1.20; bias.spot_up *= 0.85; }
    if (passAvg > 82) { bias.pick_and_roll *= 1.20; bias.cut *= 1.25; bias.spot_up *= 1.10; }
    if (speedAvg > 82) { bias.transition *= 1.35; bias.cut *= 1.15; }

    // Transition opportunity forces transition
    if (isTransitionOpportunity) {
      bias.transition *= 4.0;
      bias.isolation *= 0.3;
      bias.post_up *= 0.2;
      bias.spot_up *= 0.4;
    }

    // Late shot clock: quick action
    if (isLateShotClock) {
      bias.isolation *= 1.8;
      bias.spot_up *= 1.4;
      bias.post_up *= 0.5;
      bias.pick_and_roll *= 0.7;
      bias.cut *= 0.3;
    }

    // End of quarter: isolation for star
    if (isEndOfQuarter) {
      bias.isolation *= 2.2;
      bias.transition *= 0.3;
      bias.post_up *= 0.6;
    }

    // Clutch adjustments
    if (gameState.clutchActive) {
      bias.isolation *= 1.65;
      bias.pick_and_roll *= 0.85;
      bias.transition *= 0.75;
      bias.spot_up *= 1.15; // Open 3s in clutch
    }

    // Overtime: more conservative, go to best players
    if (gameState.isOvertime) {
      bias.isolation *= 1.40;
      bias.pick_and_roll *= 0.90;
      bias.transition *= 0.80;
    }

    // Momentum effects
    if (gameState.momentum > 0.3) {
      bias.transition *= 1.25;
      bias.isolation *= 1.10;
    } else if (gameState.momentum < -0.3) {
      // Falling behind: more ball movement
      bias.pick_and_roll *= 1.15;
      bias.cut *= 1.10;
      bias.isolation *= 0.85;
    }

    const chain = isHomePossession ? gameState.homePlayChain : gameState.awayPlayChain;
    const lastPlay = isHomePossession ? gameState.homeLastPlay : gameState.awayLastPlay;
    return chain.sample(lastPlay, (playType) => bias[playType] ?? 1);
  }

  // ── Turnover probability ────────────────────────────────────────────
  static _calculateTurnoverProbability(handler, defender, playType, gameState, isDoubleTeamed) {
    const offSkill = (handler.ball_handling || 50) * 0.60 + (handler.passing || 50) * 0.40;
    const defSkill = (defender.steal_rating || defender.perimeter_defense || 50) * 0.6 +
                     (defender.perimeter_defense || 50) * 0.4;
    const skillDiff = (defSkill - offSkill) / 100;

    // Play type modifiers (based on NBA turnover rates by play type)
    const playMod = {
      isolation: 0.005,       // Slightly above average
      pick_and_roll: 0.008,   // Higher due to trapping
      spot_up: -0.020,        // Much lower (catch and shoot)
      post_up: 0.010,         // Higher (double teams, strips)
      transition: 0.025,      // Much higher (chaos, passing)
      cut: -0.015,            // Lower (simple play)
    }[playType] || 0;

    // Double team significantly increases turnover risk
    const doubleTeamMod = isDoubleTeamed ? 0.04 : 0;

    const fatigue = gameState.homeFatigue.get(handler.id) || gameState.awayFatigue.get(handler.id) || 0;
    const fatigueFactor = 0.10 * fatigue;
    const momentumFactor = -gameState.momentum * 0.03;

    let rate = NBA.TURNOVER_RATE + skillDiff * 0.08 + playMod + doubleTeamMod + fatigueFactor + momentumFactor;
    return Math.min(0.25, Math.max(0.05, rate));
  }

  // ── Contest level determination ─────────────────────────────────────
  static _determineContestLevel(offensePlayer, defender, playType, defenseScheme, isDoubleTeamed, gameState) {
    // Returns: 'open', 'tight', or 'blanket'
    
    const offSkill = this._getOffensiveSkillForShot(offensePlayer, playType);
    const defSkill = (defender.perimeter_defense || 70) * 0.5 + (defender.speed || 70) * 0.5;
    
    // Base contest from skill differential
    const skillDiff = (defSkill - offSkill) / 100;
    
    // Starting probabilities for each contest level
    let probs = {
      open: 0.35,
      tight: 0.45,
      blanket: 0.20,
    };
    
    // Adjust based on skill differential
    if (skillDiff > 0.2) {
      // Defender much better: more blanket coverage
      probs.blanket += 0.15;
      probs.open -= 0.15;
    } else if (skillDiff < -0.2) {
      // Offense much better: more open looks
      probs.open += 0.15;
      probs.blanket -= 0.10;
    }
    
    // Double team: much tighter coverage
    if (isDoubleTeamed) {
      probs.blanket += 0.25;
      probs.open -= 0.20;
      probs.tight -= 0.05;
    }
    
    // Defensive scheme effects
    if (defenseScheme === 'switch') {
      // Switching can create mismatches (more open) or confusion (more tight)
      probs.open += 0.05;
      probs.tight -= 0.05;
    } else if (defenseScheme === 'drop') {
      // Drop coverage: more open 3s, tighter at rim
      probs.open += 0.08;
      probs.blanket -= 0.08;
    } else if (defenseScheme === 'zone') {
      // Zone: can create confusion, sometimes wide open shooters
      probs.open += 0.10;
      probs.tight -= 0.05;
    }
    
    // Transition: much more open
    if (playType === 'transition') {
      probs.open += 0.25;
      probs.tight -= 0.15;
      probs.blanket -= 0.10;
    }
    
    // Spot-up shooters who are open get open looks
    if (playType === 'spot_up') {
      probs.open += 0.10;
      probs.blanket -= 0.08;
    }
    
    // Fatigue affects defensive intensity
    const defFatigue = gameState.homeFatigue.get(defender.id) || gameState.awayFatigue.get(defender.id) || 0;
    probs.open += defFatigue * 0.15;
    probs.blanket -= defFatigue * 0.10;
    
    // Normalize
    const total = probs.open + probs.tight + probs.blanket;
    probs.open /= total;
    probs.tight /= total;
    probs.blanket /= total;
    
    // Sample
    const r = Math.random();
    if (r < probs.open) return 'open';
    if (r < probs.open + probs.tight) return 'tight';
    return 'blanket';
  }

  // ── Helper to get offensive skill relevant to shot ──────────────────
  static _getOffensiveSkillForShot(player, playType) {
    switch (playType) {
      case 'isolation':
        return (player.ball_handling || 70) * 0.4 + (player.mid_range || 70) * 0.3 + (player.three_point || 70) * 0.3;
      case 'pick_and_roll':
      case 'spot_up':
        return (player.three_point || 70) * 0.5 + (player.mid_range || 70) * 0.3 + (player.ball_handling || 70) * 0.2;
      case 'post_up':
        return (player.inside_scoring || 70) * 0.6 + (player.strength || 70) * 0.3 + (player.mid_range || 70) * 0.1;
      case 'transition':
        return (player.speed || 70) * 0.4 + (player.inside_scoring || 70) * 0.3 + (player.three_point || 70) * 0.3;
      case 'cut':
        return (player.speed || 70) * 0.4 + (player.inside_scoring || 70) * 0.6;
      default:
        return player.overall_rating || 70;
    }
  }

  // ── Shot attempt with contest levels ────────────────────────────────
  static _attemptShot(player, defender, shotQuality, playType, gameState, options = {}) {
    const { isDoubleTeamed = false, subPlayType = null } = options;
    const actualPlayType = subPlayType || playType;
    const config = gameState.config;
    
    // Get shot distribution
    const dist = SHOT_DISTRIBUTIONS[actualPlayType] || SHOT_DISTRIBUTIONS[playType];
    const rand = Math.random();
    let shotType, isThree;
    if (rand < (dist.threePoint || 0)) {
      shotType = 'threePoint'; isThree = true;
    } else if (rand < (dist.threePoint || 0) + (dist.midRange || 0)) {
      shotType = 'midRange'; isThree = false;
    } else {
      shotType = 'rim'; isThree = false;
    }

    // Determine contest level
    const defenseScheme = this._selectDefensiveScheme(gameState.awayTeam.players, gameState.homeTeam.players);
    const contest = this._determineContestLevel(player, defender, playType, defenseScheme, isDoubleTeamed, gameState);

    // Check for foul
    const foulProb = this._getFoulProbability(player, defender, actualPlayType, shotType, gameState);
    
    if (Math.random() < foulProb) {
      return this._handleShootingFoul(player, isThree, gameState);
    }

    // Get base make rate from contest level
    let baseMake = MAKE_RATES[shotType]?.[contest] || 0.40;

    // Player skill adjustment
    let playerSkill;
    if (isThree) {
      playerSkill = player.three_point || 70;
    } else if (shotType === 'rim') {
      playerSkill = player.inside_scoring || 70;
    } else {
      playerSkill = player.mid_range || 70;
    }
    
    // Scale make rate by player skill (centered on 70 rating)
    const skillMultiplier = 0.7 + (playerSkill / 100) * 0.6;
    baseMake *= skillMultiplier;

    // Shot quality adjustment (from the config's shot quality calculation)
    const qualityMultiplier = 0.85 + (shotQuality * 0.3);
    baseMake *= qualityMultiplier;

    // Fatigue penalty
    const fatigue = gameState.homeFatigue.get(player.id) || gameState.awayFatigue.get(player.id) || 0;
    baseMake -= fatigue * 0.06;

    // Chemistry bonus
    const chemistry = isHomePossessionHelper(gameState, player) ? 
      gameState.homeChemistry : gameState.awayChemistry;
    baseMake += chemistry * 0.02;

    // Home court advantage (small boost)
    if (this._isHomePlayer(gameState, player)) {
      baseMake += 0.008; // ~0.8% boost from home court
    }

    baseMake = Math.min(0.82, Math.max(0.12, baseMake));

    // Bayesian blend with player's live shot model
    const shotModel = gameState.shotModels.get(player.id, shotType, playerSkill);
    const posteriorMean = shotModel.mean();
    const confidence = 1 - Math.min(1, shotModel.variance() * 10);
    const bayesWeight = 0.30 * confidence;
    let finalMake = baseMake * (1 - bayesWeight) + posteriorMean * bayesWeight;
    finalMake = Math.min(0.82, Math.max(0.12, finalMake));

    const made = Math.random() < finalMake;
    shotModel.update(made);

    // Assist probability
    const assistProb = ASSIST_PROBS[actualPlayType] || ASSIST_PROBS[playType] || 0.40;
    const isAssist = made && Math.random() < assistProb;

    return {
      points: made ? (isThree ? 3 : 2) : 0,
      fga: isThree ? 0 : 1, fgm: (made && !isThree) ? 1 : 0,
      fga3: isThree ? 1 : 0, fgm3: (made && isThree) ? 1 : 0,
      fta: 0, ftm: 0,
      shotQuality, isFoul: false,
      missed: !made,
      shotType,
      assist: isAssist,
      contest,
    };
  }

  // ── Handle shooting foul ────────────────────────────────────────────
  static _handleShootingFoul(player, isThree, gameState) {
    const isAndOne = Math.random() < 0.18; // ~18% of shooting fouls are and-1s
    const ftAttempts = isThree ? 3 : (isAndOne ? 1 : 2);
    const ftMakeRate = this._getFreeThrowRate(player);
    let ftm = 0;
    for (let i = 0; i < ftAttempts; i++) {
      if (Math.random() < ftMakeRate) ftm++;
    }

    // And-1: count the made basket too
    if (isAndOne) {
      const points = 2 + ftm; // 2 for the made basket + FTs
      return {
        points,
        fga: 1, fgm: 1, fga3: 0, fgm3: 0,
        fta: ftAttempts, ftm,
        shotQuality: 0.6, isFoul: true, missed: false,
        shotType: 'rim', assist: false, isAndOne: true,
      };
    }

    return {
      points: ftm,
      fga: 0, fgm: 0, fga3: 0, fgm3: 0,
      fta: ftAttempts, ftm,
      shotQuality: 0, isFoul: true, missed: false,
      shotType: isThree ? 'threePoint' : 'rim', assist: false,
    };
  }

  // ── Foul probability by play type and shot type ─────────────────────
  static _getFoulProbability(player, defender, playType, shotType, gameState) {
    const baseProb = FOUL_PROBS[shotType]?.[playType] || 0.06;
    
    // Defender discipline
    const defSkill = (shotType === 'rim' || playType === 'post_up') 
      ? (defender.post_defense || 70) 
      : (defender.perimeter_defense || 70);
    const disciplineFactor = 1.0 + (1.0 - defSkill / 100) * 0.6;
    
    // Player's foul-drawing ability
    const drawFoul = (player.inside_scoring || 70) / 100 * 0.03;
    
    // Clutch: more physical play
    const clutchMod = gameState.clutchActive ? 1.12 : 1.0;
    
    let prob = baseProb * disciplineFactor + drawFoul;
    prob *= clutchMod;
    
    return Math.min(0.20, Math.max(0.02, prob));
  }

  // ── Helper to check if player is on home team ───────────────────────
  static _isHomePlayer(gameState, player) {
    return gameState.homeTeam.players.some(p => p.id === player.id);
  }

  // ── Shot quality calculation ────────────────────────────────────────
  static _calculateShotQuality(player, defender, playType, gameState, defenseScheme = 'manToMan') {
    const sqc = gameState.config.shotQualityCalculation;
    const mapAttr = (camel) => camel.replace(/([A-Z])/g, '_$1').toLowerCase();

    const getOffWeights = () => {
      if (playType === 'pick_and_roll') return sqc.offensiveSkillWeights.pick_and_roll?.handler || sqc.offensiveSkillWeights.isolation;
      return sqc.offensiveSkillWeights[playType] || sqc.offensiveSkillWeights.isolation;
    };
    const getDefWeights = () => {
      if (playType === 'pick_and_roll') return sqc.defensiveSkillWeights.pick_and_roll?.handlerDefender || sqc.defensiveSkillWeights.isolation;
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
    quality = quality * 0.45;
    quality += 0.5;
    quality *= posFactor;

    quality += (Math.random() - 0.5) * (sqc.randomnessFactor || 0.10);

    const chemistry = this._isHomePlayer(gameState, player) ? 
      gameState.homeChemistry : gameState.awayChemistry;
    quality += chemistry * (gameState.config.chemistry.chemistryEffectOnShotQuality || 0.02);
    quality += gameState.momentum * (gameState.config.momentumSystem?.momentumEffectOnSuccess || 0.02);

    const fatigue = gameState.homeFatigue.get(player.id) || gameState.awayFatigue.get(player.id) || 0;
    quality -= fatigue * 0.10;

    const schemeMod = gameState.config.defensiveSchemes?.[defenseScheme] || {};
    const schemeKey = playType === 'pick_and_roll' ? 'pickAndRollMod' : playType + 'Mod';
    quality += (schemeMod[schemeKey] || 0);

    return Math.min(0.92, Math.max(0.08, quality));
  }

  // ── Play executions ─────────────────────────────────────────────────
  static _executeIsolation(handler, defender, scheme, gameState, isDoubleTeamed) {
    const qual = this._calculateShotQuality(handler, defender, 'isolation', gameState, scheme);
    return { 
      ...this._attemptShot(handler, defender, qual, 'isolation', gameState, { isDoubleTeamed }), 
      shooter: handler 
    };
  }

  static _executePickAndRoll(handler, screener, defender, rollDefender, scheme, gameState) {
    // Decision tree: roll, pop, pull-up, or reject
    const rollSkill = (screener.inside_scoring || 70) * 0.6 + (screener.speed || 70) * 0.4;
    const popSkill = (screener.three_point || 70) * 0.7 + (screener.mid_range || 70) * 0.3;
    const handlerPullUpSkill = (handler.mid_range || 70) * 0.5 + (handler.three_point || 70) * 0.5;
    const rollDefQuality = (rollDefender.post_defense || 70);
    
    // Calculate effectiveness of each option
    const rollEffectiveness = rollSkill * (1 - rollDefQuality / 150);
    const popEffectiveness = popSkill * 0.9;
    const pullUpEffectiveness = handlerPullUpSkill * 0.85;
    
    // Weighted random selection based on effectiveness
    const total = rollEffectiveness + popEffectiveness + pullUpEffectiveness;
    const rollProb = rollEffectiveness / total;
    const popProb = popEffectiveness / total;
    
    const decision = Math.random();
    
    if (decision < rollProb) {
      // Roll to the rim
      const qual = this._calculateShotQuality(screener, rollDefender, 'pick_and_roll', gameState, scheme);
      return { 
        ...this._attemptShot(screener, rollDefender, qual, 'pick_and_roll', gameState, { subPlayType: 'pick_and_roll' }), 
        shooter: screener,
        pnrDecision: 'roll',
      };
    } else if (decision < rollProb + popProb) {
      // Pop for a jumper
      const qual = this._calculateShotQuality(screener, rollDefender, 'pick_and_roll', gameState, scheme);
      return { 
        ...this._attemptShot(screener, rollDefender, qual, 'pick_and_roll', gameState, { subPlayType: 'pick_and_roll_pop' }), 
        shooter: screener,
        pnrDecision: 'pop',
      };
    } else {
      // Handler pulls up or drives
      const qual = this._calculateShotQuality(handler, defender, 'isolation', gameState, scheme);
      return { 
        ...this._attemptShot(handler, defender, qual, 'isolation', gameState), 
        shooter: handler,
        pnrDecision: 'pullUp',
      };
    }
  }

  static _executeSpotUp(shooter, defender, scheme, gameState) {
    const qual = this._calculateShotQuality(shooter, defender, 'spot_up', gameState, scheme);
    return { ...this._attemptShot(shooter, defender, qual, 'spot_up', gameState), shooter };
  }

  static _executePostUp(postPlayer, defender, scheme, gameState) {
    const qual = this._calculateShotQuality(postPlayer, defender, 'post_up', gameState, scheme);
    // Check for double team in post
    const isDoubleTeamed = this._shouldDoubleTeam(postPlayer, 'post_up', gameState);
    return { 
      ...this._attemptShot(postPlayer, defender, qual, 'post_up', gameState, { isDoubleTeamed }), 
      shooter: postPlayer 
    };
  }

  static _executeTransition(offense, defense, scheme, gameState) {
    // In transition, select the most likely finisher (not random)
    // Typically: ball handler, or a trailer/wing
    const weights = offense.map(p => {
      let weight = (p.speed || 70) * 0.35 + (p.inside_scoring || 70) * 0.35 + (p.three_point || 70) * 0.30;
      // Ball handlers and wings more likely in transition
      if (p.position === 'PG' || p.position === 'SG') weight *= 1.2;
      else if (p.position === 'SF') weight *= 1.1;
      else weight *= 0.85;
      return Math.pow(weight, 1.5);
    });
    
    const total = weights.reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    let player = offense[0];
    for (let i = 0; i < offense.length; i++) {
      r -= weights[i];
      if (r <= 0) { player = offense[i]; break; }
    }
    
    // Defender is likely trailing or out of position
    const defender = defense[Math.floor(Math.random() * defense.length)];
    const qual = this._calculateShotQuality(player, defender, 'transition', gameState, scheme);
    return { ...this._attemptShot(player, defender, qual, 'transition', gameState), shooter: player };
  }

  static _executeCut(offense, defense, scheme, gameState, primaryHandler) {
    // Cutter is typically a wing or big who's good at finishing
    const candidates = offense.filter(p => p.id !== primaryHandler.id);
    if (candidates.length === 0) {
      const cutter = offense[0];
      const closestDef = this._selectClosestDefender(defense);
      const qual = this._calculateShotQuality(cutter, closestDef, 'cut', gameState, scheme);
      return { ...this._attemptShot(cutter, closestDef, qual, 'cut', gameState), shooter: cutter };
    }
    
    const weights = candidates.map(p => {
      let weight = (p.inside_scoring || 70) * 0.5 + (p.speed || 70) * 0.4 + (p.rebounding || 50) * 0.1;
      // Bigs and athletic wings are good cutters
      if (p.position === 'C' || p.position === 'PF') weight *= 1.2;
      else if (p.position === 'SF') weight *= 1.15;
      return Math.pow(weight, 1.5);
    });
    
    const total = weights.reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    let cutter = candidates[0];
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i];
      if (r <= 0) { cutter = candidates[i]; break; }
    }
    
    const closestDef = this._selectClosestDefender(defense, cutter);
    const qual = this._calculateShotQuality(cutter, closestDef, 'cut', gameState, scheme);
    return { ...this._attemptShot(cutter, closestDef, qual, 'cut', gameState), shooter: cutter };
  }

  // ── Offensive rebound check ─────────────────────────────────────────
  static _checkOffensiveRebound(offense, defense, shotResult, gameState, playType) {
    const shotType = shotResult.shotType || 'midRange';
    
    // Base OREB rates by shot type (NBA data)
    const baseORebByType = {
      rim: 0.295,
      midRange: 0.225,
      threePoint: 0.175,
    };
    let baseChance = baseORebByType[shotType] || 0.23;

    // Size advantage: more bigs = more OREB
    const offensiveBigs = offense.filter(p => ['C', 'PF'].includes(p.position)).length;
    const defensiveBigs = defense.filter(p => ['C', 'PF'].includes(p.position)).length;
    baseChance += (offensiveBigs - defensiveBigs) * 0.035;

    // Offensive rebounding rating differential
    const avgOffReb = offense.reduce((s, p) => s + (p.rebounding || 50), 0) / offense.length;
    const avgDefReb = defense.reduce((s, p) => s + (p.rebounding || 50), 0) / defense.length;
    baseChance += (avgOffReb - avgDefReb) / 100 * 0.15;

    // Fatigue penalty (tired players don't crash the glass as hard)
    const avgFatigue = offense.reduce((s, p) =>
      s + (gameState.homeFatigue.get(p.id) || gameState.awayFatigue.get(p.id) || 0), 0) / offense.length;
    baseChance -= avgFatigue * 0.05;

    // Putback opportunities (second chance shots) have higher OREB
    if (playType === 'offensive_rebound_shot') {
      baseChance += 0.10;
    }

    baseChance = Math.min(0.40, Math.max(0.10, baseChance));

    if (Math.random() < baseChance) {
      // Select rebounder weighted by rebounding rating and position
      const weighted = offense.map(p => ({
        id: p.id,
        weight: (p.rebounding || 50) * (['C', 'PF'].includes(p.position) ? 1.4 : ['SF'].includes(p.position) ? 1.0 : 0.7)
          * (0.7 + Math.random() * 0.6) // Add randomness
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

  // ── Player selection helpers ────────────────────────────────────────
  static _selectScreener(players) {
    return players.reduce((best, p) => {
      const score = (p.inside_scoring || 50) * 0.4 + (p.rebounding || 50) * 0.3 + 
                    (p.strength || 70) * 0.2 + (p.three_point || 50) * 0.1; // 3PT for pop ability
      const bestScore = (best.inside_scoring || 50) * 0.4 + (best.rebounding || 50) * 0.3 + 
                        (best.strength || 70) * 0.2 + (best.three_point || 50) * 0.1;
      return score > bestScore ? p : best;
    });
  }

  static _selectRollDefender(players, screener) {
    // Best interior defender to match up with screener
    const posOrder = { PG: 1, SG: 2, SF: 3, PF: 4, C: 5 };
    const screenPos = posOrder[screener.position] || 4;
    
    return players.reduce((best, p) => {
      const score = (p.post_defense || 50) * 0.5 + (p.rebounding || 50) * 0.3 + (p.strength || 70) * 0.2;
      const bestScore = (best.post_defense || 50) * 0.5 + (best.rebounding || 50) * 0.3 + (best.strength || 70) * 0.2;
      // Prefer position match
      const posMatch = Math.abs(posOrder[p.position] - screenPos);
      const bestPosMatch = Math.abs(posOrder[best.position] - screenPos);
      if (posMatch < bestPosMatch) return p;
      return score > bestScore ? p : best;
    });
  }

  static _selectShooter(players, gameState, isHomePossession, primaryHandler) {
    const graph = gameState?.homePassGraph || gameState?.awayPassGraph;
    const graphWeight = (id) => {
      if (!graph || !primaryHandler) return 1;
      const edges = graph.neighbors(primaryHandler.id);
      const found = edges.find(([to]) => to === id);
      return found ? 1 + found[1] / 25 : 1;
    };

    const scores = players.map(p => {
      let base = (p.three_point || 50) * 0.65 + (p.mid_range || 50) * 0.35;
      if (p.position === 'SG') base *= 1.20;
      else if (p.position === 'SF') base *= 1.15;
      else if (p.position === 'PG') base *= 1.05;
      return Math.pow(base, 1.7) * graphWeight(p.id);
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
    return players.reduce((best, p) => {
      const score = (p.inside_scoring || 50) * 0.5 + (p.strength || 70) * 0.35 + (p.rebounding || 50) * 0.15;
      const bestScore = (best.inside_scoring || 50) * 0.5 + (best.strength || 70) * 0.35 + (best.rebounding || 50) * 0.15;
      return score > bestScore ? p : best;
    });
  }

  static _selectClosestDefender(players, offensivePlayer = null) {
    if (offensivePlayer) {
      // Match up by position somewhat
      const posOrder = { PG: 1, SG: 2, SF: 3, PF: 4, C: 5 };
      const offPos = posOrder[offensivePlayer.position] || 3;
      return players.reduce((best, p) => {
        const score = (p.speed || 70) * 0.5 + (p.perimeter_defense || 50) * 0.5;
        const bestScore = (best.speed || 70) * 0.5 + (best.perimeter_defense || 50) * 0.5;
        const posMatch = Math.abs(posOrder[p.position] - offPos);
        const bestPosMatch = Math.abs(posOrder[best.position] - offPos);
        if (posMatch < bestPosMatch && score > bestScore * 0.85) return p;
        return score > bestScore ? p : best;
      });
    }
    return players.reduce((best, p) =>
      (p.speed * 0.6 + p.perimeter_defense * 0.4) > (best.speed * 0.6 + best.perimeter_defense * 0.4) ? p : best
    );
  }

  // ── Markov chain and pass graph updates ─────────────────────────────
  static _updatePlayChain(gameState, result, isHomeOffense) {
    const chainKey = isHomeOffense ? 'homePlayChain' : 'awayPlayChain';
    const lastKey = isHomeOffense ? 'homeLastPlay' : 'awayLastPlay';
    const chain = gameState[chainKey];
    const lastPlay = gameState[lastKey];
    
    chain.update(lastPlay, result.playType, 1);
    if (result.points > 0 && !result.turnovers) {
      chain.reinforce(lastPlay, result.playType, 0.30 * (result.points / 2));
    } else if (result.turnovers) {
      chain.reinforce(lastPlay, result.playType, -0.45);
    }
    gameState[lastKey] = result.playType;
  }

  static _updatePassGraph(gameState, result, isHomeOffense) {
    const graph = isHomeOffense ? gameState.homePassGraph : gameState.awayPassGraph;
    if (result.assist && result.assistedBy && result.shooter) {
      graph.addToEdge(result.assistedBy.id, result.shooter.id, 0.55);
    }
    if (result.turnovers && result.handler) {
      for (const [to] of graph.neighbors(result.handler.id)) {
        graph.addToEdge(result.handler.id, to, -0.04);
      }
    }
  }

  // ── Substitution logic ──────────────────────────────────────────────
  static _performSubstitutions(gameState, teamSide, periodLog, periodName) {
    const subConfig = gameState.config.substitutions || {};
    const now = gameState.totalGameSeconds;
    const lastSubTime = teamSide === 'home' ? gameState.lastHomeSubTime : gameState.lastAwaySubTime;
    const cooldown = subConfig.subCooldownSeconds || 90; // Real NBA: subs every ~1.5-2 min

    if (now - lastSubTime < cooldown) return;

    const activeIds = gameState[teamSide + 'ActiveIds'];
    const benchIds = gameState[teamSide + 'BenchIds'];
    const fatigueMap = gameState[teamSide + 'Fatigue'];
    const foulMap = gameState[teamSide + 'PlayerFouls'];
    const threshold = subConfig.fatigueThreshold || 0.65;

    // Find most fatigued player OR player in foul trouble
    let subOutId = null;
    let subReason = 'fatigue';
    let maxScore = 0;

    for (const id of activeIds) {
      const fatigue = fatigueMap.get(id) || 0;
      const fouls = foulMap.get(id) || 0;
      
      // Score combines fatigue and foul trouble
      let score = fatigue;
      // Foul trouble urgency (4+ fouls is concerning, 5 is critical)
      if (fouls >= 5) score += 0.5;
      else if (fouls >= 4) score += 0.25;
      
      if (score > threshold && score > maxScore) {
        maxScore = score;
        subOutId = id;
        subReason = fouls >= 4 ? 'foul_trouble' : 'fatigue';
      }
    }

    if (!subOutId) return;

    const players = gameState[teamSide + 'Team'].players;
    const benchPlayers = players.filter(p => 
      benchIds.includes(p.id) && (foulMap.get(p.id) || 0) < NBA.FOUL_LIMIT
    );
    if (benchPlayers.length === 0) return;

    // Select replacement: prefer lower fatigue, higher rating, position match
    const subOutPlayer = players.find(p => p.id === subOutId);
    const posOrder = { PG: 1, SG: 2, SF: 3, PF: 4, C: 5 };
    const subOutPos = posOrder[subOutPlayer?.position] || 3;

    benchPlayers.sort((a, b) => {
      const fa = fatigueMap.get(a.id) || 0;
      const fb = fatigueMap.get(b.id) || 0;
      const posMatchA = Math.abs(posOrder[a.position] - subOutPos);
      const posMatchB = Math.abs(posOrder[b.position] - subOutPos);
      
      // Prioritize position match, then low fatigue, then rating
      if (posMatchA !== posMatchB) return posMatchA - posMatchB;
      if (Math.abs(fa - fb) > 0.1) return fa - fb;
      return b.overall_rating - a.overall_rating;
    });
    
    const subIn = benchPlayers[0];

    const idx = activeIds.indexOf(subOutId);
    activeIds.splice(idx, 1, subIn.id);
    const benchIdx = benchIds.indexOf(subIn.id);
    if (benchIdx !== -1) benchIds.splice(benchIdx, 1, subOutId);

    if (teamSide === 'home') gameState.lastHomeSubTime = now;
    else gameState.lastAwaySubTime = now;

    periodLog.push({
      type: 'substitution',
      team: teamSide,
      period: periodName,
      clock: Math.max(0, gameState.periodClock),
      out: subOutId,
      in: subIn.id,
      reason: subReason,
    });
  }

  // ── Momentum, chemistry, fatigue ────────────────────────────────────
  static _updateMomentum(gameState, result, isHomeOffense) {
    const ms = gameState.config.momentumSystem;
    let delta = 0;
    
    if (result.points >= 2) {
      delta += (ms.runBonusPerPoint || 0.012) * result.points;
      if (result.points >= 3) delta += ms.bigPlayBonus?.threePointer || 0.035;
      if (result.shotResult?.isAndOne) delta += 0.03; // And-1 is a big momentum play
    }
    if (result.turnovers) delta -= 0.018;
    if (result.block) delta -= 0.015; // Getting blocked hurts momentum
    if (result.offensiveRebound) delta += 0.01; // OREB gives some momentum
    
    // Decay per possession (~14.5 sec / 60 = 0.24 min)
    delta -= (ms.decayRatePerMinute || 0.02) * 0.24;

    const signedDelta = isHomeOffense ? delta : -delta;
    gameState.momentum = Math.max(ms.minMomentum || -0.5, Math.min(ms.maxMomentum || 0.5, gameState.momentum + signedDelta));
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
      const baseRate = fm.baseFatiguePerMinute * (fm.positionFatigueFactor?.[p.position] || 1);
      let increase = baseRate * minutes;
      if (gameState.clutchActive) increase *= (fm.clutchFatigueReduction || 1.1); // More fatigue in clutch
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
  static _checkCriticalMoment(gameState, isHomeOffense, result, periodLog) {
    const cmList = gameState.config.criticalMoments;
    if (!cmList || cmList.length === 0) return;
    const moment = cmList[Math.floor(Math.random() * cmList.length)];
    if (Math.random() < (moment.prob || 0.08)) {
      if (moment.name === 'clutch_three' && (!result.shotResult || result.shotResult.missed)) {
        // Find the best 3PT shooter on the offending team
        const team = isHomeOffense ? gameState.homeTeam : gameState.awayTeam;
        const activeIds = isHomeOffense ? gameState.homeActiveIds : gameState.awayActiveIds;
        const activePlayers = team.players.filter(p => activeIds.includes(p.id));
        const bestShooter = activePlayers.reduce((best, p) => 
          (p.three_point || 70) > (best.three_point || 70) ? p : best
        );
        
        // Higher make rate for clutch moment (narrative boost, but still skill-based)
        const makeProb = Math.min(0.50, (bestShooter.three_point || 70) / 100 * 0.6);
        if (Math.random() < makeProb) {
          result.points = 3;
          result.shotResult = { 
            points: 3, fga3: 1, fgm3: 1, missed: false, assist: false, 
            shotType: 'threePoint', isFoul: false, contest: 'tight'
          };
          result.turnovers = false;
          result.shooter = bestShooter;
          if (isHomeOffense) gameState.homeScore += 3;
          else gameState.awayScore += 3;
        }
      }
      const lastEntry = periodLog[periodLog.length - 1];
      if (lastEntry) lastEntry.criticalMoment = moment.name;
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
          plusMinus: 0,
        });
      }
    };

    const handler = result.handler;
    const shooter = result.shooter || handler;
    const sr = result.shotResult;

    // Shot stats go to the shooter
    ensure(offStats, shooter.id);
    const ps = offStats.playerStats.get(shooter.id);

    if (!result.turnovers && sr) {
      ps.fga += sr.fga || 0;
      ps.fgm += sr.fgm || 0;
      ps.fga3 += sr.fga3 || 0;
      ps.fgm3 += sr.fgm3 || 0;
      ps.fta += sr.fta || 0;
      ps.ftm += sr.ftm || 0;
      ps.points += result.points || 0;
    }

    // Non-shooting foul FTs go to the handler
    if (sr?.nonShootingFoulFTs) {
      ensure(offStats, handler.id);
      const handlerPs = offStats.playerStats.get(handler.id);
      handlerPs.fta += sr.nonShootingFoulFTs.fta || 0;
      handlerPs.ftm += sr.nonShootingFoulFTs.ftm || 0;
      handlerPs.points += sr.nonShootingFoulFTs.points || 0;
    }

    // Turnovers on handler
    if (result.turnovers) {
      ensure(offStats, handler.id);
      offStats.playerStats.get(handler.id).turnovers++;
    }

    // Assists
    if (result.assist && result.assistedBy) {
      ensure(offStats, result.assistedBy.id);
      offStats.playerStats.get(result.assistedBy.id).assists++;
    }

    // Offensive rebounds
    if (result.offensiveRebound && result.offRebounderId) {
      ensure(offStats, result.offRebounderId);
      offStats.playerStats.get(result.offRebounderId).oreb++;
    }

    // Defensive rebounds
    if (result.defensiveRebound && result.defRebounderId) {
      ensure(defStats, result.defRebounderId);
      defStats.playerStats.get(result.defRebounderId).dreb++;
    }

    // Steals
    if (result.steal) {
      ensure(defStats, result.steal.id);
      defStats.playerStats.get(result.steal.id).steals++;
    }

    // Blocks
    if (result.block) {
      ensure(defStats, result.block.id);
      defStats.playerStats.get(result.block.id).blocks++;
    }

    // Fouls (personal fouls tracked separately, but also in box score)
    if (result.fouler) {
      const defSide = isHomeOffense ? 'away' : 'home';
      const defStatsObj = isHomeOffense ? gameState.awayStats : gameState.homeStats;
      ensure(defStatsObj, result.fouler.id);
      defStatsObj.playerStats.get(result.fouler.id).fouls++;
    }

    // Non-shooting foul tracking
    if (sr?.nonShootingFoulFTs?.fouler) {
      const defSide = isHomeOffense ? 'away' : 'home';
      const defStatsObj = isHomeOffense ? gameState.awayStats : gameState.homeStats;
      ensure(defStatsObj, sr.nonShootingFoulFTs.fouler.id);
      defStatsObj.playerStats.get(sr.nonShootingFoulFTs.fouler.id).fouls++;
    }
  }

  // ── Generate box scores ─────────────────────────────────────────────
  static _generateBoxScoresFromStats(gameState, players, teamSide) {
    const stats = teamSide === 'home' ? gameState.homeStats : gameState.awayStats;
    const minutesMap = teamSide === 'home' ? gameState.homeMinutesPlayed : gameState.awayMinutesPlayed;
    const foulMap = teamSide === 'home' ? gameState.homePlayerFouls : gameState.awayPlayerFouls;

    return players.filter(p => p.id != null).map(p => {
      const ps = stats.playerStats.get(p.id) || {};
      return {
        playerId: p.id,
        playerName: p.name,
        position: p.position,
        minutes: Math.round((minutesMap.get(p.id) || 0) * 10) / 10,
        fga: ps.fga || 0,
        fgm: ps.fgm || 0,
        fgPct: ps.fga ? Math.round((ps.fgm / ps.fga) * 1000) / 10 : 0,
        fga3: ps.fga3 || 0,
        fgm3: ps.fgm3 || 0,
        fg3Pct: ps.fga3 ? Math.round((ps.fgm3 / ps.fga3) * 1000) / 10 : 0,
        fta: ps.fta || 0,
        ftm: ps.ftm || 0,
        ftPct: ps.fta ? Math.round((ps.ftm / ps.fta) * 1000) / 10 : 0,
        points: ps.points || 0,
        oreb: ps.oreb || 0,
        dreb: ps.dreb || 0,
        reb: (ps.oreb || 0) + (ps.dreb || 0),
        assists: ps.assists || 0,
        steals: ps.steals || 0,
        blocks: ps.blocks || 0,
        turnovers: ps.turnovers || 0,
        fouls: foulMap.get(p.id) || 0,
        plusMinus: ps.plusMinus || 0,
      };
    });
  }

  // ── Utility methods ─────────────────────────────────────────────────
  static _createTeam(players, side, homeCourtFactor) {
    return {
      players: players.map(p => ({
        ...p,
        // Apply home court advantage to ratings (subtle boost)
        ...(side === 'home' ? {
          three_point: Math.min(99, (p.three_point || 70) * (1 + (homeCourtFactor - 1) * 0.3)),
          mid_range: Math.min(99, (p.mid_range || 70) * (1 + (homeCourtFactor - 1) * 0.25)),
          inside_scoring: Math.min(99, (p.inside_scoring || 70) * (1 + (homeCourtFactor - 1) * 0.2)),
        } : {}),
      })),
      side,
    };
  }

  static _mergeConfig(overrides) {
    return {
      global: {
        quarters: 4,
        minutesPerQuarter: 12,
        overtimeMinutes: 5,
        maxOvertimes: 4,
        homeCourtAdvantageFactor: 1.02,
        clutchThresholdSeconds: 300,
        clutchScoreDiff: 5,
        possessionsPerMinute: 2.0,
        ...overrides.global,
      },
      momentumSystem: {
        minMomentum: -0.5,
        maxMomentum: 0.5,
        runBonusPerPoint: 0.012,
        bigPlayBonus: { threePointer: 0.035 },
        decayRatePerMinute: 0.02,
        momentumEffectOnSuccess: 0.02,
        ...overrides.momentumSystem,
      },
      chemistry: {
        minChemistry: 0.3,
        maxChemistry: 1.0,
        assistBonusPerGame: 0.004,
        chemistryEffectOnShotQuality: 0.02,
        ...overrides.chemistry,
      },
      fatigue: {
        baseFatiguePerMinute: 0.018,
        positionFatigueFactor: { PG: 1.15, SG: 1.10, SF: 1.05, PF: 1.00, C: 0.95 },
        fatigueRecoveryPerQuarter: 0.08,
        clutchFatigueReduction: 1.1,
        ...overrides.fatigue,
      },
      substitutions: {
        fatigueThreshold: 0.65,
        subCooldownSeconds: 90,
        ...overrides.substitutions,
      },
      foulAndFreeThrow: {
        threePointFoulChance: 0.12,
        andOneChanceOnFoul: 0.18,
        ...overrides.foulAndFreeThrow,
      },
      shotQualityCalculation: {
        offensiveSkillWeights: {
          isolation: { ballHandling: 0.4, midRange: 0.3, threePoint: 0.3 },
          pick_and_roll: {
            handler: { ballHandling: 0.35, passing: 0.25, midRange: 0.2, threePoint: 0.2 },
          },
          spot_up: { threePoint: 0.6, midRange: 0.3, offBallMovement: 0.1 },
          post_up: { insideScoring: 0.55, strength: 0.3, midRange: 0.15 },
          transition: { speed: 0.4, insideScoring: 0.35, threePoint: 0.25 },
          cut: { speed: 0.35, insideScoring: 0.55, offBallMovement: 0.1 },
        },
        defensiveSkillWeights: {
          isolation: { perimeterDefense: 0.5, speed: 0.3, stealRating: 0.2 },
          pick_and_roll: {
            handlerDefender: { perimeterDefense: 0.45, speed: 0.35, stealRating: 0.2 },
          },
          spot_up: { perimeterDefense: 0.6, speed: 0.3, blocks: 0.1 },
          post_up: { postDefense: 0.55, strength: 0.3, blocks: 0.15 },
          transition: { speed: 0.5, perimeterDefense: 0.3, blocks: 0.2 },
          cut: { postDefense: 0.4, blocks: 0.35, speed: 0.25 },
        },
        positionAdvantageMatrix: {
          PG: { PG: 1.0, SG: 0.95, SF: 0.90, PF: 0.82, C: 0.75 },
          SG: { PG: 1.05, SG: 1.0, SF: 0.95, PF: 0.88, C: 0.78 },
          SF: { PG: 1.10, SG: 1.05, SF: 1.0, PF: 0.93, C: 0.83 },
          PF: { PG: 1.18, SG: 1.12, SF: 1.07, PF: 1.0, C: 0.92 },
          C: { PG: 1.25, SG: 1.22, SF: 1.17, PF: 1.08, C: 1.0 },
        },
        randomnessFactor: 0.10,
        ...overrides.shotQualityCalculation,
      },
      defensiveSchemes: {
        manToMan: { isolationMod: 0, pickAndRollMod: 0, spotUpMod: 0, postUpMod: 0, transitionMod: 0, cutMod: 0 },
        switch: { isolationMod: -0.02, pickAndRollMod: 0.02, spotUpMod: -0.01, postUpMod: 0.01, transitionMod: 0, cutMod: -0.01 },
        drop: { isolationMod: 0.01, pickAndRollMod: -0.02, spotUpMod: 0.02, postUpMod: -0.01, transitionMod: 0.01, cutMod: 0.01 },
        zone: { isolationMod: 0.02, pickAndRollMod: 0.01, spotUpMod: -0.02, postUpMod: 0.02, transitionMod: 0.02, cutMod: 0.01 },
        ...overrides.defensiveSchemes,
      },
      plays: overrides.plays || {},
      criticalMoments: overrides.criticalMoments || [],
    };
  }

  static _randomNormal(mean, stdev) {
    const u = 1 - Math.random();
    const v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return z * stdev + mean;
  }
}

// Helper function for shot quality calculation
function isHomePossessionHelper(gameState, player) {
  return gameState.homeTeam.players.some(p => p.id === player.id);
}

module.exports = GameSimulationEngine;