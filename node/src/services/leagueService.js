const { supabaseAdmin } = require('../config/supabase');
const NBA_TEAMS = require('../data/teams.json');
const GameSimulationEngine = require('./utils/gameSimulationEngine');
const PlayerGenerator = require('./utils/playerGenerator');
const TeamArchetypeService = require('./utils/teamArchetypeService');
const LineupService = require("./lineupService");
const playerProgressionService = require("./utils/playerProgression");
const FinanceService = require("./financeService");
const CoachGenerator = require("./utils/coachGenerator")
const { generateFreeAgentPool } = require("./utils/freeAgentGenerator");

const ROSTER_SIZE = 15;
const BATCH_SIZE_STATS   = 500;    // ✅ Increased from 200
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

function evaluateTrade(giving, receiving) {
  const sum = arr => arr.reduce((s, p) => s + (p.overall_rating || 0) + (p.potential_rating || 0) * 0.3, 0);
  const diff = sum(receiving) - sum(giving);
  return {
    accepted: diff <= 15,
    reason: diff <= 15 ? 'Fair value trade' : 'Receiving team wants more value',
  };
}

// ── LEAGUE SERVICE ────────────────────────────────────────────────────────────
class leagueService {
  constructor(savedGameId) {
    if (!savedGameId) throw new Error('LeagueService requires a savedGameId');
    this.savedGameId = savedGameId;
    // ✅ Simple in-memory cache for request-scoped data
    this._rosterCache = new Map();
    this._lineupCache = new Map();
  }

  /**
   * ✅ OPTIMIZED: Use a single RPC call or batched deletes
   * Original: 11 sequential delete queries
   */
  async rollbackLeague() {
    const tables = [
      'player_progression', 'player_season_stats', 'player_game_stats',
      'team_season_stats', 'contracts', 'coach_contracts', 'coaches',
      'games', 'players', 'seasons', 'teams'
    ];
    // Fire all deletes in parallel
    await Promise.all(
      tables.map(table => 
        supabaseAdmin.from(table).delete().eq('saved_game_id', this.savedGameId)
      )
    );
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

  /**
   * ✅ OPTIMIZED: Parse traits once, with optional caching
   */
  async getRosterForTeam(teamId, useCache = false) {
    if (useCache && this._rosterCache.has(teamId)) {
      return this._rosterCache.get(teamId);
    }

    const { data, error } = await supabaseAdmin
      .from('players')
      .select('*')
      .eq('saved_game_id', this.savedGameId)
      .eq('team_id', teamId)
      .order('overall_rating', { ascending: false });
    if (error) throw new Error(`Failed to load roster: ${error.message}`);
    
    const parsed = data.map(player => {
      let traits = player.traits;
      if (typeof traits === 'string') {
        try { traits = JSON.parse(traits); } catch { traits = {}; }
      }
      return { ...player, ...traits };
    });

    if (useCache) {
      this._rosterCache.set(teamId, parsed);
    }
    return parsed;
  }

  /**
   * ✅ OPTIMIZED: Fetch rosters for multiple teams in a SINGLE query
   * Original: N parallel queries (one per team)
   */
  async _getRostersForTeams(teamIds) {
    const { data, error } = await supabaseAdmin
      .from('players')
      .select('*')
      .eq('saved_game_id', this.savedGameId)
      .in('team_id', teamIds)
      .order('overall_rating', { ascending: false });

    if (error) throw new Error(`Failed to load rosters: ${error.message}`);

    const rosterMap = {};
    for (const player of data) {
      let traits = player.traits;
      if (typeof traits === 'string') {
        try { traits = JSON.parse(traits); } catch { traits = {}; }
      }
      const parsed = { ...player, ...traits };
      
      if (!rosterMap[player.team_id]) {
        rosterMap[player.team_id] = [];
      }
      rosterMap[player.team_id].push(parsed);
    }
    return rosterMap;
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
    // ✅ Removed .select() - we don't need returned data
    const { error } = await supabaseAdmin.from('teams').insert(rows);
    if (error) throw new Error(`Failed to create teams: ${error.message}`);
    // Re-fetch only if needed
    const { data } = await supabaseAdmin
      .from('teams')
      .select('*')
      .eq('saved_game_id', this.savedGameId);
    return data;
  }

  async createRosters(teams, season = 1, teamArchetypes = {}) {
    console.log(`🎮 Starting roster creation for ${teams.length} teams...`);

    const generator = new PlayerGenerator(this.savedGameId, season);
    const { players: basePlayers, teamTiers } = generator.generateLeague(teams);
    this._lastTeamTiers = teamTiers;
    console.log(`✅ Generated ${basePlayers.length} players. Applying archetype modifiers...`);

    const players = basePlayers.map(player => {
      const archetypeId = teamArchetypes[player.team_id];
      if (!archetypeId) return player;
      return TeamArchetypeService.applyToPlayer(player, archetypeId);
    });

    // ✅ OPTIMIZED: Use Promise.all for parallel batch inserts
    const batchPromises = [];
    for (let i = 0; i < players.length; i += BATCH_SIZE_PLAYERS) {
      const batch = players.slice(i, i + BATCH_SIZE_PLAYERS);
      batchPromises.push(
        supabaseAdmin.from('players').insert(batch).select()
      );
    }

    console.log(`📦 Inserting ${batchPromises.length} batches in parallel...`);
    const results = await Promise.all(batchPromises);
    
    const allInserted = [];
    for (const { data, error } of results) {
      if (error) throw new Error(`Failed to create players batch: ${error.message}`);
      if (data) allInserted.push(...data);
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
    // ✅ Removed .select() - don't need returned data
    const { error } = await supabaseAdmin.from('team_season_stats').insert(rows);
    if (error) throw new Error(`Failed to create season stats: ${error.message}`);
    return rows; // Return the input instead of fetching
  }

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
      const dateStr = `${gameDate.getFullYear()}-${String(gameDate.getMonth() + 1).padStart(2, '0')}-${String(gameDate.getDate()).padStart(2, '0')}`;
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

    // ✅ OPTIMIZED: Parallel batch inserts
    const insertPromises = [];
    for (let i = 0; i < allGames.length; i += BATCH_SIZE_PLAYERS) {
      const batch = allGames.slice(i, i + BATCH_SIZE_PLAYERS);
      insertPromises.push(supabaseAdmin.from('games').insert(batch));
    }
    const results = await Promise.all(insertPromises);
    for (const { error } of results) {
      if (error) throw new Error(`Failed to create schedule: ${error.message}`);
    }

    return allGames.length;
  }

  async initializeLeague(season = 1, managedClubName = null, userArchetype = null) {
    const { count } = await supabaseAdmin
      .from('teams')
      .select('*', { count: 'exact', head: true })
      .eq('saved_game_id', this.savedGameId);
    if (count > 0) {
      throw new Error(`League already initialized for saved game ${this.savedGameId}`);
    }

    try {
      const validUserArchetype =
        userArchetype && TeamArchetypeService.isValidArchetype(userArchetype)
          ? userArchetype
          : TeamArchetypeService.getRandomArchetype();

      const [teams, seasonRecord] = await Promise.all([
        this.createTeams(),
        this.createSeason(season),
      ]);

      let managedTeamId = null;
      if (managedClubName && typeof managedClubName === 'string') {
        const found = teams.find(
          t => t.name.toLowerCase() === managedClubName.toLowerCase()
        );
        managedTeamId = found ? found.id : teams[0]?.id;
      } else {
        managedTeamId = teams[0]?.id;
      }

      const teamArchetypes = {};
      for (const team of teams) {
        teamArchetypes[team.id] =
          team.id === managedTeamId
            ? validUserArchetype
            : TeamArchetypeService.getRandomArchetype();
      }

      const rosterPromise = this.createRosters(teams, season, teamArchetypes);
      const coachesPromise    = this.createCoaches(teams);
      const statsPromise      = this.createSeasonStats(teams, seasonRecord.id);
      const schedulePromise   = this.generateSchedule(teams, seasonRecord.id);
      const freeAgentsPromise = this.createFreeAgents(season);

      const players = await rosterPromise;
      const financePromise = FinanceService.initializeLeagueFinances(
        this.savedGameId,
        teams,
        players
      );

      const [
        _players,
        coaches,
        _stats,
        gamesCount,
        faCount,
        financeResult,
      ] = await Promise.all([
        rosterPromise,
        coachesPromise,
        statsPromise,
        schedulePromise,
        freeAgentsPromise,
        financePromise,
      ]);

      if (!financeResult.success) {
        throw new Error("Financial setup failed during league initialization.");
      }

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
            team_archetypes: teamArchetypes,
            user_archetype:  validUserArchetype,
          },
        })
        .eq('id', this.savedGameId);

      return {
        season,
        teamsCreated:      teams.length,
        playersCreated:    players.length,
        freeAgentsCreated: faCount.length,
        gamesCreated:      gamesCount,
        userArchetype:     validUserArchetype,
        financesInitialized: true,
      };
    } catch (err) {
      console.error(`❌ League init failed for ${this.savedGameId}, rolling back:`, err);
      await this.rollbackLeague().catch(rbErr =>
        console.error('Rollback also failed:', rbErr)
      );
      throw err;
    };
  };

  // ── Single-game simulation ────────────────────────────────────────────────

  /**
   * ✅ OPTIMIZED: Uses batch upserts instead of N+1 queries
   * Original: ~40 individual queries per game
   * Optimized: ~6 queries per game
   */
  async simulateGame(gameId) {
    const { data: game, error: gameError } = await supabaseAdmin
      .from('games').select('*').eq('id', gameId).single();

    if (gameError) throw new Error(`Game not found: ${gameError.message}`);
    if (game.status !== 'scheduled') throw new Error(`Game ${gameId} is already ${game.status}`);

    const { season_id: seasonId, home_team_id: homeTeamId, away_team_id: awayTeamId } = game;
    if (!seasonId || !homeTeamId || !awayTeamId) {
      throw new Error(`Game ${gameId} is missing required IDs (season, home, or away)`);
    }

    // ✅ Fetch both teams and rosters in parallel
    const [{ data: homeTeam }, { data: awayTeam }, [homePlayers, awayPlayers], [homeCoach, awayCoach]] = 
      await Promise.all([
        supabaseAdmin.from('teams').select('name').eq('id', homeTeamId).single(),
        supabaseAdmin.from('teams').select('name').eq('id', awayTeamId).single(),
        Promise.all([
          this.getRosterForTeam(homeTeamId),
          this.getRosterForTeam(awayTeamId),
        ]),
        Promise.all([
          this.getCoachForTeam(homeTeamId),
          this.getCoachForTeam(awayTeamId),
        ]),
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

    // ✅ OPTIMIZED: Run independent DB operations in parallel
    const [statsResult, progressionResult] = await Promise.all([
      supabaseAdmin.from('player_game_stats').upsert(allStats, { onConflict: 'game_id,player_id' }),
      playerProgressionService.progressPlayersFromBoxScores(this.savedGameId, allStats, {
        seasonId,
        gameId,
        progressionType: 'game',
      }),
    ]);
    if (statsResult.error) throw new Error(`Failed to insert player stats: ${statsResult.error.message}`);

    // ✅ OPTIMIZED: Run all stat updates in parallel using batch methods
    const simResultsForStats = [{
      game,
      result,
      allBoxScores: allStats,
    }];

    await Promise.all([
      supabaseAdmin.from('games').update({
        home_score: result.homeScore,
        away_score: result.awayScore,
        status:     'completed',
        played_at:  new Date().toISOString(),
      }).eq('id', gameId),
      this._upsertTeamStats(simResultsForStats, seasonId),
      this._upsertPlayerSeasonStats(allStats, seasonId),
    ]);

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

    const results = await this._bulkSimulateGames(weekGames, seasonId, 'week');

    const currentState = await this._getGameState();
    const managedClubId = currentState?.managed_club_id;

    // ✅ Build summary
    const summary = await this._buildSimSummary(weekGames, results, managedClubId, seasonId);

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

    return { 
      seasonComplete: false, 
      week: weekNumber, 
      results, 
      summary // ✅ NEW
    };
  }

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
      return { seasonComplete: true, gamesSimulated: 0, results: [], nextUserGame: null, summary: null };
    }

    const nextGameDateOnly = nextUserGame.game_date.slice(0, 10);
    const { data: gamesToSim, error: gamesError } = await supabaseAdmin
      .from('games')
      .select('*')
      .eq('season_id', seasonId)
      .eq('status', 'scheduled')
      .lt('game_date', `${nextGameDateOnly}T00:00:00.000Z`)
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
        summary: null,
      };
    }

    const results = await this._bulkSimulateGames(gamesToSim, seasonId, 'batch');

    // ✅ FIX: Build the summary just like simulateToDate does
    const summary = await this._buildSimSummary(gamesToSim, results, managedClubId, seasonId);

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
      summary, // ✅ ADDED: Now the frontend will receive it!
    };
  }

  // ── PRIVATE: core bulk-simulation logic ──────────────────────────────────

  /**
   * ✅ OPTIMIZED: Single query for all rosters, parallel DB writes
   */
  async _bulkSimulateGames(games, seasonId, progressionType = 'batch') {
    if (!games?.length) return [];

    // ✅ Clear caches for this batch
    this._rosterCache.clear();
    this._lineupCache.clear();

    const teamIds = [...new Set(games.flatMap(g => [g.home_team_id, g.away_team_id]))];
    
    // ✅ SINGLE query instead of N parallel queries
    const rosterMap = await this._getRostersForTeams(teamIds);
    const lineupMap = await this._getLineupsForTeams(teamIds);

    const simResults = games.map(game => {
      const result = GameSimulationEngine.simulateGame(
        rosterMap[game.home_team_id] || [],
        rosterMap[game.away_team_id] || [],
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
    
    // ✅ Parallel batch inserts for stats and game updates
    const gameUpdates = simResults.map(({ game, result }) => ({
      ...game,
      home_score: result.homeScore,
      away_score: result.awayScore,
      status:     'completed',
    }));

    const statsInsertPromises = [];
    for (let i = 0; i < allBoxScores.length; i += BATCH_SIZE_STATS) {
      statsInsertPromises.push(
        supabaseAdmin.from('player_game_stats').upsert(
          allBoxScores.slice(i, i + BATCH_SIZE_STATS),
          { onConflict: 'game_id,player_id' }
        )
      );
    }

    const gameUpdatePromises = [];
    for (let i = 0; i < gameUpdates.length; i += 200) {
      gameUpdatePromises.push(
        supabaseAdmin.from('games').upsert(gameUpdates.slice(i, i + 200), { onConflict: 'id' })
      );
    }

    // ✅ Run all independent operations in parallel
    const [statsResults, gameResults] = await Promise.all([
      Promise.all(statsInsertPromises),
      Promise.all(gameUpdatePromises),
    ]);

    for (const { error } of statsResults) {
      if (error) throw new Error(`Failed to insert player stats batch: ${error.message}`);
    }
    for (const { error } of gameResults) {
      if (error) throw new Error(`Failed to batch-update games: ${error.message}`);
    }

    // ✅ Run stat upserts in parallel
    await Promise.all([
      this._upsertTeamStats(simResults, seasonId),
      this._upsertPlayerSeasonStats(allBoxScores, seasonId),
    ]);

    const progression = await playerProgressionService.progressPlayersFromBoxScores(
      this.savedGameId,
      allBoxScores,
      { seasonId, progressionType }
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

    /**
   * Builds a rich summary of what happened during a simulation batch.
   * Runs 3-4 highly optimized parallel queries.
   */
  async _buildSimSummary(games, simResults, managedTeamId, seasonId) {
    const gameIds = simResults.map(r => r.gameId);
    if (!gameIds?.length) return null;

    // 1. Calculate user's micro-impact purely in-memory (0 DB calls)
    let simImpact = { games: 0, wins: 0, losses: 0, pointsFor: 0, pointsAllowed: 0 };
    for (const res of simResults) {
      const isHome = res.homeTeamId === managedTeamId;
      const isAway = res.awayTeamId === managedTeamId;
      if (!isHome && !isAway) continue;
      
      simImpact.games++;
      if (isHome) {
        simImpact.pointsFor += res.homeScore;
        simImpact.pointsAllowed += res.awayScore;
        if (res.homeScore > res.awayScore) simImpact.wins++; else simImpact.losses++;
      } else {
        simImpact.pointsFor += res.awayScore;
        simImpact.pointsAllowed += res.homeScore;
        if (res.awayScore > res.homeScore) simImpact.wins++; else simImpact.losses++;
      }
    }

    // 2. Run parallel DB queries for the rest of the data
    const [standingsRes, performersRes, userRosterRes] = await Promise.all([
      // Query A: Full league standings (30 rows is tiny, fetch all for easy sorting)
      supabaseAdmin
        .from('team_season_stats')
        .select('wins, losses, points_for, points_against, team:team_id(id, name, abbreviation)')
        .eq('season_id', seasonId)
        .order('wins', { ascending: false })
        .order('points_for', { ascending: false }),
        
      // Query B: Top 10 performers from these specific games
      supabaseAdmin
        .from('player_game_stats')
        .select('points, rebounds, assists, blocks, steals, player_id, team_id, player:player_id(first_name, last_name), team:team_id(abbreviation)')
        .in('game_id', gameIds)
        .order('points', { ascending: false })
        .limit(10),

      // Query C: Get user's roster player IDs to filter progression
      supabaseAdmin
        .from('players')
        .select('id')
        .eq('team_id', managedTeamId)
        .eq('saved_game_id', this.savedGameId)
    ]);

    const standings = standingsRes.data || [];
    const performers = performersRes.data || [];
    const userPlayerIds = (userRosterRes.data || []).map(p => p.id);

    // Extract overall season record for user's team
    const userSeasonRecord = standings.find(s => s.team?.id === managedTeamId);

    // Query D: Fetch progression ONLY for the user's players in these games
    let userProgression = [];
    if (userPlayerIds.length > 0) {
      const { data: progData } = await supabaseAdmin
        .from('player_progression')
        .select('player_id, overall_before, overall_after, player:player_id(first_name, last_name)')
        .in('game_id', gameIds)
        .in('player_id', userPlayerIds);
        
      userProgression = (progData || []).map(p => ({
        playerId: p.player_id,
        playerName: p.player ? `${p.player.first_name} ${p.player.last_name}` : 'Unknown',
        overallBefore: p.overall_before,
        overallAfter: p.overall_after,
        delta: p.overall_after - p.overall_before
      })).filter(p => p.delta !== 0); // Only show players who actually changed
    }

    // Determine date range covered by this sim
    const dates = games.map(g => g.game_date).sort();
    
    return {
      summary: {
        gamesSimulated: gameIds.length,
        datesCovered: {
          from: dates[0]?.slice(0, 10) || null,
          to: dates[dates.length - 1]?.slice(0, 10) || null
        }
      },
      userTeamImpact: {
        thisSim: {
          record: `${simImpact.wins}-${simImpact.losses}`,
          pointsFor: simImpact.pointsFor,
          pointsAllowed: simImpact.pointsAllowed
        },
        seasonTotal: userSeasonRecord ? {
          record: `${userSeasonRecord.wins}-${userSeasonRecord.losses}`,
          pointsFor: userSeasonRecord.points_for,
          pointsAgainst: userSeasonRecord.points_against
        } : null
      },
      standingsSnapshot: standings.slice(0, 5).map(s => ({
        teamId: s.team?.id,
        name: s.team?.name,
        abbreviation: s.team?.abbreviation,
        wins: s.wins,
        losses: s.losses
      })),
      topPerformers: performers.map(p => ({
        playerId: p.player_id,
        playerName: p.player ? `${p.player.first_name} ${p.player.last_name}` : 'Unknown',
        teamAbbreviation: p.team?.abbreviation || '???',
        points: p.points,
        rebounds: p.rebounds,
        assists: p.assists,
        blocks: p.blocks,
        steals: p.steals
      })),
      playerProgression: userProgression
    };
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

    // ✅ Parallel batch upserts
    const upsertPromises = [];
    for (let i = 0; i < upserts.length; i += BATCH_SIZE_STATS) {
      upsertPromises.push(
        supabaseAdmin
          .from('player_season_stats')
          .upsert(upserts.slice(i, i + BATCH_SIZE_STATS), { onConflict: 'player_id,season_id' })
      );
    }
    const results = await Promise.all(upsertPromises);
    for (const { error } of results) {
      if (error) throw new Error(`Failed to upsert player season stats: ${error.message}`);
    }
  }

  // ── ❌ REMOVED: _updateTeamStats and _updatePlayerSeasonStats ──────────────
  // These N+1 methods have been removed. Use _upsertTeamStats and 
  // _upsertPlayerSeasonStats for both single and bulk operations.

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

  async simulateToDate(targetDate, chunkSize = 500) {  // ✅ Increased from 200
    if (!targetDate) throw new Error('targetDate is required');

    const seasonId = await this.getCurrentSeasonId();
    const targetEnd = `${targetDate}T23:59:59.999Z`;

    // ✅ Fetch count and games in parallel
    const [{ data: games, error: gamesErr }, { count: totalInRange, error: countErr }] = await Promise.all([
      supabaseAdmin
        .from('games')
        .select('*')
        .eq('season_id', seasonId)
        .eq('status', 'scheduled')
        .lte('game_date', targetEnd)
        .order('game_date', { ascending: true })
        .limit(chunkSize),
      supabaseAdmin
        .from('games')
        .select('id', { count: 'exact', head: true })
        .eq('season_id', seasonId)
        .eq('status', 'scheduled')
        .lte('game_date', targetEnd),
    ]);

    if (gamesErr) throw new Error(`Failed to fetch games: ${gamesErr.message}`);
    if (countErr) throw new Error(`Failed to count remaining games: ${countErr.message}`);

    if (!games?.length) {
      return { gamesSimulated: 0, gamesRemaining: 0, complete: true, results: [] };
    }

    const results = await this._bulkSimulateGames(games, seasonId, 'batch');

    const maxSimDate = games[games.length - 1].game_date;
    const currentState = await this._getGameState();
    
    // Fetch managed club ID from state for the summary
    const managedClubId = currentState?.managed_club_id || (await this.getTeams()).find(t => t.id)?.id;

    // ✅ Build the rich summary payload (runs ~4 fast parallel queries)
    const summary = await this._buildSimSummary(games, results, managedClubId, seasonId);

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
      results,        // Keep basic results if needed elsewhere
      summary         // ✅ NEW: The rich overview object
    };
  }

  // ── Create free agent pool ────────────────────────────────────────────────────
 
  async createFreeAgents(season = 1, count = 75) {
    const players = generateFreeAgentPool(this.savedGameId, count);
 
    // ✅ Parallel batch inserts
    const insertPromises = [];
    for (let i = 0; i < players.length; i += FA_BATCH_SIZE) {
      insertPromises.push(
        supabaseAdmin.from('players').insert(players.slice(i, i + FA_BATCH_SIZE)).select()
      );
    }
    const results = await Promise.all(insertPromises);
    
    const inserted = [];
    for (const { data, error } of results) {
      if (error) throw new Error(`Failed to create free agents: ${error.message}`);
      if (data) inserted.push(...data);
    }
 
    console.log(`✅ Created ${inserted.length} free agents`);
    return inserted;
  }
 
  async getFreeAgents({ position, minOverall, limit = 100, offset = 0 } = {}) {
    let query = supabaseAdmin
      .from('players')
      .select('*')
      .eq('saved_game_id', this.savedGameId)
      .is('team_id', null)
      .order('overall_rating', { ascending: false })
      .range(offset, offset + limit - 1);
 
    if (position) query = query.eq('position', position);
    if (minOverall != null) query = query.gte('overall_rating', minOverall);
 
    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch free agents: ${error.message}`);
    return data || [];
  }

  async releasePlayer(playerId) {
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
 
  async signFreeAgent(playerId, teamId) {
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
 
    const { data: team, error: teamError } = await supabaseAdmin
      .from('teams')
      .select('id, name')
      .eq('id', teamId)
      .eq('saved_game_id', this.savedGameId)
      .single();
 
    if (teamError || !team) {
      throw new Error('Team not found in this saved game');
    }
 
    const { count, error: countError } = await supabaseAdmin
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('saved_game_id', this.savedGameId);
 
    if (countError) throw new Error(`Failed to check roster size: ${countError.message}`);
 
    if ((count ?? 0) >= MAX_ROSTER_SIZE) {
      throw new Error(
        `Roster full — ${team.name} already has ${count} players (max ${MAX_ROSTER_SIZE}). Release a player first.`
      );
    }
 
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

  async proposeTrade(savedGameId, proposingTeamId, receivingTeamId, playerIdsFromProposer, playerIdsFromReceiver) {
    const { data: teams, error: teamsError } = await supabaseAdmin
      .from('teams')
      .select('id')
      .in('id', [proposingTeamId, receivingTeamId])
      .eq('saved_game_id', savedGameId);
    if (teamsError) throw new Error(`Failed to validate teams: ${teamsError.message}`);
    if (!teams || teams.length !== 2) {
      throw new Error('One or both teams do not belong to this saved game.');
    }

    const allPlayerIds = [...playerIdsFromProposer, ...playerIdsFromReceiver];
    if (allPlayerIds.length === 0) {
      throw new Error('Must include at least one player from each team.');
    }

    const { data: players, error: playersError } = await supabaseAdmin
      .from('players')
      .select('id, team_id, overall_rating, potential_rating, age')
      .in('id', allPlayerIds)
      .eq('saved_game_id', savedGameId);
    if (playersError) throw new Error(`Failed to validate players: ${playersError.message}`);


    const playerMap = {};
    players.forEach(p => { playerMap[p.id] = p; });

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
    const { data: pendingTradePlayers, error: pendingError } = await supabaseAdmin
      .from('trade_players')
      .select('player_id, trade:trade_id ( id, status, saved_game_id )')
      .in('player_id', allPlayerIds);
    if (pendingError) throw new Error(`Failed to check pending trades: ${pendingError.message}`);
    const hasPendingConflict = (pendingTradePlayers || []).some(
      tp => tp.trade && tp.trade.saved_game_id === savedGameId && tp.trade.status === 'pending'
    );
    if (hasPendingConflict) {
      throw new Error('One or more players are already involved in a pending trade.');
    }

    // 4. Evaluate trade using AI logic
    const proposingPlayersData = playerIdsFromProposer.map(id => playerMap[id]);
    const receivingPlayersData = playerIdsFromReceiver.map(id => playerMap[id]);
    const evaluation = evaluateTrade(proposingPlayersData, receivingPlayersData);

    // 5. Insert trade record
    const { data: trade, error: tradeInsertError } = await supabaseAdmin
      .from('trades')
      .insert({
        saved_game_id:      savedGameId,
        proposing_team_id:  proposingTeamId,
        receiving_team_id:  receivingTeamId,
        status:             'pending',
      })
      .select()
      .single();
    if (tradeInsertError) throw new Error(`Failed to create trade: ${tradeInsertError.message}`);

    // 6. Insert trade players
    const tradePlayerRows = [
      ...playerIdsFromProposer.map(pid => ({
        trade_id:     trade.id,
        player_id:    pid,
        from_team_id: proposingTeamId,
        to_team_id:   receivingTeamId,
      })),
      ...playerIdsFromReceiver.map(pid => ({
        trade_id:     trade.id,
        player_id:    pid,
        from_team_id: receivingTeamId,
        to_team_id:   proposingTeamId,
      })),
    ];

    const { error: tradePlayersError } = await supabaseAdmin
      .from('trade_players')
      .insert(tradePlayerRows);
    if (tradePlayersError) throw new Error(`Failed to insert trade players: ${tradePlayersError.message}`);

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
    const { data: trade, error: tradeError } = await supabaseAdmin
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .eq('saved_game_id', savedGameId)
      .eq('status', 'pending')
      .single();
    if (tradeError || !trade) {
      throw new Error('Trade not found or not pending.');
    }

    // If requireAuthority, verify caller is the receiving team (enforced at controller level).

    // Get all trade players
    const { data: tradePlayers, error: tpError } = await supabaseAdmin
      .from('trade_players')
      .select('*')
      .eq('trade_id', tradeId);
    if (tpError) throw new Error(`Failed to load trade players: ${tpError.message}`);

    // Perform the swap: update player team_id
    for (const tp of (tradePlayers || [])) {
      const { error: updateError } = await supabaseAdmin
        .from('players')
        .update({ team_id: tp.to_team_id, updated_at: new Date().toISOString() })
        .eq('id', tp.player_id);
      if (updateError) throw new Error(`Failed to move player ${tp.player_id}: ${updateError.message}`);
    }

    // Mark trade as completed
    const { error: completeError } = await supabaseAdmin
      .from('trades')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', tradeId);
    if (completeError) throw new Error(`Failed to mark trade completed: ${completeError.message}`);

    return { ...trade, status: 'completed' };
  }

  /**
   * Reject a pending trade.
   */
  async rejectTrade(tradeId, savedGameId) {
    const { data, error } = await supabaseAdmin
      .from('trades')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', tradeId)
      .eq('saved_game_id', savedGameId)
      .eq('status', 'pending')
      .select()
      .single();
    if (error || !data) throw new Error('Trade not found or not pending.');
    return data;
  }

  /**
   * Cancel a trade (proposing team or system).
   */
  async cancelTrade(tradeId, savedGameId) {
    const { data, error } = await supabaseAdmin
      .from('trades')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', tradeId)
      .eq('saved_game_id', savedGameId)
      .eq('status', 'pending')
      .select()
      .single();
    if (error || !data) throw new Error('Trade not found or not pending.');
    return data;
  }

  /**
   * Get all trades for a saved game (optionally filtered by team).
   */
  async getTrades(savedGameId, teamId = null) {
    let query = supabaseAdmin
      .from('trades')
      .select(`
        *,
        players:trade_players ( player_id, from_team_id, to_team_id )
      `)
      .eq('saved_game_id', savedGameId)
      .order('created_at', { ascending: false });

    if (teamId) {
      query = query.or(`proposing_team_id.eq.${teamId},receiving_team_id.eq.${teamId}`);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to load trades: ${error.message}`);
    return data || [];
  }

  /**
   * Get a single trade by ID with its players.
   */
  async getTradeById(tradeId, savedGameId) {
    const { data, error } = await supabaseAdmin
      .from('trades')
      .select(`
        *,
        players:trade_players ( player_id, from_team_id, to_team_id )
      `)
      .eq('id', tradeId)
      .eq('saved_game_id', savedGameId)
      .single();
    if (error || !data) throw new Error('Trade not found.');
    return data;
  }

  async _getLineupsForTeams(teamIds) {
    const lineupService = new LineupService(this.savedGameId);
    const entries = await Promise.all(
      teamIds.map(async id => [id, await lineupService.getLineupForSimulation(id)])
    );
    return Object.fromEntries(entries);
  }

  async createCoaches(teams) {
    const coachGen = new CoachGenerator(this.savedGameId);
    const coaches = coachGen.generateLeagueCoaches(teams, this._lastTeamTiers || {});

    const { data, error } = await supabaseAdmin.from('coaches').insert(coaches).select();
    if (error) throw new Error(`Failed to create coaches: ${error.message}`);

    await FinanceService.initializeCoachContracts(this.savedGameId, data);
    return data;
  }

  // getRosterForTeam pattern, mirrored for coaches:
  async getCoachForTeam(teamId) {
    const { data, error } = await supabaseAdmin
      .from('coaches')
      .select('*')
      .eq('saved_game_id', this.savedGameId)
      .eq('team_id', teamId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load coach: ${error.message}`);
    return data;
  }
};


module.exports = leagueService;