// services/lineupService.js
//
// Manages starting lineups, bench rotation order, and target minutes
// for each team in a saved game. Auto-generates sensible defaults from
// roster overall_rating + position needs, and lets the user override
// their managed team's lineup via the API.
//
// Intentionally simple for now — picks best player per position, then
// best-overall for any leftover slots, and allocates minutes by rank.
// Dynamic coaching / matchup-based logic can build on top of this later.

const { supabaseAdmin } = require('../config/supabase');

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];
const TOTAL_TEAM_MINUTES = 48 * 5; // 240 man-minutes per regulation game

class LineupService {
  constructor(savedGameId) {
    if (!savedGameId) throw new Error('LineupService requires a savedGameId');
    this.savedGameId = savedGameId;
  }

  // ── Roster helper ──────────────────────────────────────────────────────
  async _getRoster(teamId) {
    const { data, error } = await supabaseAdmin
      .from('players')
      .select('id, position, overall_rating, team_id')
      .eq('saved_game_id', this.savedGameId)
      .eq('team_id', teamId)
      .order('overall_rating', { ascending: false });

    if (error) throw new Error(`Failed to load roster: ${error.message}`);
    if (!data?.length) throw new Error('No players found for this team');
    return data;
  }

  // ── Auto-generation ───────────────────────────────────────────────────
  // Picks the highest-rated player at each position for the starting five,
  // backfilling with best-overall if a position is empty. Bench is simply
  // remaining players ordered by rating. Minutes are rank-based, scaled to
  // sum to exactly 240.
  _autoGenerateFromRoster(roster) {
    const sorted = [...roster].sort((a, b) => (b.overall_rating || 0) - (a.overall_rating || 0));
    const used = new Set();
    const starters = [];

    for (const pos of POSITIONS) {
      const candidate = sorted.find(p => p.position === pos && !used.has(p.id));
      if (candidate) {
        starters.push(candidate.id);
        used.add(candidate.id);
      }
    }
    for (const p of sorted) {
      if (starters.length >= 5) break;
      if (!used.has(p.id)) {
        starters.push(p.id);
        used.add(p.id);
      }
    }

    const rotation = sorted.filter(p => !used.has(p.id)).map(p => p.id);
    const minutesTargets = this._computeMinutesTargets(sorted, starters);

    return { starters, rotation, minutesTargets };
  }

  // Rank-based minute allocation (same shape the sim engine already used),
  // normalized so the team always totals exactly 240 minutes.
  _computeMinutesTargets(sortedRoster, starterIds) {
    const starterSet = new Set(starterIds);
    const raw = {};

    sortedRoster.forEach((p, rank) => {
      let base;
      if (rank <= 1) base = 32;
      else if (rank <= 4) base = 26;
      else if (rank <= 8) base = 16;
      else base = 4;
      // Small bump for anyone manually placed in the starting five even if
      // their natural rank would've put them on the bench.
      if (starterSet.has(p.id) && rank > 4) base = Math.max(base, 22);
      raw[p.id] = base;
    });

    const total = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
    const scale = TOTAL_TEAM_MINUTES / total;

    const targets = {};
    let allocated = 0;
    const ids = Object.keys(raw);
    ids.forEach((id, i) => {
      const val = i === ids.length - 1
        ? TOTAL_TEAM_MINUTES - allocated // last player soaks up rounding drift
        : Math.round(raw[id] * scale);
      targets[id] = Math.max(0, val);
      allocated += targets[id];
    });

    return targets;
  }

  // ── Public: get current lineup (auto if none saved) ───────────────────
  async getLineup(teamId) {
    const roster = await this._getRoster(teamId);
    const rosterIds = new Set(roster.map(p => p.id));

    const { data: existing, error } = await supabaseAdmin
      .from('team_lineups')
      .select('*')
      .eq('saved_game_id', this.savedGameId)
      .eq('team_id', teamId)
      .maybeSingle();

    if (error) throw new Error(`Failed to load lineup: ${error.message}`);

    if (existing) {
      // Reconcile against current roster in case players were traded/cut
      // since this lineup was saved — drop anyone no longer on the team
      // and slot newcomers onto the bench so nobody gets lost.
      const { starters, rotation, minutesTargets, changed } =
        this._reconcileWithRoster(existing, roster, rosterIds);

      if (changed) {
        await this._persist(teamId, { starters, rotation, minutesTargets, isAuto: existing.is_auto });
      }

      return this._toResponse(teamId, { starters, rotation, minutesTargets, isAuto: existing.is_auto, persisted: true });
    }

    const auto = this._autoGenerateFromRoster(roster);
    return this._toResponse(teamId, { ...auto, isAuto: true, persisted: false });
  }

  _reconcileWithRoster(existing, roster, rosterIds) {
    let changed = false;

    let starters = (existing.starters || []).filter(id => rosterIds.has(id));
    let rotation = (existing.rotation || []).filter(id => rosterIds.has(id));
    if (starters.length !== (existing.starters || []).length) changed = true;
    if (rotation.length !== (existing.rotation || []).length) changed = true;

    // Re-fill missing starter slots from best available non-starter
    if (starters.length < 5) {
      const placed = new Set([...starters, ...rotation]);
      const sorted = [...roster].sort((a, b) => (b.overall_rating || 0) - (a.overall_rating || 0));
      for (const p of sorted) {
        if (starters.length >= 5) break;
        if (!starters.includes(p.id)) {
          starters.push(p.id);
          rotation = rotation.filter(id => id !== p.id);
          placed.add(p.id);
          changed = true;
        }
      }
    }

    // Anyone on the roster not accounted for goes to the end of the bench
    const accounted = new Set([...starters, ...rotation]);
    for (const p of roster) {
      if (!accounted.has(p.id)) {
        rotation.push(p.id);
        accounted.add(p.id);
        changed = true;
      }
    }

    let minutesTargets = { ...(existing.minutes_targets || {}) };
    for (const id of Object.keys(minutesTargets)) {
      if (!rosterIds.has(id)) { delete minutesTargets[id]; changed = true; }
    }
    for (const p of roster) {
      if (!(p.id in minutesTargets)) {
        minutesTargets[p.id] = starters.includes(p.id) ? 20 : 4;
        changed = true;
      }
    }
    if (changed) {
      // Renormalize to keep total at 240 after reconciliation
      const sortedForMinutes = [...roster].sort((a, b) => (b.overall_rating || 0) - (a.overall_rating || 0));
      minutesTargets = this._computeMinutesTargets(sortedForMinutes, starters);
    }

    return { starters, rotation, minutesTargets, changed };
  }

  // ── Public: set a custom lineup ────────────────────────────────────────
  async setLineup(teamId, { starters, rotation, minutesTargets }) {
    const roster = await this._getRoster(teamId);
    const rosterIds = new Set(roster.map(p => p.id));

    if (!Array.isArray(starters) || starters.length !== 5) {
      throw new Error('Validation: starters must be an array of exactly 5 player IDs');
    }
    if (new Set(starters).size !== 5) {
      throw new Error('Validation: starters contains duplicate player IDs');
    }
    for (const id of starters) {
      if (!rosterIds.has(id)) throw new Error(`Validation: player ${id} is not on this team's roster`);
    }

    let finalRotation;
    if (rotation === undefined || rotation === null) {
      finalRotation = roster.map(p => p.id).filter(id => !starters.includes(id));
    } else {
      if (!Array.isArray(rotation)) throw new Error('Validation: rotation must be an array of player IDs');
      const rotSet = new Set(rotation);
      if (rotSet.size !== rotation.length) throw new Error('Validation: rotation contains duplicate player IDs');
      for (const id of rotation) {
        if (!rosterIds.has(id)) throw new Error(`Validation: player ${id} is not on this team's roster`);
        if (starters.includes(id)) throw new Error(`Validation: player ${id} is in both starters and rotation`);
      }
      // Anyone left off entirely still gets added to the end of the bench
      finalRotation = [...rotation];
      for (const p of roster) {
        if (!starters.includes(p.id) && !finalRotation.includes(p.id)) {
          finalRotation.push(p.id);
        }
      }
    }

    let finalMinutes;
    if (minutesTargets === undefined || minutesTargets === null) {
      const sorted = [...roster].sort((a, b) => (b.overall_rating || 0) - (a.overall_rating || 0));
      finalMinutes = this._computeMinutesTargets(sorted, starters);
    } else {
      if (typeof minutesTargets !== 'object' || Array.isArray(minutesTargets)) {
        throw new Error('Validation: minutesTargets must be an object of { player_id: minutes }');
      }
      finalMinutes = {};
      for (const p of roster) {
        const raw = minutesTargets[p.id];
        const val = raw === undefined ? 0 : Number(raw);
        if (Number.isNaN(val) || val < 0 || val > 48) {
          throw new Error(`Validation: minutes for player ${p.id} must be between 0 and 48`);
        }
        finalMinutes[p.id] = val;
      }
      const sum = Object.values(finalMinutes).reduce((a, b) => a + b, 0);
      if (sum > 0 && Math.abs(sum - TOTAL_TEAM_MINUTES) > 5) {
        throw new Error(
          `Validation: minutesTargets must sum to roughly ${TOTAL_TEAM_MINUTES} (got ${sum})`
        );
      }
      // Small rounding nudge so it always lands exactly on 240
      if (sum > 0) {
        const scale = TOTAL_TEAM_MINUTES / sum;
        const ids = Object.keys(finalMinutes);
        let allocated = 0;
        ids.forEach((id, i) => {
          const v = i === ids.length - 1
            ? TOTAL_TEAM_MINUTES - allocated
            : Math.round(finalMinutes[id] * scale);
          finalMinutes[id] = Math.max(0, v);
          allocated += finalMinutes[id];
        });
      }
    }

    await this._persist(teamId, { starters, rotation: finalRotation, minutesTargets: finalMinutes, isAuto: false });
    return this._toResponse(teamId, { starters, rotation: finalRotation, minutesTargets: finalMinutes, isAuto: false, persisted: true });
  }

  // ── Public: reset back to auto-generated lineup ────────────────────────
  async resetToAuto(teamId) {
    const roster = await this._getRoster(teamId);
    const auto = this._autoGenerateFromRoster(roster);
    await this._persist(teamId, { ...auto, isAuto: true });
    return this._toResponse(teamId, { ...auto, isAuto: true, persisted: true });
  }

  // ── Internal: used by the simulation engine, never persists ───────────
  async getLineupForSimulation(teamId) {
    const lineup = await this.getLineup(teamId);
    return {
      starters: lineup.starters,
      rotation: lineup.rotation,
      minutesTargets: lineup.minutesTargets,
    };
  }

  // ── Persistence ─────────────────────────────────────────────────────────
  async _persist(teamId, { starters, rotation, minutesTargets, isAuto }) {
    const { error } = await supabaseAdmin
      .from('team_lineups')
      .upsert(
        {
          saved_game_id: this.savedGameId,
          team_id: teamId,
          starters,
          rotation,
          minutes_targets: minutesTargets,
          is_auto: isAuto,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'saved_game_id,team_id' }
      );
    if (error) throw new Error(`Failed to save lineup: ${error.message}`);
  }

  _toResponse(teamId, { starters, rotation, minutesTargets, isAuto, persisted }) {
    return {
      teamId,
      savedGameId: this.savedGameId,
      starters,
      rotation,
      minutesTargets,
      isAuto,
      persisted,
    };
  }
}

module.exports = LineupService;