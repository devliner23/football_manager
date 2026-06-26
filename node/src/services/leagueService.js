const { supabaseAdmin } = require('../config/supabase');
const NBA_TEAMS = require('../data/teams.json');
const GameSimulationEngine = require('./gameSimulationEngine');
const PlayerGenerator = require('./playerGenerator');

const ROSTER_SIZE = 15;
const BATCH_SIZE_STATS  = 200;
const BATCH_SIZE_PLAYERS = 100;

// ---------- configuration constants ----------
const DAYS_IN_SEASON = 180;          // length of the regular season
const MAX_GAMES_PER_DAY = 10;        // realistic cap (NBA rarely exceeds 11)

// ── Box-score mapper (shared by all simulation paths) ────────────────────────
function mapBoxScore(b, teamId, gameId, savedGameId) {
  return {
    game_id:            gameId,
    team_id:            teamId,
    saved_game_id:      savedGameId,
    player_id:          b.player_id,
    minutes_played:     b.minutes_played     || 0,
    points:             b.points             || 0,
    fgm:                b.fgm                || 0,
    fga:                b.fga                || 0,
    fgm_3:              b.fgm_3              || 0,
    fga_3:              b.fga_3              || 0,
    ftm:                b.ftm                || 0,
    fta:                b.fta                || 0,
    offensive_rebounds: b.offensive_rebounds || 0,
    defensive_rebounds: b.defensive_rebounds || 0,
    rebounds:          (b.offensive_rebounds || 0) + (b.defensive_rebounds || 0),
    assists:            b.assists            || 0,
    steals:             b.steals             || 0,
    blocks:             b.blocks             || 0,
    turnovers:          b.turnovers          || 0,
    personal_fouls:     b.personal_fouls     || 0,
    plus_minus:         b.plus_minus         || 0,
  };
}

// ── LEAGUE SERVICE ────────────────────────────────────────────────────────────
class LeagueService {
  constructor(savedGameId) {
    if (!savedGameId) throw new Error('LeagueService requires a savedGameId');
    this.savedGameId = savedGameId;
  }

  // ── Public data helpers ───────────────────────────────────────────────────

  async getTeams() {
    const { data, error } = await supabaseAdmin
      .from('teams')
      .select('*')
      .eq('saved_game_id', this.savedGameId);
    if (error) throw new Error(`Failed to load teams: ${error.message}`);
    return data;
  }

  async getRosterForTeam(teamId) {
    const { data, error } = await supabaseAdmin
      .from('players')
      .select('*')
      .eq('saved_game_id', this.savedGameId)
      .eq('team_id', teamId)
      .order('overall_rating', { ascending: false });
    if (error) throw new Error(`Failed to load roster: ${error.message}`);
    return data.map(player => ({ ...player, ...player.traits }));
  }

  // ── League creation ───────────────────────────────────────────────────────

  async createTeams() {
    const rows = NBA_TEAMS.map(team => ({
      saved_game_id: this.savedGameId,
      name:          team.name,
      city:          team.city,
      abbreviation:  team.abbreviation,
      conference:    team.conference,
      division:      team.division,
    }));
    const { data, error } = await supabaseAdmin.from('teams').insert(rows).select();
    if (error) throw new Error(`Failed to create teams: ${error.message}`);
    return data;
  }

  async createRosters(teams, season = 1) {
    console.log(`🎮 Starting roster creation for ${teams.length} teams...`);
    const generator = new PlayerGenerator(this.savedGameId, season);
    const players   = generator.generateLeague(teams);
    console.log(`✅ Generated ${players.length} players locally. Starting DB insert...`);

    const allInserted = [];
    for (let i = 0; i < players.length; i += BATCH_SIZE_PLAYERS) {
      const batch = players.slice(i, i + BATCH_SIZE_PLAYERS);
      console.log(`📦 Inserting batch ${Math.floor(i / BATCH_SIZE_PLAYERS) + 1} (${batch.length} players)...`);
      const { data, error } = await supabaseAdmin.from('players').insert(batch).select();
      if (error) throw new Error(`Failed to create players batch: ${error.message}`);
      allInserted.push(...data);
    }

    console.log(`✅ Successfully inserted ${allInserted.length} players`);
    return allInserted;
  }

  async createSeason(seasonNumber) {
    const { data, error } = await supabaseAdmin
      .from('seasons')
      .insert({
        saved_game_id: this.savedGameId,
        season_number: seasonNumber,
        status:        'regular_season',
        start_date:    new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to create season: ${error.message}`);
    return data;
  }

  async createSeasonStats(teams, seasonId) {
    const rows = teams.map(team => ({
      saved_game_id:  this.savedGameId,
      team_id:        team.id,
      season_id:      seasonId,
      wins:           0,
      losses:         0,
      points_for:     0,
      points_against: 0,
    }));
    const { data, error } = await supabaseAdmin.from('team_season_stats').insert(rows).select();
    if (error) throw new Error(`Failed to create season stats: ${error.message}`);
    return data;
  }

/**
 * Generate a complete double round‑robin schedule.
 *
 * @param {Array}  teams    - Array of team objects, each with at least an `id` property.
 * @param {string} seasonId - UUID of the season for which to create the schedule.
 * @returns {Promise<number>} The total number of games inserted.
 */
async generateSchedule(teams, seasonId) {
  // ----- 1. Validate -----
  if (!Array.isArray(teams) || teams.length < 2) {
    throw new Error('At least two teams are required.');
  }
  if (!seasonId) throw new Error('seasonId is required.');

  const teamIds = teams.map(t => t.id);
  const n = teamIds.length;
  if (n % 2 !== 0) throw new Error('Number of teams must be even (30 for NBA style).');

  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 1);   // season starts tomorrow
  startDate.setHours(0, 0, 0, 0);

  // ----- 2. Base double round‑robin (58 rounds) -----
  const generateRoundRobin = (homeFirst) => {
    const indices = [...Array(n).keys()];
    const rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const roundGames = [];
      for (let i = 0; i < n / 2; i++) {
        const idxA = indices[i];
        const idxB = indices[n - 1 - i];
        const home = homeFirst ? teamIds[idxA] : teamIds[idxB];
        const away = homeFirst ? teamIds[idxB] : teamIds[idxA];
        roundGames.push({
          season_id: seasonId,
          home_team_id: home,
          away_team_id: away,
          status: 'scheduled',
          saved_game_id: this.savedGameId,
        });
      }
      rounds.push(roundGames);
      // Rotate circle
      indices.splice(1, 0, indices.pop());
    }
    return rounds;
  };

  const cycle1 = generateRoundRobin(true);
  const cycle2 = generateRoundRobin(false);
  const baseRounds = [...cycle1, ...cycle2];   // 58 rounds, each 15 games

  // Split each round into sub‑rounds ≤ MAX_GAMES_PER_DAY
  const baseSubRounds = [];
  for (const round of baseRounds) {
    for (let i = 0; i < round.length; i += MAX_GAMES_PER_DAY) {
      baseSubRounds.push(round.slice(i, i + MAX_GAMES_PER_DAY));
    }
  }
  // 30 teams → 116 sub‑rounds (58 * 2)

  // ----- 3. Assign base sub‑rounds to days 0..115 -----
  const daySlots = Array.from({ length: DAYS_IN_SEASON }, () => ({
    teams: new Set(),
    games: [],
  }));

  for (let i = 0; i < baseSubRounds.length; i++) {
    const dayIdx = i;   // days 0..115
    for (const game of baseSubRounds[i]) {
      daySlots[dayIdx].teams.add(game.home_team_id);
      daySlots[dayIdx].teams.add(game.away_team_id);
      daySlots[dayIdx].games.push(game);
    }
  }

  // ----- 4. Extra games (the 3rd meetings for 24 opponents) -----
  const extraGames = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = j - i;   // 1…29
      if (dist <= 12 || dist >= 18) {
        const home = dist <= 12 ? teamIds[i] : teamIds[j];
        const away = dist <= 12 ? teamIds[j] : teamIds[i];
        extraGames.push({
          season_id: seasonId,
          home_team_id: home,
          away_team_id: away,
          status: 'scheduled',
          saved_game_id: this.savedGameId,
        });
      }
    }
  }

  // Deterministic ordering (home, then away)
  extraGames.sort((a, b) => {
    if (a.home_team_id < b.home_team_id) return -1;
    if (a.home_team_id > b.home_team_id) return 1;
    return a.away_team_id < b.away_team_id ? -1 : 1;
  });

  // ----- 5. Greedy placement of extra games into day slots -----
  for (const game of extraGames) {
    let placed = false;
    for (let d = 0; d < DAYS_IN_SEASON; d++) {
      const slot = daySlots[d];
      if (slot.teams.has(game.home_team_id) || slot.teams.has(game.away_team_id)) continue;
      if (slot.games.length >= MAX_GAMES_PER_DAY) continue;

      slot.teams.add(game.home_team_id);
      slot.teams.add(game.away_team_id);
      slot.games.push(game);
      placed = true;
      break;
    }
    if (!placed) {
      throw new Error(
        `Could not place extra game: ${game.home_team_id} vs ${game.away_team_id}`
      );
    }
  }

  // ----- 6. Finalise dates, weeks, and collect all games -----
  const allGames = [];
  for (let d = 0; d < DAYS_IN_SEASON; d++) {
    const slot = daySlots[d];
    if (slot.games.length === 0) continue;

    const gameDate = new Date(startDate);
    gameDate.setDate(gameDate.getDate() + d);
    const dateStr = gameDate.toISOString();
    const dayDiff = Math.floor((gameDate - startDate) / (1000 * 60 * 60 * 24));
    const week = Math.floor(dayDiff / 7) + 1;

    for (const game of slot.games) {
      game.game_date = dateStr;
      game.week = week;
      allGames.push(game);
    }
  }

  // Safety check – total must be 1230 (30 teams * 82 / 2)
  if (allGames.length !== n * (n - 1) + extraGames.length) {
    throw new Error(`Game count mismatch: expected ${n*(n-1)+extraGames.length}, got ${allGames.length}`);
  }

  // ----- 7. Batch insert into Supabase -----
  for (let i = 0; i < allGames.length; i += BATCH_SIZE_PLAYERS) {
    const batch = allGames.slice(i, i + BATCH_SIZE_PLAYERS);
    const { error } = await supabaseAdmin.from('games').insert(batch);
    if (error) throw new Error(`Failed to create schedule: ${error.message}`);
  }

  return allGames.length;
}

  async rollbackLeague() {
    await supabaseAdmin.from('teams').delete().eq('saved_game_id', this.savedGameId);
  }

  async initializeLeague(season = 1, managedClubName = null) {
    const existingTeams = await this.getTeams();
    if (existingTeams.length > 0) {
      throw new Error(`League already initialized for saved game ${this.savedGameId}`);
    }

    let teams, seasonRecord;
    try {
      teams = await this.createTeams();

      let managedTeamId = null;
      if (managedClubName && typeof managedClubName === 'string') {
        const found   = teams.find(t => t.name.toLowerCase() === managedClubName.toLowerCase());
        managedTeamId = found ? found.id : teams[0]?.id;
      } else {
        managedTeamId = teams[0]?.id;
        console.warn('managedClubName is not a valid string, defaulting to first team:', managedClubName);
      }

      const players    = await this.createRosters(teams, season);
      seasonRecord     = await this.createSeason(season);
      await this.createSeasonStats(teams, seasonRecord.id);
      const gamesCount = await this.generateSchedule(teams, seasonRecord.id);

      const currentState = (await this._getGameState()) || {};
      await supabaseAdmin
        .from('saved_games')
        .update({
          current_season:  season,
          managed_club_id: managedTeamId,
          game_state: {
            ...currentState,
            initialized_at: new Date().toISOString(),
            season_id:      seasonRecord.id,
            total_games:    gamesCount,
          },
        })
        .eq('id', this.savedGameId);

      return { season, teamsCreated: teams.length, playersCreated: players.length, gamesCreated: gamesCount };
    } catch (err) {
      if (teams)        await this.rollbackLeague();
      if (seasonRecord) await supabaseAdmin.from('seasons').delete().eq('id', seasonRecord.id);
      throw err;
    }
  }

  // ── Single-game simulation ────────────────────────────────────────────────

  async simulateGame(gameId) {
    const { data: game, error: gameError } = await supabaseAdmin
      .from('games').select('*').eq('id', gameId).single();

    if (gameError) throw new Error(`Game not found: ${gameError.message}`);
    if (game.status !== 'scheduled') throw new Error(`Game ${gameId} is already ${game.status}`);

    const { season_id: seasonId, home_team_id: homeTeamId, away_team_id: awayTeamId } = game;
    if (!seasonId || !homeTeamId || !awayTeamId) {
      throw new Error(`Game ${gameId} is missing required IDs (season, home, or away)`);
    }

    const [{ data: homeTeam }, { data: awayTeam }] = await Promise.all([
      supabaseAdmin.from('teams').select('name').eq('id', homeTeamId).single(),
      supabaseAdmin.from('teams').select('name').eq('id', awayTeamId).single(),
    ]);

    const [homePlayers, awayPlayers] = await Promise.all([
      this.getRosterForTeam(homeTeamId),
      this.getRosterForTeam(awayTeamId),
    ]);

    const result    = GameSimulationEngine.simulateGame(homePlayers, awayPlayers, { homeCourtAdvantage: 1.03 });
    const allStats  = [
      ...result.homeBoxScores.map(b => mapBoxScore(b, homeTeamId, gameId, this.savedGameId)),
      ...result.awayBoxScores.map(b => mapBoxScore(b, awayTeamId, gameId, this.savedGameId)),
    ];

    const { error: statsError } = await supabaseAdmin.from('player_game_stats').insert(allStats);
    if (statsError) throw new Error(`Failed to insert player stats: ${statsError.message}`);

    const { error: updateGameError } = await supabaseAdmin
      .from('games')
      .update({ home_score: result.homeScore, away_score: result.awayScore, status: 'completed', played_at: new Date().toISOString() })
      .eq('id', gameId);
    if (updateGameError) throw new Error(`Failed to update game: ${updateGameError.message}`);

    await this._updateTeamStats(seasonId, homeTeamId, result.homeScore, result.awayScore, true);
    await this._updateTeamStats(seasonId, awayTeamId, result.awayScore, result.homeScore, false);
    await this._updatePlayerSeasonStats(seasonId, allStats);

    return {
      gameId,
      homeTeam:      homeTeam?.name || 'Home',
      awayTeam:      awayTeam?.name || 'Away',
      homeScore:     result.homeScore,
      awayScore:     result.awayScore,
      overtime:      result.overtime,
      overtimeCount: result.overtimeCount,
    };
  }

  // ── Simulate the next calendar week ──────────────────────────────────────
  // (kept for backwards compat — internally calls _bulkSimulateGames)

  async simulateWeek() {
    const seasonId = await this.getCurrentSeasonId();

    // Find the lowest week number that still has scheduled games
    const { data: nextWeekData, error: weekError } = await supabaseAdmin
      .from('games')
      .select('week')
      .eq('season_id', seasonId)
      .eq('status', 'scheduled')
      .order('week', { ascending: true })
      .limit(1);

    if (weekError) throw new Error(`Failed to find next week: ${weekError.message}`);

    if (!nextWeekData?.length) {
      await supabaseAdmin
        .from('seasons')
        .update({ status: 'finished', end_date: new Date().toISOString() })
        .eq('id', seasonId);
      return { seasonComplete: true };
    }

    const weekNumber = nextWeekData[0].week;

    const { data: weekGames, error: gamesError } = await supabaseAdmin
      .from('games')
      .select('*')
      .eq('season_id', seasonId)
      .eq('status', 'scheduled')
      .eq('week', weekNumber);
    if (gamesError) throw new Error(`Failed to fetch week games: ${gamesError.message}`);

    const results = await this._bulkSimulateGames(weekGames, seasonId);

    const currentState = await this._getGameState();
    await supabaseAdmin
      .from('saved_games')
      .update({
        game_state: {
          ...currentState,
          last_simulated_week: weekNumber,
          last_simulated_at:   new Date().toISOString(),
        },
      })
      .eq('id', this.savedGameId);

    return { seasonComplete: false, week: weekNumber, games: results };
  }

  // ── Get the user-managed team's next scheduled game ───────────────────────
  //
  // Returns the next game (with team names / abbreviations joined) and a count
  // of how many OTHER league games are scheduled before it so the UI can show
  // "X games will be auto-simulated before yours".

  async getNextUserGame() {
    const { data: savedGame, error: sgError } = await supabaseAdmin
      .from('saved_games')
      .select('managed_club_id, game_state')
      .eq('id', this.savedGameId)
      .single();

    if (sgError) throw new Error(`Failed to load saved game: ${sgError.message}`);

    const managedClubId = savedGame?.managed_club_id;
    if (!managedClubId) throw new Error('No managed team set for this save file');

    const seasonId = savedGame.game_state?.season_id || await this.getCurrentSeasonId();

    // Earliest scheduled game belonging to the user's team
    const { data: nextGame, error: nextError } = await supabaseAdmin
      .from('games')
      .select(`
        id,
        game_date,
        week,
        status,
        home_team_id,
        away_team_id,
        home_team:home_team_id ( id, name, abbreviation, city ),
        away_team:away_team_id ( id, name, abbreviation, city )
      `)
      .eq('season_id', seasonId)
      .eq('status', 'scheduled')
      .or(`home_team_id.eq.${managedClubId},away_team_id.eq.${managedClubId}`)
      .order('game_date', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextError) throw new Error(`Failed to find next user game: ${nextError.message}`);

    // No more games for the user's team → season finished
    if (!nextGame) {
      return { seasonComplete: true, nextUserGame: null, leagueGamesBeforeCount: 0 };
    }

    // Count scheduled league games that fall BEFORE this game's date
    // so the UI can communicate "N games will be simulated first"
    const { count, error: countError } = await supabaseAdmin
      .from('games')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', seasonId)
      .eq('status', 'scheduled')
      .lt('game_date', nextGame.game_date);

    if (countError) throw new Error(`Failed to count prior games: ${countError.message}`);

    return {
      seasonComplete:          false,
      leagueGamesBeforeCount:  count ?? 0,
      nextUserGame: {
        ...nextGame,
        isHome: nextGame.home_team_id === managedClubId,
      },
    };
  }

  // ── Simulate all league games up to (but not including) the user's next game
  //
  // Workflow:
  //   1. Find the user's next scheduled game (by game_date).
  //   2. Pull every other scheduled game whose game_date is strictly earlier.
  //   3. Bulk-simulate those games.
  //   4. Return the user's upcoming game so the UI can surface it immediately.

  async simulateToNextUserGame() {
    const { data: savedGame, error: sgError } = await supabaseAdmin
      .from('saved_games')
      .select('managed_club_id, game_state')
      .eq('id', this.savedGameId)
      .single();

    if (sgError) throw new Error(`Failed to load saved game: ${sgError.message}`);

    const managedClubId = savedGame?.managed_club_id;
    if (!managedClubId) throw new Error('No managed team set for this save file');

    const seasonId = savedGame.game_state?.season_id || await this.getCurrentSeasonId();

    // ── 1. Find user's next scheduled game ───────────────────────────────────
    const { data: nextUserGame, error: nextError } = await supabaseAdmin
      .from('games')
      .select(`
        id,
        game_date,
        week,
        status,
        home_team_id,
        away_team_id,
        home_team:home_team_id ( id, name, abbreviation, city ),
        away_team:away_team_id ( id, name, abbreviation, city )
      `)
      .eq('season_id', seasonId)
      .eq('status', 'scheduled')
      .or(`home_team_id.eq.${managedClubId},away_team_id.eq.${managedClubId}`)
      .order('game_date', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextError) throw new Error(`Failed to find next user game: ${nextError.message}`);

    // No more games → mark season finished
    if (!nextUserGame) {
      await supabaseAdmin
        .from('seasons')
        .update({ status: 'finished', end_date: new Date().toISOString() })
        .eq('id', seasonId);
      return { seasonComplete: true, gamesSimulated: 0, results: [], nextUserGame: null };
    }

    // ── 2. Find all scheduled games BEFORE the user's next game ──────────────
    const { data: gamesToSim, error: gamesError } = await supabaseAdmin
      .from('games')
      .select('*')
      .eq('season_id', seasonId)
      .eq('status', 'scheduled')
      .lt('game_date', nextUserGame.game_date)   // strictly before user's game
      .order('game_date', { ascending: true });

    if (gamesError) throw new Error(`Failed to fetch games to simulate: ${gamesError.message}`);

    // ── 3. Nothing to simulate — user's game is next up ──────────────────────
    if (!gamesToSim?.length) {
      return {
        seasonComplete:  false,
        gamesSimulated:  0,
        results:         [],
        nextUserGame: {
          ...nextUserGame,
          isHome: nextUserGame.home_team_id === managedClubId,
        },
      };
    }

    // ── 4. Bulk-simulate ──────────────────────────────────────────────────────
    const results = await this._bulkSimulateGames(gamesToSim, seasonId);

    // ── 5. Persist last-simulated-date to game_state ──────────────────────────
    const currentState = await this._getGameState();
    await supabaseAdmin
      .from('saved_games')
      .update({
        game_state: {
          ...currentState,
          last_simulated_at:   new Date().toISOString(),
          last_sim_to_date:    nextUserGame.game_date,
        },
      })
      .eq('id', this.savedGameId);

    return {
      seasonComplete:  false,
      gamesSimulated:  gamesToSim.length,
      results,
      nextUserGame: {
        ...nextUserGame,
        isHome: nextUserGame.home_team_id === managedClubId,
      },
    };
  }

  /**
 * Simulate all scheduled games up to (and including) the given date.
 * @param {string|Date} targetDate - ISO date string or Date object
 * @returns {Object} { seasonComplete, gamesSimulated, results[] }
 */
//   async simulateToDate(targetDate) {
//     const targetISO = new Date(targetDate).toISOString();
//     const seasonId = await this.getCurrentSeasonId();

//     // Check if season already finished
//     const { count: totalScheduled, error: countErr } = await supabaseAdmin
//         .from('games')
//         .select('id', { count: 'exact', head: true })
//         .eq('season_id', seasonId)
//         .eq('status', 'scheduled');

//     if (countErr) throw new Error(`Failed to count scheduled games: ${countErr.message}`);

//     if (totalScheduled === 0) {
//         // Mark season as finished if not already
//         await supabaseAdmin
//         .from('seasons')
//         .update({ status: 'finished', end_date: new Date().toISOString() })
//         .eq('id', seasonId);
//         return { seasonComplete: true, gamesSimulated: 0, results: [] };
//     }

//     // Fetch all scheduled games up to target date, ordered by game_date
//     const { data: gamesToSim, error: fetchErr } = await supabaseAdmin
//         .from('games')
//         .select('*')
//         .eq('season_id', seasonId)
//         .eq('status', 'scheduled')
//         .lte('game_date', targetISO)          // up to and including
//         .order('game_date', { ascending: true });

//     if (fetchErr) throw new Error(`Failed to fetch games: ${fetchErr.message}`);

//     // Nothing to simulate today / in the past
//     if (!gamesToSim?.length) {
//         return { seasonComplete: false, gamesSimulated: 0, results: [] };
//     }

//     // Bulk‑simulate all fetched games
//     const results = await this._bulkSimulateGames(gamesToSim, seasonId);

//     // Update game_state with the last simulated date
//     const currentState = await this._getGameState();
//     const lastSimDate = gamesToSim[gamesToSim.length - 1].game_date;
//     await supabaseAdmin
//         .from('saved_games')
//         .update({
//         game_state: {
//             ...currentState,
//             last_sim_to_date: lastSimDate,
//             last_simulated_at: new Date().toISOString(),
//         },
//         })
//         .eq('id', this.savedGameId);

//     return {
//         seasonComplete: false,
//         gamesSimulated: gamesToSim.length,
//         results,
//     };
//   }

  // ── PRIVATE: core bulk-simulation logic ──────────────────────────────────
  //
  // Accepts any array of game rows, simulates them all, persists every artefact
  // (player box scores, game results, team season stats, player season stats),
  // and returns a lightweight results array.

  async _bulkSimulateGames(games, seasonId) {
    if (!games?.length) return [];

    // 1. Fetch every roster that appears in this batch (de-duped)
    const teamIds = [...new Set(games.flatMap(g => [g.home_team_id, g.away_team_id]))];
    const rosterEntries = await Promise.all(
      teamIds.map(async id => [id, await this.getRosterForTeam(id)])
    );
    const rosterMap = Object.fromEntries(rosterEntries);

    // 2. Run all simulations in memory
    const simResults = games.map(game => {
      const result = GameSimulationEngine.simulateGame(
        rosterMap[game.home_team_id],
        rosterMap[game.away_team_id],
        { homeCourtAdvantage: 1.03 }
      );
      return {
        game,
        result,
        allBoxScores: [
          ...result.homeBoxScores.map(b => mapBoxScore(b, game.home_team_id, game.id, this.savedGameId)),
          ...result.awayBoxScores.map(b => mapBoxScore(b, game.away_team_id, game.id, this.savedGameId)),
        ],
      };
    });

    // 3. Batch-insert player_game_stats
    const allBoxScores = simResults.flatMap(s => s.allBoxScores);
    for (let i = 0; i < allBoxScores.length; i += BATCH_SIZE_STATS) {
      const { error } = await supabaseAdmin.from('player_game_stats').insert(allBoxScores.slice(i, i + BATCH_SIZE_STATS));
      if (error) throw new Error(`Failed to insert player stats batch: ${error.message}`);
    }

    const gameUpdates = simResults.map(({ game, result }) => ({
        ...game,
        home_score: result.homeScore,
        away_score: result.awayScore,
        status:     'completed',
    }));

    for (let i = 0; i < gameUpdates.length; i += 200) {
    const { error } = await supabaseAdmin
        .from('games')
        .upsert(gameUpdates.slice(i, i + 200), { onConflict: 'id' });
    if (error) throw new Error(`Failed to batch-update games: ${error.message}`);
    }

    // 5. Upsert team season stats
    await this._upsertTeamStats(simResults, seasonId);

    // 6. Upsert player season stats
    await this._upsertPlayerSeasonStats(allBoxScores, seasonId);

    // Return lightweight summary rows
    return simResults.map(({ game, result }) => ({
      gameId:      game.id,
      game_date:   game.game_date,
      homeTeamId:  game.home_team_id,
      awayTeamId:  game.away_team_id,
      homeScore:   result.homeScore,
      awayScore:   result.awayScore,
      overtime:    result.overtime,
    }));
  }

  // ── PRIVATE: upsert team season stats from a simResults batch ────────────

  async _upsertTeamStats(simResults, seasonId) {
    // Accumulate deltas in memory first
    const deltas = {};

    for (const { game, result } of simResults) {
      const apply = (teamId, pf, pa, isHome) => {
        if (!deltas[teamId]) {
          deltas[teamId] = { wins:0, losses:0, points_for:0, points_against:0, home_wins:0, home_losses:0, away_wins:0, away_losses:0 };
        }
        const win = pf > pa;
        const d   = deltas[teamId];
        d.wins           += win ? 1 : 0;
        d.losses         += win ? 0 : 1;
        d.points_for     += pf;
        d.points_against += pa;
        if (isHome) { d.home_wins += win ? 1 : 0; d.home_losses += win ? 0 : 1; }
        else        { d.away_wins += win ? 1 : 0; d.away_losses += win ? 0 : 1; }
      };
      apply(game.home_team_id, result.homeScore, result.awayScore, true);
      apply(game.away_team_id, result.awayScore, result.homeScore, false);
    }

    // Fetch current rows for affected teams
    const { data: current } = await supabaseAdmin
      .from('team_season_stats')
      .select('*')
      .eq('season_id', seasonId)
      .in('team_id', Object.keys(deltas));

    const byId = Object.fromEntries((current || []).map(s => [s.team_id, s]));

    const upserts = Object.entries(deltas).map(([teamId, d]) => {
      const ex = byId[teamId] || {};
      return {
        team_id:        teamId,
        season_id:      seasonId,
        saved_game_id:  this.savedGameId,
        wins:           (ex.wins           || 0) + d.wins,
        losses:         (ex.losses         || 0) + d.losses,
        points_for:     (ex.points_for     || 0) + d.points_for,
        points_against: (ex.points_against || 0) + d.points_against,
        home_wins:      (ex.home_wins      || 0) + d.home_wins,
        home_losses:    (ex.home_losses    || 0) + d.home_losses,
        away_wins:      (ex.away_wins      || 0) + d.away_wins,
        away_losses:    (ex.away_losses    || 0) + d.away_losses,
      };
    });

    const { error } = await supabaseAdmin
      .from('team_season_stats')
      .upsert(upserts, { onConflict: 'team_id,season_id' });
    if (error) throw new Error(`Failed to upsert team stats: ${error.message}`);
  }

  // ── PRIVATE: upsert player season stats from a box-score batch ───────────

  async _upsertPlayerSeasonStats(boxScores, seasonId) {
    // Accumulate per-player deltas
    const deltas = {};
    for (const box of boxScores) {
      if (!deltas[box.player_id]) {
        deltas[box.player_id] = {
          team_id:0, games_played:0, total_points:0, total_rebounds:0, total_assists:0,
          total_steals:0, total_blocks:0, total_turnovers:0,
          total_fga:0, total_fgm:0, total_fga_3:0, total_fgm_3:0,
          total_fta:0, total_ftm:0, offensive_rebounds:0, defensive_rebounds:0, minutes:0,
        };
      }
      const d = deltas[box.player_id];
      d.team_id            = box.team_id;
      d.games_played       += 1;
      d.total_points       += box.points;
      d.total_rebounds     += box.rebounds;
      d.total_assists      += box.assists;
      d.total_steals       += box.steals;
      d.total_blocks       += box.blocks;
      d.total_turnovers    += box.turnovers;
      d.total_fga          += box.fga;
      d.total_fgm          += box.fgm;
      d.total_fga_3        += box.fga_3;
      d.total_fgm_3        += box.fgm_3;
      d.total_fta          += box.fta;
      d.total_ftm          += box.ftm;
      d.offensive_rebounds += box.offensive_rebounds;
      d.defensive_rebounds += box.defensive_rebounds;
      d.minutes            += box.minutes_played;
    }

    const playerIds = Object.keys(deltas);

    // Fetch existing season rows
    const { data: existing } = await supabaseAdmin
      .from('player_season_stats')
      .select('*')
      .eq('season_id', seasonId)
      .in('player_id', playerIds);

    const byId = Object.fromEntries((existing || []).map(s => [s.player_id, s]));

    const upserts = playerIds.map(pid => {
      const d  = deltas[pid];
      const ex = byId[pid] || {};
      return {
        player_id:          pid,
        season_id:          seasonId,
        team_id:            d.team_id,
        saved_game_id:      this.savedGameId,
        games_played:       (ex.games_played       || 0) + d.games_played,
        total_points:       (ex.total_points       || 0) + d.total_points,
        total_rebounds:     (ex.total_rebounds     || 0) + d.total_rebounds,
        total_assists:      (ex.total_assists      || 0) + d.total_assists,
        total_steals:       (ex.total_steals       || 0) + d.total_steals,
        total_blocks:       (ex.total_blocks       || 0) + d.total_blocks,
        total_turnovers:    (ex.total_turnovers    || 0) + d.total_turnovers,
        total_fga:          (ex.total_fga          || 0) + d.total_fga,
        total_fgm:          (ex.total_fgm          || 0) + d.total_fgm,
        total_fga_3:        (ex.total_fga_3        || 0) + d.total_fga_3,
        total_fgm_3:        (ex.total_fgm_3        || 0) + d.total_fgm_3,
        total_fta:          (ex.total_fta          || 0) + d.total_fta,
        total_ftm:          (ex.total_ftm          || 0) + d.total_ftm,
        offensive_rebounds: (ex.offensive_rebounds || 0) + d.offensive_rebounds,
        defensive_rebounds: (ex.defensive_rebounds || 0) + d.defensive_rebounds,
        minutes:            (ex.minutes            || 0) + d.minutes,
      };
    });

    for (let i = 0; i < upserts.length; i += BATCH_SIZE_STATS) {
      const { error } = await supabaseAdmin
        .from('player_season_stats')
        .upsert(upserts.slice(i, i + BATCH_SIZE_STATS), { onConflict: 'player_id,season_id' });
      if (error) throw new Error(`Failed to upsert player season stats: ${error.message}`);
    }
  }

  // ── PRIVATE: single-game team-stat update (used by simulateGame) ─────────

  async _updateTeamStats(seasonId, teamId, pointsFor, pointsAgainst, isHome) {
    const win = pointsFor > pointsAgainst;
    const { data: current, error } = await supabaseAdmin
      .from('team_season_stats')
      .select('id, wins, losses, points_for, points_against, home_wins, home_losses, away_wins, away_losses')
      .eq('team_id', teamId)
      .eq('season_id', seasonId)
      .single();

    if (error && error.code !== 'PGRST116') throw new Error(`Failed to fetch team stats: ${error.message}`);

    const stats  = current || { wins:0, losses:0, points_for:0, points_against:0, home_wins:0, home_losses:0, away_wins:0, away_losses:0 };
    const update = {
      wins:           stats.wins           + (win ? 1 : 0),
      losses:         stats.losses         + (win ? 0 : 1),
      points_for:    (stats.points_for     || 0) + pointsFor,
      points_against:(stats.points_against || 0) + pointsAgainst,
    };
    if (isHome) {
      update.home_wins   = (stats.home_wins   || 0) + (win ? 1 : 0);
      update.home_losses = (stats.home_losses || 0) + (win ? 0 : 1);
    } else {
      update.away_wins   = (stats.away_wins   || 0) + (win ? 1 : 0);
      update.away_losses = (stats.away_losses || 0) + (win ? 0 : 1);
    }

    if (current) {
      const { error: ue } = await supabaseAdmin.from('team_season_stats').update(update).eq('id', current.id);
      if (ue) throw new Error(`Failed to update team stats: ${ue.message}`);
    } else {
      const { error: ie } = await supabaseAdmin.from('team_season_stats').insert({ team_id: teamId, season_id: seasonId, saved_game_id: this.savedGameId, ...update });
      if (ie) throw new Error(`Failed to insert team stats: ${ie.message}`);
    }
  }

  // ── PRIVATE: single-game player-stat update (used by simulateGame) ───────

  async _updatePlayerSeasonStats(seasonId, boxScores) {
    for (const box of boxScores) {
      const { data: existing, error: fe } = await supabaseAdmin
        .from('player_season_stats')
        .select('*')
        .eq('player_id', box.player_id)
        .eq('season_id', seasonId)
        .single();

      if (fe && fe.code !== 'PGRST116') throw new Error(`Failed to find player season stats: ${fe.message}`);

      const newStats = {
        games_played:       (existing?.games_played       || 0) + 1,
        total_points:       (existing?.total_points       || 0) + box.points,
        total_rebounds:     (existing?.total_rebounds     || 0) + box.rebounds,
        total_assists:      (existing?.total_assists      || 0) + box.assists,
        total_steals:       (existing?.total_steals       || 0) + box.steals,
        total_blocks:       (existing?.total_blocks       || 0) + box.blocks,
        total_turnovers:    (existing?.total_turnovers    || 0) + box.turnovers,
        total_fga:          (existing?.total_fga          || 0) + box.fga,
        total_fgm:          (existing?.total_fgm          || 0) + box.fgm,
        total_fga_3:        (existing?.total_fga_3        || 0) + box.fga_3,
        total_fgm_3:        (existing?.total_fgm_3        || 0) + box.fgm_3,
        total_fta:          (existing?.total_fta          || 0) + box.fta,
        total_ftm:          (existing?.total_ftm          || 0) + box.ftm,
        offensive_rebounds: (existing?.offensive_rebounds || 0) + (box.offensive_rebounds || 0),
        defensive_rebounds: (existing?.defensive_rebounds || 0) + (box.defensive_rebounds || 0),
        minutes:            (existing?.minutes            || 0) + (box.minutes_played     || 0),
      };

      if (existing) {
        const { error: ue } = await supabaseAdmin.from('player_season_stats').update(newStats).eq('id', existing.id);
        if (ue) throw new Error(`Failed to update player stats: ${ue.message}`);
      } else {
        const { error: ie } = await supabaseAdmin.from('player_season_stats').insert({ player_id: box.player_id, season_id: seasonId, team_id: box.team_id, saved_game_id: this.savedGameId, ...newStats });
        if (ie) throw new Error(`Failed to insert player stats: ${ie.message}`);
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  async _getGameState() {
    const { data, error } = await supabaseAdmin
      .from('saved_games').select('game_state').eq('id', this.savedGameId).single();
    if (error || !data) return {};
    return data.game_state || {};
  }

  async getCurrentSeasonId() {
    const { data: game, error } = await supabaseAdmin
      .from('saved_games').select('game_state').eq('id', this.savedGameId).single();
    if (error) throw new Error(`Failed to get saved game: ${error.message}`);

    if (game.game_state?.season_id) return game.game_state.season_id;

    const { data: seasons, error: sError } = await supabaseAdmin
      .from('seasons').select('id')
      .eq('saved_game_id', this.savedGameId)
      .order('season_number', { ascending: false })
      .limit(1);
    if (sError || !seasons?.length) throw new Error('No season found for this saved game');
    return seasons[0].id;
  }

  // ── Trade ─────────────────────────────────────────────────────────────────

  async tradePlayer(playerId, newTeamId) {
    const { data: destTeam, error: te } = await supabaseAdmin
      .from('teams').select('id').eq('id', newTeamId).eq('saved_game_id', this.savedGameId).single();
    if (te || !destTeam) throw new Error('Destination team not found in this saved game');

    const { data, error } = await supabaseAdmin
      .from('players').update({ team_id: newTeamId })
      .eq('id', playerId).eq('saved_game_id', this.savedGameId).select().single();
    if (error) throw new Error(`Failed to trade player: ${error.message}`);
    return data;
  }

  async simulateSeason() {
    throw new Error('simulateSeason() is not implemented. Use simulateWeek() or simulateToNextUserGame() instead.');
  }

  async simulateToDate(targetDate, chunkSize = 200) {
    if (!targetDate) throw new Error('targetDate is required');
 
    const seasonId = await this.getCurrentSeasonId();
 
    // ── Grab the next chunk of scheduled games up to the target date ─────────
    const { data: games, error: gamesErr } = await supabaseAdmin
      .from('games')
      .select('*')
      .eq('season_id', seasonId)
      .eq('status', 'scheduled')
      .lte('game_date', targetDate)          // only games on or before target
      .order('game_date', { ascending: true })
      .limit(chunkSize);
 
    if (gamesErr) throw new Error(`Failed to fetch games: ${gamesErr.message}`);
 
    // ── Count how many scheduled games remain in range (for progress bar) ────
    const { count: totalInRange, error: countErr } = await supabaseAdmin
      .from('games')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', seasonId)
      .eq('status', 'scheduled')
      .lte('game_date', targetDate);
 
    if (countErr) throw new Error(`Failed to count remaining games: ${countErr.message}`);
 
    // Nothing left to simulate in this range
    if (!games?.length) {
      return {
        gamesSimulated: 0,
        gamesRemaining: 0,
        complete:       true,
        results:        [],
      };
    }
 
    // ── Simulate this chunk ──────────────────────────────────────────────────
    const results = await this._bulkSimulateGames(games, seasonId);

    const maxSimDate = games[games.length - 1].game_date;
    const currentState = await this._getGameState();
    await supabaseAdmin
    .from('saved_games')
    .update({
        game_state: {
        ...currentState,
        last_simulated_to: maxSimDate,
        last_simulated_at: new Date().toISOString(),
        },
    })
    .eq('id', this.savedGameId);
 
    // After simulating, remaining = totalInRange minus what we just processed
    const gamesRemaining = Math.max(0, (totalInRange || 0) - games.length);
 
    return {
      gamesSimulated: games.length,
      gamesRemaining,
      complete:       gamesRemaining === 0,
      results,
    };
  }
}

module.exports = LeagueService;