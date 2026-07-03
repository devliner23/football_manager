const { supabaseAdmin } = require('../config/supabase');
const NBA_TEAMS = require('../data/teams.json');
const GameSimulationEngine = require('./gameSimulationEngine');
const PlayerGenerator = require('./playerGenerator');
const TeamArchetypeService = require('./teamArchetypeService');
const LineupService = require("./lineupService");
const playerProgression = require("./playerProgression");
const FinanceService = require("./financeService");
const { generateFreeAgentPool } = require("./freeAgentGenerator");

const ROSTER_SIZE = 15;
const BATCH_SIZE_STATS   = 200;
const BATCH_SIZE_PLAYERS = 100;

const DAYS_IN_SEASON    = 180;
const MAX_GAMES_PER_DAY = 10;

const FA_BATCH_SIZE = 100;
const MAX_ROSTER_SIZE = 15;

// ── Box-score mapper ──────────────────────────────────────────────────────────
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

  /**
   * Generate and insert all player rows.
   *
   * @param {Array}  teams         - team objects from DB (must have .id and .name)
   * @param {number} season        - season number (affects player generation)
   * @param {Object} teamArchetypes - { [teamId]: archetypeId }
   */
  async createRosters(teams, season = 1, teamArchetypes = {}) {
    console.log(`🎮 Starting roster creation for ${teams.length} teams...`);

    // 1. Generate base players via the existing PlayerGenerator
    const generator = new PlayerGenerator(this.savedGameId, season);
    const basePlayers = generator.generateLeague(teams);
    console.log(`✅ Generated ${basePlayers.length} players. Applying archetype modifiers...`);

    // 2. Apply archetype attribute modifiers to each player
    const players = basePlayers.map(player => {
      const archetypeId = teamArchetypes[player.team_id];
      if (!archetypeId) return player;
      return TeamArchetypeService.applyToPlayer(player, archetypeId);
    });

    // 3. Batch-insert into DB
    const allInserted = [];
    for (let i = 0; i < players.length; i += BATCH_SIZE_PLAYERS) {
      const batch = players.slice(i, i + BATCH_SIZE_PLAYERS);
      console.log(
        `📦 Inserting player batch ${Math.floor(i / BATCH_SIZE_PLAYERS) + 1} ` +
        `(${batch.length} players)...`
      );
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
   */
  async generateSchedule(teams, seasonId) {
    if (!Array.isArray(teams) || teams.length < 2) {
      throw new Error('At least two teams are required.');
    }
    if (!seasonId) throw new Error('seasonId is required.');

    const teamIds = teams.map(t => t.id);
    const n = teamIds.length;
    if (n % 2 !== 0) throw new Error('Number of teams must be even (30 for NBA style).');

    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);
    startDate.setHours(0, 0, 0, 0);

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
            season_id:     seasonId,
            home_team_id:  home,
            away_team_id:  away,
            status:        'scheduled',
            saved_game_id: this.savedGameId,
          });
        }
        rounds.push(roundGames);
        indices.splice(1, 0, indices.pop());
      }
      return rounds;
    };

    const cycle1 = generateRoundRobin(true);
    const cycle2 = generateRoundRobin(false);
    const baseRounds = [...cycle1, ...cycle2];

    const baseSubRounds = [];
    for (const round of baseRounds) {
      for (let i = 0; i < round.length; i += MAX_GAMES_PER_DAY) {
        baseSubRounds.push(round.slice(i, i + MAX_GAMES_PER_DAY));
      }
    }

    const daySlots = Array.from({ length: DAYS_IN_SEASON }, () => ({
      teams: new Set(),
      games: [],
    }));

    for (let i = 0; i < baseSubRounds.length; i++) {
      const dayIdx = i;
      for (const game of baseSubRounds[i]) {
        daySlots[dayIdx].teams.add(game.home_team_id);
        daySlots[dayIdx].teams.add(game.away_team_id);
        daySlots[dayIdx].games.push(game);
      }
    }

    const extraGames = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dist = j - i;
        if (dist <= 12 || dist >= 18) {
          const home = dist <= 12 ? teamIds[i] : teamIds[j];
          const away = dist <= 12 ? teamIds[j] : teamIds[i];
          extraGames.push({
            season_id:     seasonId,
            home_team_id:  home,
            away_team_id:  away,
            status:        'scheduled',
            saved_game_id: this.savedGameId,
          });
        }
      }
    }

    extraGames.sort((a, b) => {
      if (a.home_team_id < b.home_team_id) return -1;
      if (a.home_team_id > b.home_team_id) return 1;
      return a.away_team_id < b.away_team_id ? -1 : 1;
    });

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

    const allGames = [];
    for (let d = 0; d < DAYS_IN_SEASON; d++) {
      const slot = daySlots[d];
      if (slot.games.length === 0) continue;
      const gameDate = new Date(startDate);
      gameDate.setDate(gameDate.getDate() + d);
      const dateStr = gameDate.toISOString();
      const dayDiff = Math.floor((gameDate - startDate) / (1000 * 60 * 60 * 24));
      const week    = Math.floor(dayDiff / 7) + 1;
      for (const game of slot.games) {
        game.game_date = dateStr;
        game.week      = week;
        allGames.push(game);
      }
    }

    if (allGames.length !== n * (n - 1) + extraGames.length) {
      throw new Error(
        `Game count mismatch: expected ${n * (n - 1) + extraGames.length}, got ${allGames.length}`
      );
    }

    for (let i = 0; i < allGames.length; i += BATCH_SIZE_PLAYERS) {
      const batch = allGames.slice(i, i + BATCH_SIZE_PLAYERS);
      const { error } = await supabaseAdmin.from('games').insert(batch);
      if (error) throw new Error(`Failed to create schedule: ${error.message}`);
    }

    return allGames.length;
  }

  async rollbackLeague() {
    await supabaseAdmin.from('players').delete().eq('saved_game_id', this.savedGameId);
    await supabaseAdmin.from('teams').delete().eq('saved_game_id', this.savedGameId);
  }

  /**
   * Initialize the full league for a saved game.
   *
   * @param {number} season          - season number (default 1)
   * @param {string} managedClubName - team name chosen by the user
   * @param {string} userArchetype   - archetype ID chosen by the user (optional)
   */
  async initializeLeague(season = 1, managedClubName = null, userArchetype = null) {
    const existingTeams = await this.getTeams();
    if (existingTeams.length > 0) {
      throw new Error(`League already initialized for saved game ${this.savedGameId}`);
    }

    // Validate the user-supplied archetype; fall back to random if invalid
    const validUserArchetype =
      userArchetype && TeamArchetypeService.isValidArchetype(userArchetype)
        ? userArchetype
        : TeamArchetypeService.getRandomArchetype();

    let teams, seasonRecord;
    try {
      // 1. Create the 30 teams
      teams = await this.createTeams();

      // 2. Resolve the managed team
      let managedTeamId = null;
      if (managedClubName && typeof managedClubName === 'string') {
        const found   = teams.find(t => t.name.toLowerCase() === managedClubName.toLowerCase());
        managedTeamId = found ? found.id : teams[0]?.id;
      } else {
        managedTeamId = teams[0]?.id;
        console.warn('managedClubName is not a valid string, defaulting to first team:', managedClubName);
      }

      // 3. Assign archetypes – user's team gets their choice, CPU teams get random
      const teamArchetypes = {};
      for (const team of teams) {
        teamArchetypes[team.id] =
          team.id === managedTeamId
            ? validUserArchetype
            : TeamArchetypeService.getRandomArchetype();
      }

      console.log(`🏀 User team archetype: ${validUserArchetype}`);
      console.log(`🎲 CPU archetypes assigned to ${teams.length - 1} teams`);

      // 4. Generate rosters (archetype modifiers applied inside createRosters)
      const players    = await this.createRosters(teams, season, teamArchetypes);
      seasonRecord     = await this.createSeason(season);
      await this.createSeasonStats(teams, seasonRecord.id);
      const gamesCount = await this.generateSchedule(teams, seasonRecord.id);
      const faCount    = await this.createFreeAgents(season);

      // ====================================================================
      // 🔥 FINANCE SYSTEM LOGIC INJECTION
      // ====================================================================
      console.log(`[Finance] Initializing salaries, contracts, and team salary caps...`);
      const financeResult = await FinanceService.initializeLeagueFinances(
        this.savedGameId, 
        teams, 
        players
      );
      
      if (!financeResult.success) {
        throw new Error("Financial setup failed during league initialization.");
      }
      // ====================================================================

      // 5. Persist metadata to the saved_game row
      const currentState = (await this._getGameState()) || {};
      await supabaseAdmin
        .from('saved_games')
        .update({
          current_season:  season,
          managed_club_id: managedTeamId,
          game_state: {
            ...currentState,
            initialized_at:  new Date().toISOString(),
            season_id:       seasonRecord.id,
            total_games:     gamesCount,
            team_archetypes: teamArchetypes,    // ← stored for future seasons
            user_archetype:  validUserArchetype, // ← quick lookup
          },
        })
        .eq('id', this.savedGameId);

      return {
        season,
        teamsCreated:   teams.length,
        playersCreated: players.length,
        freeAgentsCreated:   faCount.length, 
        gamesCreated:   gamesCount,
        userArchetype:  validUserArchetype,
        financesInitialized: true
      };
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

    const lineups = await this._getLineupsForTeams([homeTeamId, awayTeamId]);
    const result = GameSimulationEngine.simulateGame(homePlayers, awayPlayers, {
      homeCourtAdvantage: 1.03,
      homeLineup: lineups[homeTeamId],
      awayLineup: lineups[awayTeamId],
    });
    const allStats = [
      ...result.homeBoxScores.map(b => mapBoxScore(b, homeTeamId, gameId, this.savedGameId)),
      ...result.awayBoxScores.map(b => mapBoxScore(b, awayTeamId, gameId, this.savedGameId)),
    ];

    const { error: statsError } = await supabaseAdmin.from('player_game_stats').insert(allStats);
    if (statsError) throw new Error(`Failed to insert player stats: ${statsError.message}`);

    await PlayerProgressionService.progressPlayersFromBoxScores(this.savedGameId, allStats);

    const { error: updateGameError } = await supabaseAdmin
      .from('games')
      .update({
        home_score: result.homeScore,
        away_score: result.awayScore,
        status:     'completed',
        played_at:  new Date().toISOString(),
      })
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

  async simulateWeek() {
    const seasonId = await this.getCurrentSeasonId();

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

    const { data: nextGame, error: nextError } = await supabaseAdmin
      .from('games')
      .select(`
        id, game_date, week, status,
        home_team_id, away_team_id,
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

    if (!nextGame) {
      return { seasonComplete: true, nextUserGame: null, leagueGamesBeforeCount: 0 };
    }

    const { count, error: countError } = await supabaseAdmin
      .from('games')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', seasonId)
      .eq('status', 'scheduled')
      .lt('game_date', nextGame.game_date);

    if (countError) throw new Error(`Failed to count prior games: ${countError.message}`);

    return {
      seasonComplete:         false,
      leagueGamesBeforeCount: count ?? 0,
      nextUserGame: {
        ...nextGame,
        isHome: nextGame.home_team_id === managedClubId,
      },
    };
  }

  // ── Simulate all league games up to the user's next game ─────────────────

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

    const { data: nextUserGame, error: nextError } = await supabaseAdmin
      .from('games')
      .select(`
        id, game_date, week, status,
        home_team_id, away_team_id,
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

    if (!nextUserGame) {
      await supabaseAdmin
        .from('seasons')
        .update({ status: 'finished', end_date: new Date().toISOString() })
        .eq('id', seasonId);
      return { seasonComplete: true, gamesSimulated: 0, results: [], nextUserGame: null };
    }

    const { data: gamesToSim, error: gamesError } = await supabaseAdmin
      .from('games')
      .select('*')
      .eq('season_id', seasonId)
      .eq('status', 'scheduled')
      .lt('game_date', nextUserGame.game_date)
      .order('game_date', { ascending: true });

    if (gamesError) throw new Error(`Failed to fetch games to simulate: ${gamesError.message}`);

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

    const results = await this._bulkSimulateGames(gamesToSim, seasonId);

    const currentState = await this._getGameState();
    await supabaseAdmin
      .from('saved_games')
      .update({
        game_state: {
          ...currentState,
          last_simulated_at:  new Date().toISOString(),
          last_sim_to_date:   nextUserGame.game_date,
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

  // ── PRIVATE: core bulk-simulation logic ──────────────────────────────────

  async _bulkSimulateGames(games, seasonId) {
    if (!games?.length) return [];

    const teamIds = [...new Set(games.flatMap(g => [g.home_team_id, g.away_team_id]))];
    const rosterEntries = await Promise.all(
      teamIds.map(async id => [id, await this.getRosterForTeam(id)])
    );
    const rosterMap = Object.fromEntries(rosterEntries);

// In _bulkSimulateGames(games, seasonId), after rosterMap is built, add:
    const lineupMap = await this._getLineupsForTeams(teamIds);

    // Then update the simResults mapping to pass lineups:
    const simResults = games.map(game => {
      const result = GameSimulationEngine.simulateGame(
        rosterMap[game.home_team_id],
        rosterMap[game.away_team_id],
        {
          homeCourtAdvantage: 1.03,
          homeLineup: lineupMap[game.home_team_id],
          awayLineup: lineupMap[game.away_team_id],
        }
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

    await this._upsertTeamStats(simResults, seasonId);
    await this._upsertPlayerSeasonStats(allBoxScores, seasonId);

    const progression = await PlayerProgressionService.progressPlayersFromBoxScores(
      this.savedGameId,
      allBoxScores
    );
    console.log(
      `📈 Progression: ${progression.playersProgressed} up, ` +
      `${progression.playersRegressed} down (net Δ ${progression.totalDelta})`
    );

    return simResults.map(({ game, result }) => ({
      gameId:     game.id,
      game_date:  game.game_date,
      homeTeamId: game.home_team_id,
      awayTeamId: game.away_team_id,
      homeScore:  result.homeScore,
      awayScore:  result.awayScore,
      overtime:   result.overtime,
    }));
  }

  // ── PRIVATE: upsert team season stats ────────────────────────────────────

  async _upsertTeamStats(simResults, seasonId) {
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

  // ── PRIVATE: upsert player season stats ──────────────────────────────────

  async _upsertPlayerSeasonStats(boxScores, seasonId) {
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

  // ── PRIVATE: single-game team-stat update ────────────────────────────────

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

  // ── PRIVATE: single-game player-stat update ───────────────────────────────

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

    const { data: games, error: gamesErr } = await supabaseAdmin
      .from('games')
      .select('*')
      .eq('season_id', seasonId)
      .eq('status', 'scheduled')
      .lte('game_date', targetDate)
      .order('game_date', { ascending: true })
      .limit(chunkSize);

    if (gamesErr) throw new Error(`Failed to fetch games: ${gamesErr.message}`);

    const { count: totalInRange, error: countErr } = await supabaseAdmin
      .from('games')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', seasonId)
      .eq('status', 'scheduled')
      .lte('game_date', targetDate);

    if (countErr) throw new Error(`Failed to count remaining games: ${countErr.message}`);

    if (!games?.length) {
      return { gamesSimulated: 0, gamesRemaining: 0, complete: true, results: [] };
    }

    const results = await this._bulkSimulateGames(games, seasonId);

    const maxSimDate   = games[games.length - 1].game_date;
    const currentState = await this._getGameState();
    await supabaseAdmin
      .from('saved_games')
      .update({
        current_game_date: maxSimDate,
        game_state: {
          ...currentState,
          last_simulated_to: maxSimDate,
          last_simulated_at: new Date().toISOString(),
        },
      })
      .eq('id', this.savedGameId);

    const gamesRemaining = Math.max(0, (totalInRange || 0) - games.length);

    return {
      gamesSimulated: games.length,
      gamesRemaining,
      complete:       gamesRemaining === 0,
      results,
    };
  }

  // ── Create free agent pool ────────────────────────────────────────────────────
 
/**
 * Generate and persist the initial free agent pool.
 * Called once during initializeLeague().
 *
 * @param {number} season
 * @param {number} count  - number of free agents to seed (default 75)
 */
async createFreeAgents(season = 1, count = 75) {
  const players = generateFreeAgentPool(this.savedGameId, count);
 
  const inserted = [];
  for (let i = 0; i < players.length; i += FA_BATCH_SIZE) {
    const batch = players.slice(i, i + FA_BATCH_SIZE);
    const { data, error } = await supabaseAdmin
      .from('players')
      .insert(batch)
      .select();
    if (error) throw new Error(`Failed to create free agents: ${error.message}`);
    inserted.push(...data);
  }
 
  console.log(`✅ Created ${inserted.length} free agents`);
  return inserted;
}
 
// ── Get free agents ───────────────────────────────────────────────────────────
 
/**
 * Return all free agents for this saved game, sorted by overall_rating desc.
 *
 * @param {Object} options
 * @param {string} [options.position]      - filter by position ('PG','SG',…)
 * @param {number} [options.minOverall]    - filter by minimum overall rating
 * @param {number} [options.limit]         - max rows to return (default 100)
 * @param {number} [options.offset]        - pagination offset (default 0)
 */
async getFreeAgents({ position, minOverall, limit = 100, offset = 0 } = {}) {
  let query = supabaseAdmin
    .from('players')
    .select('*')
    .eq('saved_game_id', this.savedGameId)
    .is('team_id', null)
    .order('overall_rating', { ascending: false })
    .range(offset, offset + limit - 1);
 
  if (position) {
    query = query.eq('position', position);
  }
  if (minOverall != null) {
    query = query.gte('overall_rating', minOverall);
  }
 
  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch free agents: ${error.message}`);
  return data || [];
}
 
 
  /**
   * Release a player from their team, making them a free agent.
   * - Sets team_id to null.
   * - Season stats are preserved (they keep their history).
   * - Validates the player belongs to this saved game.
   *
   * @param {string} playerId
   * @returns {Object} updated player row
   */
  async releasePlayer(playerId) {
    // 1. Confirm player exists in this save
    const { data: player, error: fetchError } = await supabaseAdmin
      .from('players')
      .select('id, team_id, first_name, last_name, saved_game_id')
      .eq('id', playerId)
      .eq('saved_game_id', this.savedGameId)
      .single();
  
    if (fetchError || !player) {
      throw new Error('Player not found in this saved game');
    }
    if (player.team_id === null) {
      throw new Error('Player is already a free agent');
    }
  
    // 2. Check roster size won't break — not required here (releasing is always ok)
  
    // 3. Set team_id to null
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('players')
      .update({ team_id: null })
      .eq('id', playerId)
      .eq('saved_game_id', this.savedGameId)
      .select()
      .single();
  
    if (updateError) throw new Error(`Failed to release player: ${updateError.message}`);
  
    console.log(`🔓 Released ${player.first_name} ${player.last_name} to free agency`);
    return updated;
  }
 
// ── Sign a free agent ─────────────────────────────────────────────────────────
 
/**
 * Sign a free agent to a team.
 * - Validates the player is actually a free agent.
 * - Validates the destination team belongs to this saved game.
 * - Enforces MAX_ROSTER_SIZE (15).
 *
 * @param {string} playerId
 * @param {string} teamId
 * @returns {Object} updated player row
 */
async signFreeAgent(playerId, teamId) {
  // 1. Confirm player is a free agent in this save
  const { data: player, error: fetchError } = await supabaseAdmin
    .from('players')
    .select('id, team_id, first_name, last_name, overall_rating, position')
    .eq('id', playerId)
    .eq('saved_game_id', this.savedGameId)
    .single();
 
  if (fetchError || !player) {
    throw new Error('Player not found in this saved game');
  }
  if (player.team_id !== null) {
    throw new Error('Player is not a free agent — release them first');
  }
 
  // 2. Confirm destination team exists in this save
  const { data: team, error: teamError } = await supabaseAdmin
    .from('teams')
    .select('id, name')
    .eq('id', teamId)
    .eq('saved_game_id', this.savedGameId)
    .single();
 
  if (teamError || !team) {
    throw new Error('Team not found in this saved game');
  }
 
  // 3. Enforce roster size cap
  const { count, error: countError } = await supabaseAdmin
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .eq('saved_game_id', this.savedGameId);
 
  if (countError) throw new Error(`Failed to check roster size: ${countError.message}`);
 
  if ((count ?? 0) >= MAX_ROSTER_SIZE) {
    throw new Error(
      `Roster full — ${team.name} already has ${count} players (max ${MAX_ROSTER_SIZE}). ` +
      `Release a player first.`
    );
  }
 
  // 4. Assign the player
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('players')
    .update({ team_id: teamId })
    .eq('id', playerId)
    .eq('saved_game_id', this.savedGameId)
    .select()
    .single();
 
  if (updateError) throw new Error(`Failed to sign free agent: ${updateError.message}`);
 
  console.log(
    `✍️  Signed ${player.first_name} ${player.last_name} ` +
    `(${player.position}, OVR ${player.overall_rating}) → ${team.name}`
  );
  return updated;
}

  /**
   * Propose a trade from the user's managed team to another team.
   * @param {string} savedGameId
   * @param {string} proposingTeamId - must be the user's managed_club_id
   * @param {string} receivingTeamId
   * @param {string[]} playerIdsFromProposer - players the user is giving away
   * @param {string[]} playerIdsFromReceiver - players the user wants to receive
   * @returns trade object with status and reason
   */
  async proposeTrade(savedGameId, proposingTeamId, receivingTeamId, playerIdsFromProposer, playerIdsFromReceiver) {
    // 1. Validate teams belong to the same saved game
    const teams = await db.query(
      `SELECT id FROM teams WHERE id IN ($1, $2) AND saved_game_id = $3`,
      [proposingTeamId, receivingTeamId, savedGameId]
    );
    if (teams.rowCount !== 2) {
      throw new Error('One or both teams do not belong to this saved game.');
    }

    // 2. Validate players exist and belong to the correct teams
    const allPlayerIds = [...playerIdsFromProposer, ...playerIdsFromReceiver];
    if (allPlayerIds.length === 0) {
      throw new Error('Must include at least one player from each team.');
    }

    const players = await db.query(
      `SELECT id, team_id, overall_rating, potential_rating, age FROM players
       WHERE id = ANY($1::uuid[]) AND saved_game_id = $2`,
      [allPlayerIds, savedGameId]
    );
    if (players.rowCount !== allPlayerIds.length) {
      throw new Error('Some players not found in this saved game.');
    }

    const playerMap = {};
    players.rows.forEach(p => { playerMap[p.id] = p; });

    // Verify team ownership
    for (const pid of playerIdsFromProposer) {
      if (playerMap[pid].team_id !== proposingTeamId) {
        throw new Error(`Player ${pid} does not belong to the proposing team.`);
      }
    }
    for (const pid of playerIdsFromReceiver) {
      if (playerMap[pid].team_id !== receivingTeamId) {
        throw new Error(`Player ${pid} does not belong to the receiving team.`);
      }
    }

    // 3. Check for existing pending trades involving any of these players (optional, to avoid conflicts)
    const pendingConflicts = await db.query(
      `SELECT 1 FROM trade_players tp
       JOIN trades t ON tp.trade_id = t.id
       WHERE tp.player_id = ANY($1::uuid[])
         AND t.saved_game_id = $2
         AND t.status = 'pending'`,
      [allPlayerIds, savedGameId]
    );
    if (pendingConflicts.rowCount > 0) {
      throw new Error('One or more players are already involved in a pending trade.');
    }

    // 4. Evaluate trade using AI logic
    const proposingPlayersData = playerIdsFromProposer.map(id => playerMap[id]);
    const receivingPlayersData = playerIdsFromReceiver.map(id => playerMap[id]);
    const evaluation = evaluateTrade(proposingPlayersData, receivingPlayersData);

    // 5. Insert trade record
    const tradeResult = await db.query(
      `INSERT INTO trades (saved_game_id, proposing_team_id, receiving_team_id, status)
       VALUES ($1, $2, $3, 'pending') RETURNING *`,
      [savedGameId, proposingTeamId, receivingTeamId]
    );
    const trade = tradeResult.rows[0];

    // 6. Insert trade players
    const tradePlayerValues = [];
    const now = new Date().toISOString();

    for (const pid of playerIdsFromProposer) {
      tradePlayerValues.push(`('${trade.id}', '${pid}', '${proposingTeamId}', '${receivingTeamId}')`);
    }
    for (const pid of playerIdsFromReceiver) {
      tradePlayerValues.push(`('${trade.id}', '${pid}', '${receivingTeamId}', '${proposingTeamId}')`);
    }

    await db.query(
      `INSERT INTO trade_players (trade_id, player_id, from_team_id, to_team_id) VALUES ${tradePlayerValues.join(', ')}`
    );

    // 7. If AI accepts immediately, complete the trade
    if (evaluation.accepted) {
      await this.acceptTrade(trade.id, savedGameId, false); // false = skip permission check
      trade.status = 'completed';
      trade.result = 'Trade accepted and completed.';
    } else {
      trade.status = 'pending';
      trade.result = evaluation.reason;
    }

    return trade;
  }

  /**
   * Accept a pending trade (either manual or automatic).
   * @param {string} tradeId
   * @param {string} savedGameId
   * @param {boolean} requireAuthority - if true, only receiving team can accept
   */
  async acceptTrade(tradeId, savedGameId, requireAuthority = true) {
    const tradeResult = await db.query(
      `SELECT * FROM trades WHERE id = $1 AND saved_game_id = $2 AND status = 'pending'`,
      [tradeId, savedGameId]
    );
    if (tradeResult.rowCount === 0) {
      throw new Error('Trade not found or not pending.');
    }
    const trade = tradeResult.rows[0];

    // If requireAuthority, verify caller is the receiving team (could be enforced at controller level)
    // but we pass it here for flexibility.

    // Get all trade players
    const tradePlayers = await db.query(
      `SELECT * FROM trade_players WHERE trade_id = $1`,
      [tradeId]
    );

    // Perform the swap: update player team_id
    for (const tp of tradePlayers.rows) {
      await db.query(
        `UPDATE players SET team_id = $1, updated_at = now() WHERE id = $2`,
        [tp.to_team_id, tp.player_id]
      );
    }

    // Mark trade as completed
    await db.query(
      `UPDATE trades SET status = 'completed', updated_at = now() WHERE id = $1`,
      [tradeId]
    );

    return { ...trade, status: 'completed' };
  }

  /**
   * Reject a pending trade.
   */
  async rejectTrade(tradeId, savedGameId) {
    const result = await db.query(
      `UPDATE trades SET status = 'rejected', updated_at = now()
       WHERE id = $1 AND saved_game_id = $2 AND status = 'pending' RETURNING *`,
      [tradeId, savedGameId]
    );
    if (result.rowCount === 0) throw new Error('Trade not found or not pending.');
    return result.rows[0];
  }

  /**
   * Cancel a trade (proposing team or system).
   */
  async cancelTrade(tradeId, savedGameId) {
    const result = await db.query(
      `UPDATE trades SET status = 'cancelled', updated_at = now()
       WHERE id = $1 AND saved_game_id = $2 AND status = 'pending' RETURNING *`,
      [tradeId, savedGameId]
    );
    if (result.rowCount === 0) throw new Error('Trade not found or not pending.');
    return result.rows[0];
  }

  /**
   * Get all trades for a saved game (optionally filtered by team).
   */
  async getTrades(savedGameId, teamId = null) {
    let query = `SELECT t.*,
                        json_agg(json_build_object(
                          'player_id', tp.player_id,
                          'from_team_id', tp.from_team_id,
                          'to_team_id', tp.to_team_id
                        )) as players
                 FROM trades t
                 LEFT JOIN trade_players tp ON t.id = tp.trade_id
                 WHERE t.saved_game_id = $1`;
    const params = [savedGameId];

    if (teamId) {
      query += ` AND (t.proposing_team_id = $2 OR t.receiving_team_id = $2)`;
      params.push(teamId);
    }

    query += ` GROUP BY t.id ORDER BY t.created_at DESC`;

    const result = await db.query(query, params);
    return result.rows;
  }

  /**
   * Get a single trade by ID with its players.
   */
  async getTradeById(tradeId, savedGameId) {
    const result = await db.query(
      `SELECT t.*,
              json_agg(json_build_object(
                'player_id', tp.player_id,
                'from_team_id', tp.from_team_id,
                'to_team_id', tp.to_team_id
              )) as players
       FROM trades t
       LEFT JOIN trade_players tp ON t.id = tp.trade_id
       WHERE t.id = $1 AND t.saved_game_id = $2
       GROUP BY t.id`,
      [tradeId, savedGameId]
    );
    if (result.rowCount === 0) throw new Error('Trade not found.');
    return result.rows[0];
  }

  async _getLineupsForTeams(teamIds) {
    const lineupService = new LineupService(this.savedGameId);
    const entries = await Promise.all(
      teamIds.map(async id => [id, await lineupService.getLineupForSimulation(id)])
    );
    return Object.fromEntries(entries);
  }
};


module.exports = LeagueService;