// services/playerProgressionService.js
//
// Applies natural player development/regression based on:
//   – age curve (young players trend toward potential, old players decline)
//   – recent on-court performance relative to what their traits predict
//   – minutes played (low-usage players progress/regress more slowly)
//
// Called by LeagueService after a batch of games has been simulated
// (end of simulateWeek / simulateToDate / simulateToNextUserGame / single simulateGame).
// It is intentionally NOT called per-possession — progression is a
// periodic, aggregate adjustment over the games just simulated.
//
// NOTE ON NAMING CONVENTION
// ─────────────────────────
// Mirrors teamArchetypeService.js: traits are snake_case DB columns,
// this service works with that same snake_case shape directly.

const { supabaseAdmin } = require('../../config/supabase');

const TRAIT_KEYS = [
  'three_point', 'mid_range', 'inside_scoring', 'passing',
  'ball_handling', 'perimeter_defense', 'post_defense',
  'rebounding', 'speed', 'strength',
];

const OVERALL_WEIGHTS = {
  three_point:       0.08,
  mid_range:         0.07,
  inside_scoring:    0.12,
  passing:           0.10,
  ball_handling:     0.10,
  perimeter_defense: 0.13,
  post_defense:      0.10,
  rebounding:        0.11,
  speed:             0.10,
  strength:          0.09,
};

const POS_OVERRIDES = {
  PG: { ball_handling: 0.14, passing: 0.13, speed: 0.12 },
  SG: { three_point: 0.12,   mid_range: 0.10, perimeter_defense: 0.12 },
  SF: { inside_scoring: 0.12, rebounding: 0.11, perimeter_defense: 0.12 },
  PF: { inside_scoring: 0.13, rebounding: 0.14, post_defense: 0.13, strength: 0.11 },
  C:  { inside_scoring: 0.15, rebounding: 0.16, post_defense: 0.15, strength: 0.12 },
};

// Trait each counting stat mainly reflects — used to translate "played well"
// into "which attributes nudge up".
const STAT_TO_TRAIT = {
  three_pct:   'three_point',
  mid_makes:   'mid_range',
  rim_makes:   'inside_scoring',
  assists:     'passing',
  turnovers:   'ball_handling',   // inverse (fewer TOs → ball_handling credit)
  steals:      'perimeter_defense',
  blocks:      'post_defense',
  rebounds:    'rebounding',
};

// ── Age curve ──────────────────────────────────────────────────────────────
// Returns a per-simulated-batch drift rate (in overall-rating points),
// independent of performance — pure aging.
function ageDriftRate(age) {
  if (age <= 21) return 0.045;   // fast development
  if (age <= 24) return 0.030;
  if (age <= 27) return 0.010;   // prime plateau
  if (age <= 30) return 0.000;
  if (age <= 33) return -0.015;
  return -0.035;                 // decline phase
}

// How strongly potential_rating pulls overall_rating toward it per batch.
function potentialPullRate(age) {
  if (age <= 23) return 0.12;
  if (age <= 27) return 0.05;
  return 0.0; // veterans no longer chase potential
}

function clampTrait(v) {
  return Math.max(25, Math.min(99, v));
}

function clampRating(v) {
  return Math.max(40, Math.min(99, v));
}

const PLAYER_FETCH_CHUNK = 200;

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

class playerProgressionService {

  /**
   * Main entry point. Aggregates the box scores from a just-simulated batch
   * of games, computes a per-player trait/rating delta, and upserts the
   * updated `players` rows.
   *
   * @param {string} savedGameId
   * @param {Array}  boxScores      - flat array of player_game_stats rows
   *                                  (the same shape LeagueService.mapBoxScore produces,
   *                                  i.e. { player_id, team_id, minutes_played, points, fgm, fga, ... })
   * @param {Object} [meta]
   * @param {string} [meta.seasonId]        - stamps season_id on each progression row
   * @param {string} [meta.gameId]          - stamps game_id (only meaningful for single-game calls)
   * @param {string} [meta.progressionType] - 'game' | 'week' | 'batch' | 'season' (defaults to 'game')
   * @returns {Object} summary { playersProgressed, playersRegressed, totalDelta }
   */
  static async progressPlayersFromBoxScores(savedGameId, boxScores, meta = {}) {
    const { seasonId = null, gameId = null, progressionType = 'game' } = meta;

    if (!boxScores || boxScores.length === 0) {
      return { playersProgressed: 0, playersRegressed: 0, totalDelta: 0 };
    }

    // 1. Aggregate box scores per player for this batch
    const perPlayer = this._aggregateBoxScores(boxScores);
    const playerIds = Object.keys(perPlayer);
    if (playerIds.length === 0) {
      return { playersProgressed: 0, playersRegressed: 0, totalDelta: 0 };
    }

    const players = [];
    const idChunks = chunkArray(playerIds, PLAYER_FETCH_CHUNK);
    for (const idChunk of idChunks) {
      const { data, error } = await supabaseAdmin
        .from('players')
        .select('id, team_id, position, age, overall_rating, potential_rating, traits')
        .eq('saved_game_id', savedGameId)
        .in('id', idChunk);

      if (error) throw new Error(`Failed to load players for progression: ${error.message}`);
      if (data?.length) players.push(...data);
    }

    if (!players.length) {
      return { playersProgressed: 0, playersRegressed: 0, totalDelta: 0 };
    }

    // 3. Compute updates
    const updates = [];
    const progressionRows = [];
    let totalDelta = 0;
    let up = 0, down = 0;

    for (const player of players) {
      const agg = perPlayer[player.id];
      if (!agg || agg.games === 0) continue;

      const tsBefore = { ...(player.traits || {}) };
      const overallBefore = player.overall_rating || 60;

      const { traits: newTraits, ratingDelta } = this._computePlayerDelta(player, agg);
      const newOverall = clampRating(Math.round(overallBefore + ratingDelta));

      totalDelta += ratingDelta;
      if (ratingDelta > 0.001) up++;
      else if (ratingDelta < -0.001) down++;

      updates.push({
        id:             player.id,
        team_id:        player.team_id,
        traits:         newTraits,
        overall_rating: newOverall,
      });

      // ── Build a delta object for just the trait keys that actually moved ──
      const traitDelta = {};
      for (const key of TRAIT_KEYS) {
        const before = tsBefore[key] ?? 50;
        const after  = newTraits[key] ?? 50;
        if (Math.abs(after - before) > 0.01) {
          traitDelta[key] = Math.round((after - before) * 100) / 100;
        }
      }

      progressionRows.push({
        player_id:          player.id,
        saved_game_id:      savedGameId,
        game_id:            gameId,
        season_id:          seasonId,
        overall_before:     overallBefore,
        overall_after:      newOverall,
        traits_before:      tsBefore,
        traits_after:       newTraits,
        delta: {
          overall: Math.round((newOverall - overallBefore) * 100) / 100,
          traits:  traitDelta,
        },
        progression_type:   progressionType,
        age_at_event:       player.age || null,
        performance_score:  Math.round(
          ((agg.points + agg.rebounds + agg.assists + agg.steals + agg.blocks - agg.turnovers) /
            Math.max(1, agg.games)) * 100
        ) / 100,
        notes: `Progressed from ${agg.games} game(s), avg ${Math.round(agg.minutes / agg.games)} min/gm`,
      });
    }

    // 4. Batch upsert players (chunks of 100 to match existing service conventions)
    const BATCH = 100;
    for (let i = 0; i < updates.length; i += BATCH) {
      const chunk = updates.slice(i, i + BATCH);
      await Promise.all(chunk.map(u =>
        supabaseAdmin
          .from('players')
          .update({
            traits:         u.traits,
            overall_rating: u.overall_rating,
          })
          .eq('id', u.id)
          .eq('saved_game_id', savedGameId)
      ));
    }

    // ── Insert history rows into player_progression ──
    for (let i = 0; i < progressionRows.length; i += BATCH) {
      const chunk = progressionRows.slice(i, i + BATCH);
      const { error: progError } = await supabaseAdmin
        .from('player_progression')
        .insert(chunk);
      if (progError) {
        // Don't let history-logging failures block the sim itself —
        // surface it loudly but keep going.
        console.error('Failed to insert player_progression rows:', progError.message);
      }
    }

    return {
      playersProgressed: up,
      playersRegressed:  down,
      totalDelta:        Math.round(totalDelta * 1000) / 1000,
      playersUpdated:    updates.length,
      historyRowsWritten: progressionRows.length,
    };
  }

  // ── Aggregation ────────────────────────────────────────────────────────

  static _aggregateBoxScores(boxScores) {
    const map = {};
    for (const b of boxScores) {
      if (!map[b.player_id]) {
        map[b.player_id] = {
          games: 0, minutes: 0, points: 0,
          fgm: 0, fga: 0, fgm_3: 0, fga_3: 0,
          rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0,
        };
      }
      const a = map[b.player_id];
      // Only count meaningful minutes toward development
      if ((b.minutes_played || 0) <= 0) continue;
      a.games      += 1;
      a.minutes    += b.minutes_played || 0;
      a.points     += b.points || 0;
      a.fgm        += b.fgm || 0;
      a.fga        += b.fga || 0;
      a.fgm_3      += b.fgm_3 || 0;
      a.fga_3      += b.fga_3 || 0;
      a.rebounds   += b.rebounds || 0;
      a.assists    += b.assists || 0;
      a.steals     += b.steals || 0;
      a.blocks     += b.blocks || 0;
      a.turnovers  += b.turnovers || 0;
    }
    return map;
  }

  // ── Per-player delta computation ─────────────────────────────────────

  static _computePlayerDelta(player, agg) {
    const age      = player.age || 25;
    const traits   = { ...(player.traits || {}) };
    const overall  = player.overall_rating || 60;
    const potential = player.potential_rating || overall;

    // Usage factor: players barely playing shouldn't swing much
    const avgMinutes = agg.minutes / Math.max(1, agg.games);
    const usageFactor = Math.min(1, avgMinutes / 24); // full weight at 24+ mpg

    // ── Performance signal (per-36 normalized, compared to trait-implied expectation) ──
    const per36 = (val) => agg.minutes > 0 ? (val / agg.minutes) * 36 : 0;

    const perf = {
      three_pct: agg.fga_3 >= 2 ? (agg.fgm_3 / agg.fga_3) : null,
      mid_makes: per36(agg.fgm - agg.fgm_3),
      rim_makes: per36(agg.fgm - agg.fgm_3), // approximation without shot-zone split in box score
      assists:   per36(agg.assists),
      turnovers: per36(agg.turnovers),
      steals:    per36(agg.steals),
      blocks:    per36(agg.blocks),
      rebounds:  per36(agg.rebounds),
    };

    // Baselines a "typical" player with this trait value would produce per-36
    // (rough linear mapping, trait 50 ≈ league-average per-36 rate).
    const expected = {
      three_pct: 0.30 + ((traits.three_point || 50) - 50) * 0.0035,
      assists:   2 + ((traits.passing || 50) - 50) * 0.08,
      turnovers: 3 - ((traits.ball_handling || 50) - 50) * 0.03,
      steals:    1 + ((traits.perimeter_defense || 50) - 50) * 0.02,
      blocks:    0.5 + ((traits.post_defense || 50) - 50) * 0.02,
      rebounds:  5 + ((traits.rebounding || 50) - 50) * 0.08,
    };

    // Trait deltas: small nudges, scaled by age (young = more plastic) and usage
    const ageMultiplier = age <= 24 ? 1.3 : age <= 29 ? 1.0 : 0.6;
    const learnRate = 0.15 * ageMultiplier * usageFactor;

    const nudge = (traitKey, actual, exp, scale = 1) => {
      if (actual === null || exp === undefined) return;
      const diff = (actual - exp) * scale;
      const delta = Math.max(-1.2, Math.min(1.2, diff * learnRate));
      traits[traitKey] = clampTrait((traits[traitKey] ?? 50) + delta);
    };

    nudge('three_point',       perf.three_pct, expected.three_pct, 40);   // pct diff scaled up
    nudge('passing',           perf.assists,   expected.assists,   1);
    nudge('ball_handling',    -perf.turnovers, -expected.turnovers, 1);   // fewer TOs is better
    nudge('perimeter_defense', perf.steals,    expected.steals,    1);
    nudge('post_defense',      perf.blocks,    expected.blocks,    1);
    nudge('rebounding',        perf.rebounds,  expected.rebounds,  1);

    // Efficiency (overall FG%) nudges inside_scoring/mid_range slightly
    if (agg.fga > 0) {
      const fgPct = agg.fgm / agg.fga;
      const expectedFgPct = 0.44 + ((traits.inside_scoring || 50) - 50) * 0.002;
      const delta = Math.max(-1, Math.min(1, (fgPct - expectedFgPct) * 20 * learnRate));
      traits.inside_scoring = clampTrait((traits.inside_scoring ?? 50) + delta);
      traits.mid_range      = clampTrait((traits.mid_range ?? 50) + delta * 0.5);
    }

    // ── Pure age drift (independent of this batch's performance) ──
    const drift = ageDriftRate(age);
    for (const key of TRAIT_KEYS) {
      traits[key] = clampTrait((traits[key] ?? 50) + drift * 0.5 * usageFactor);
    }

// ── Recalculate overall from updated traits, then pull toward potential ──
    const recalculated = this._recalculateOverall(traits, player.position);
    const pull = potentialPullRate(age);
    const potentialPull = pull * (potential - recalculated) * usageFactor;

    const ratingDelta = (recalculated - overall) + potentialPull;

    return { traits, ratingDelta };
  }

  static _recalculateOverall(traits, position) {
    const weights = { ...OVERALL_WEIGHTS, ...(POS_OVERRIDES[position] || {}) };
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let weightedSum = 0;
    for (const key of TRAIT_KEYS) {
      weightedSum += ((traits[key] ?? 50) * (weights[key] ?? 0.1)) / total;
    }
    return clampRating(Math.round(weightedSum));
  }
}

module.exports = playerProgressionService;