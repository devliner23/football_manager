// utils/teamResolver.js (or just inside the controller)
const { supabaseAdmin } = require('../config/supabase');

/**
 * Resolve a team name (or UUID) to a valid team UUID for the given saved game.
 * Returns the UUID, or throws if not found.
 */
async function resolveTeamId(savedGameId, teamNameOrId) {
  // If it's already a UUID, return it as-is (for flexibility)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(teamNameOrId);
  if (isUuid) return teamNameOrId;

  // Otherwise, treat as team name (case-insensitive)
  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('saved_game_id', savedGameId)
    .ilike('name', teamNameOrId)   // case-insensitive match
    .maybeSingle();

  if (error) throw new Error(`Database error looking up team: ${error.message}`);
  if (!data) throw new Error(`Team "${teamNameOrId}" not found in this saved game`);

  return data.id;
}