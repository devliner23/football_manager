const { supabaseAdmin } = require('../config/supabase');
const NBA_TEAMS = require('../data/teams.json');
const GameSimulationEngine = require('./utils/gameSimulationEngine');
const PlayerGenerator = require('./utils/playerGenerator');
const TeamArchetypeService = require('./utils/teamArchetypeService');
const LineupService = require("./lineupService");
const playerProgressionService = require("./utils/playerProgression");
const FinanceService = require("./financeService");
const CoachGenerator = require("./utils/coachGenerator");
const { generateFreeAgentPool } = require("./utils/freeAgentGenerator");

// ── Constants ──────────────────────────────────────────────────────────────────
const ROSTER_SIZE = 15;
const BATCH_SIZE_LARGE = 1000;
const BATCH_SIZE_MEDIUM = 500;
const FA_BATCH_SIZE = 150;
const MAX_ROSTER_SIZE = 15;
const DAYS_IN_SEASON = 180;
const MAX_GAMES_PER_DAY = 10;

// ── Optimized Box-score mapper ─────────────────────────────────────────────────
function mapBoxScore(b, teamId, gameId, savedGameId) {
  const or = b.offensive_rebounds || 0;
  const dr = b.defensive_rebounds || 0;
  return {
    game_id: gameId,
    team_id: teamId,
    saved_game_id: savedGameId,
    player_id: b.player_id,
    minutes_played: b.minutes_played || 0,
    points: b.points || 0,
    fgm: b.fgm || 0,
    fga: b.fga || 0,
    fgm_3: b.fgm_3 || 0,
    fga_3: b.fga_3 || 0,
    ftm: b.ftm || 0,
    fta: b.fta || 0,
    offensive_rebounds: or,
    defensive_rebounds: dr,
    rebounds: or + dr,
    assists: b.assists || 0,
    steals: b.steals || 0,
    blocks: b.blocks || 0,
    turnovers: b.turnovers || 0,
    personal_fouls: b.personal_fouls || 0,
    plus_minus: b.plus_minus || 0,
  };
}

// ── Trade evaluation ───────────────────────────────────────────────────────────
function evaluateTrade(giving, receiving) {
  let giveSum = 0, recvSum = 0;
  for (let i = 0; i < giving.length; i++) {
    giveSum += giving[i].overall_rating + (giving[i].potential_rating || 0) * 0.3;
  }
  for (let i = 0; i < receiving.length; i++) {
    recvSum += receiving[i].overall_rating + (receiving[i].potential_rating || 0) * 0.3;
  }
  const diff = recvSum - giveSum;
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
    this._rosterCache = new Map();
    this._lineupCache = new Map();
    this._teamCache = null;
    this._coachCache = new Map();
    this._gameStateCache = null;
    this._seasonIdCache = null;
    this._currentGameDateCache = null;
  }

  clearCaches() {
    this._rosterCache.clear();
    this._lineupCache.clear();
    this._teamCache = null;
    this._coachCache.clear();
    this._gameStateCache = null;
    this._seasonIdCache = null;
    this._currentGameDateCache = null;
  }

  // ── Rollback ────────────────────────────────────────────────────────────────
  async rollbackLeague() {
    const tables = [
      'player_progression', 'player_game_stats', 'player_season_stats',
      'team_season_stats', 'contracts', 'coach_contracts', 'coaches',
      'games', 'players', 'seasons', 'teams', 'saved_games' // <--- ADDED THIS
    ];
    await Promise.all(
      tables.map(t => supabaseAdmin.from(t).delete().eq('saved_game_id', this.savedGameId))
    );
    this.clearCaches();
  }

  // ── Cached Data Accessors ───────────────────────────────────────────────────
  async _getGameState() {
    // Only use the cache if it actually contains the managed_club_id
    if (this._gameStateCache?.managed_club_id) {
      return this._gameStateCache;
    }

    const { data, error } = await supabaseAdmin
      .from('saved_games')
      .select('game_state, managed_club_id, current_season, current_game_date')
      .eq('id', this.savedGameId)
      .single();
      
    if (error || !data) {
      // DO NOT CACHE HERE! Just return empty for this request.
      // Next time this is called, it will ping the DB again.
      return {};
    }
    
    // Only cache if we actually got good data
    this._gameStateCache = { ...(data.game_state || {}) };
    if (data.managed_club_id) {
      this._gameStateCache.managed_club_id = data.managed_club_id;
    }
    if (data.current_game_date) {
      this._currentGameDateCache = data.current_game_date;
    }
    
    return this._gameStateCache;
  }

  async getCurrentGameDate() {
    if (this._currentGameDateCache) return this._currentGameDateCache;
    const { data, error } = await supabaseAdmin
      .from('saved_games')
      .select('current_game_date')
      .eq('id', this.savedGameId)
      .single();
    if (error || !data) return null;
    this._currentGameDateCache = data.current_game_date;
    return data.current_game_date;
  }

  async getCurrentSeasonId() {
    if (this._seasonIdCache) return this._seasonIdCache;
    const state = await this._getGameState();
    if (state?.season_id) {
      this._seasonIdCache = state.season_id;
      return state.season_id;
    }
    const { data, error } = await supabaseAdmin
      .from('seasons')
      .select('id')
      .eq('saved_game_id', this.savedGameId)
      .order('season_number', { ascending: false })
      .limit(1);
    if (error || !data?.length) throw new Error('No season found');
    this._seasonIdCache = data[0].id;
    return data[0].id;
  }

  async getTeams() {
    if (this._teamCache) return this._teamCache;
    const { data, error } = await supabaseAdmin
      .from('teams')
      .select('*')
      .eq('saved_game_id', this.savedGameId);
    if (error) throw new Error(`Failed to load teams: ${error.message}`);
    this._teamCache = data;
    return data;
  }

  _parsePlayerTraits(player) {
    let traits = player.traits;
    if (typeof traits === 'string') {
      try { traits = JSON.parse(traits); } catch { traits = {}; }
    }
    return { ...player, ...traits };
  }

  async getRosterForTeam(teamId, useCache = true) {
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
    const parsed = data.map(p => this._parsePlayerTraits(p));
    if (useCache) this._rosterCache.set(teamId, parsed);
    return parsed;
  }

  async _getRostersForTeams(teamIds) {
    const cached = {};
    const uncachedIds = [];
    for (const id of teamIds) {
      if (this._rosterCache.has(id)) {
        cached[id] = this._rosterCache.get(id);
      } else {
        uncachedIds.push(id);
      }
    }
    if (uncachedIds.length === 0) return cached;

    const { data, error } = await supabaseAdmin
      .from('players')
      .select('*')
      .eq('saved_game_id', this.savedGameId)
      .in('team_id', uncachedIds)
      .order('overall_rating', { ascending: false });
    if (error) throw new Error(`Failed to load rosters: ${error.message}`);

    const fetched = {};
    for (const player of data) {
      const parsed = this._parsePlayerTraits(player);
      (fetched[player.team_id] ??= []).push(parsed);
    }
    for (const [id, roster] of Object.entries(fetched)) {
      this._rosterCache.set(id, roster);
    }
    return { ...cached, ...fetched };
  }

  async getCoachForTeam(teamId) {
    if (this._coachCache.has(teamId)) return this._coachCache.get(teamId);
    const { data, error } = await supabaseAdmin
      .from('coaches')
      .select('*')
      .eq('saved_game_id', this.savedGameId)
      .eq('team_id', teamId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load coach: ${error.message}`);
    this._coachCache.set(teamId, data);
    return data;
  }

  async _getLineupsForTeams(teamIds) {
    const cached = {};
    const uncachedIds = [];
    for (const id of teamIds) {
      if (this._lineupCache.has(id)) {
        cached[id] = this._lineupCache.get(id);
      } else {
        uncachedIds.push(id);
      }
    }
    if (uncachedIds.length === 0) return { ...this._lineupCache, ...cached };

    const lineupService = new LineupService(this.savedGameId);
    const results = await Promise.all(
      uncachedIds.map(async id => {
        const lineup = await lineupService.getLineupForSimulation(id);
        this._lineupCache.set(id, lineup);
        return [id, lineup];
      })
    );
    return { ...cached, ...Object.fromEntries(results) };
  }

  // ── League Creation ─────────────────────────────────────────────────────────
  async createTeams() {
    const rows = NBA_TEAMS.map(t => ({
      saved_game_id: this.savedGameId,
      name: t.name,
      city: t.city,
      abbreviation: t.abbreviation,
      conference: t.conference,
      division: t.division,
    }));
    const { error } = await supabaseAdmin.from('teams').insert(rows);
    if (error) throw new Error(`Failed to create teams: ${error.message}`);
    const { data } = await supabaseAdmin
      .from('teams')
      .select('*')
      .eq('saved_game_id', this.savedGameId);
    this._teamCache = data;
    return data;
  }

  async createRosters(teams, season = 1, teamArchetypes = {}) {
    // teamArchetypes now feeds directly into generation — position
    // distribution and talent curve are shaped per-team inside
    // PlayerGenerator.generateLeague(), not just applied after the fact.
    const generator = new PlayerGenerator(this.savedGameId, season);
    const { players: basePlayers, teamTiers } = generator.generateLeague(teams, teamArchetypes);
    this._lastTeamTiers = teamTiers;

    const players = basePlayers.map(p => {
      const archetypeId = teamArchetypes[p.team_id];
      return archetypeId ? TeamArchetypeService.applyToPlayer(p, archetypeId) : p;
    });

    const batches = [];
    for (let i = 0; i < players.length; i += BATCH_SIZE_LARGE) {
      batches.push(players.slice(i, i + BATCH_SIZE_LARGE));
    }
    const results = await Promise.all(
      batches.map(b => supabaseAdmin.from('players').insert(b).select())
    );

    const allInserted = [];
    for (const { data, error } of results) {
      if (error) throw new Error(`Failed to create players: ${error.message}`);
      if (data) allInserted.push(...data);
    }
    return allInserted;
  }

  async createSeason(seasonNumber) {
    const { data, error } = await supabaseAdmin
      .from('seasons')
      .insert({
        saved_game_id: this.savedGameId,
        season_number: seasonNumber,
        status: 'regular_season',
        start_date: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to create season: ${error.message}`);
    return data;
  }

  async createSeasonStats(teams, seasonId) {
    const rows = teams.map(t => ({
      saved_game_id: this.savedGameId,
      team_id: t.id,
      season_id: seasonId,
      wins: 0,
      losses: 0,
      points_for: 0,
      points_against: 0,
    }));
    const { error } = await supabaseAdmin.from('team_season_stats').insert(rows);
    if (error) throw new Error(`Failed to create season stats: ${error.message}`);
    return rows;
  }

  async generateSchedule(teams, seasonId) {
    if (!Array.isArray(teams) || teams.length < 2) {
      throw new Error('At least two teams are required.');
    }
    const teamIds = teams.map(t => t.id);
    const n = teamIds.length;
    if (n % 2 !== 0) throw new Error('Number of teams must be even.');

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
          roundGames.push({
            season_id: seasonId,
            home_team_id: homeFirst ? teamIds[idxA] : teamIds[idxB],
            away_team_id: homeFirst ? teamIds[idxB] : teamIds[idxA],
            status: 'scheduled',
            saved_game_id: this.savedGameId,
          });
        }
        rounds.push(roundGames);
        indices.splice(1, 0, indices.pop());
      }
      return rounds;
    };

    const baseRounds = [...generateRoundRobin(true), ...generateRoundRobin(false)];

    const daySlots = Array.from({ length: DAYS_IN_SEASON }, () => ({
      teams: new Set(),
      games: [],
    }));

    let slotIdx = 0;
    for (const round of baseRounds) {
      for (let i = 0; i < round.length; i += MAX_GAMES_PER_DAY) {
        const chunk = round.slice(i, i + MAX_GAMES_PER_DAY);
        for (const game of chunk) {
          daySlots[slotIdx].teams.add(game.home_team_id);
          daySlots[slotIdx].teams.add(game.away_team_id);
          daySlots[slotIdx].games.push(game);
        }
        slotIdx++;
      }
    }

    const extraGames = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dist = j - i;
        if (dist <= 12 || dist >= 18) {
          extraGames.push({
            season_id: seasonId,
            home_team_id: dist <= 12 ? teamIds[i] : teamIds[j],
            away_team_id: dist <= 12 ? teamIds[j] : teamIds[i],
            status: 'scheduled',
            saved_game_id: this.savedGameId,
          });
        }
      }
    }
    extraGames.sort((a, b) => a.home_team_id - b.home_team_id || a.away_team_id - b.away_team_id);

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
      if (!placed) throw new Error(`Could not place extra game: ${game.home_team_id} vs ${game.away_team_id}`);
    }

    const allGames = [];
    for (let d = 0; d < DAYS_IN_SEASON; d++) {
      const slot = daySlots[d];
      if (!slot.games.length) continue;
      const gameDate = new Date(startDate);
      gameDate.setDate(gameDate.getDate() + d);
      const y = gameDate.getFullYear();
      const m = String(gameDate.getMonth() + 1).padStart(2, '0');
      const day = String(gameDate.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${day}`;
      const week = Math.floor(d / 7) + 1;
      for (const game of slot.games) {
        game.game_date = dateStr;
        game.week = week;
        allGames.push(game);
      }
    }

    const batches = [];
    for (let i = 0; i < allGames.length; i += BATCH_SIZE_LARGE) {
      batches.push(allGames.slice(i, i + BATCH_SIZE_LARGE));
    }
    const results = await Promise.all(batches.map(b => supabaseAdmin.from('games').insert(b)));
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
    if (count > 0) throw new Error(`League already initialized for ${this.savedGameId}`);

    try {
      const validUserArchetype =
        userArchetype && TeamArchetypeService.isValidArchetype(userArchetype)
          ? userArchetype
          : TeamArchetypeService.getRandomArchetype();

      const [teams, seasonRecord] = await Promise.all([
        this.createTeams(),
        this.createSeason(season),
      ]);

      const managedTeamId = managedClubName
        ? (teams.find(t => t.name.toLowerCase() === managedClubName.toLowerCase())?.id || teams[0]?.id)
        : teams[0]?.id;

      const teamArchetypes = Object.fromEntries(
        teams.map(t => [t.id, t.id === managedTeamId ? validUserArchetype : TeamArchetypeService.getRandomArchetype()])
      );

      const [players, coaches, _stats, gamesCount, faResult] = await Promise.all([
        this.createRosters(teams, season, teamArchetypes),
        this.createCoaches(teams),
        this.createSeasonStats(teams, seasonRecord.id),
        this.generateSchedule(teams, seasonRecord.id),
        this.createFreeAgents(season),
      ]);

      const financeResult = await FinanceService.initializeLeagueFinances(this.savedGameId, teams, players);
      if (!financeResult.success) throw new Error("Financial setup failed");

      this._seasonIdCache = seasonRecord.id;
      this._gameStateCache = {
        managed_club_id: managedTeamId,
        season_id: seasonRecord.id,
        initialized_at: new Date().toISOString(),
        total_games: gamesCount,
        team_archetypes: teamArchetypes,
        user_archetype: validUserArchetype,
      };

      const initialDate = new Date();
      initialDate.setHours(0, 0, 0, 0);
      const currentDateStr = `${initialDate.getFullYear()}-${String(initialDate.getMonth() + 1).padStart(2, '0')}-${String(initialDate.getDate()).padStart(2, '0')}`;
      this._currentGameDateCache = currentDateStr;

      await supabaseAdmin
        .from('saved_games')
        .update({
          current_season: season,
          current_game_date: currentDateStr,
          managed_club_id: managedTeamId,
          archetype_choice: validUserArchetype,
          game_state: this._gameStateCache,
        })
        .eq('id', this.savedGameId);

      return {
        season,
        teamsCreated: teams.length,
        playersCreated: players.length,
        freeAgentsCreated: faResult.length,
        gamesCreated: gamesCount,
        userArchetype: validUserArchetype,
        financesInitialized: true,
      };
    } catch (err) {
      console.error(`❌ League init failed, rolling back:`, err);
      await this.rollbackLeague().catch(e => console.error('Rollback failed:', e));
      throw err;
    }
  }

  // ── Single Game Simulation ──────────────────────────────────────────────────
  async simulateGame(gameId) {
    const { data: game, error: gameError } = await supabaseAdmin
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single();
    if (gameError) throw new Error(`Game not found: ${gameError.message}`);
    if (game.status !== 'scheduled') throw new Error(`Game ${gameId} is already ${game.status}`);

    const { season_id: seasonId, home_team_id: homeTeamId, away_team_id: awayTeamId } = game;

    const [homePlayers, awayPlayers, lineups] = await Promise.all([
      this.getRosterForTeam(homeTeamId),
      this.getRosterForTeam(awayTeamId),
      this._getLineupsForTeams([homeTeamId, awayTeamId]),
    ]);

    const result = GameSimulationEngine.simulateGame(homePlayers, awayPlayers, {
      homeCourtAdvantage: 1.03,
      homeLineup: lineups[homeTeamId],
      awayLineup: lineups[awayTeamId],
    });

    const allStats = [
      ...result.homeBoxScores.map(b => mapBoxScore(b, homeTeamId, gameId, this.savedGameId)),
      ...result.awayBoxScores.map(b => mapBoxScore(b, awayTeamId, gameId, this.savedGameId)),
    ];

    await Promise.all([
      supabaseAdmin.from('player_game_stats').upsert(allStats, { onConflict: 'game_id,player_id' }),
      supabaseAdmin.from('games').update({
        home_score: result.homeScore,
        away_score: result.awayScore,
        status: 'completed',
        played_at: new Date().toISOString(),
      }).eq('id', gameId),
      this._upsertTeamStats([{ game, result }], seasonId),
      this._upsertPlayerSeasonStats(allStats, seasonId),
      playerProgressionService.progressPlayersFromBoxScores(this.savedGameId, allStats, {
        seasonId, gameId, progressionType: 'game',
      }),
    ]);

    this._currentGameDateCache = game.game_date;
    await supabaseAdmin
      .from('saved_games')
      .update({ current_game_date: game.game_date })
      .eq('id', this.savedGameId);

    return {
      gameId,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      overtime: result.overtime,
      overtimeCount: result.overtimeCount,
      current_game_date: game.game_date,
    };
  }

  // ── Week Simulation ─────────────────────────────────────────────────────────
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
    const state = await this._getGameState();
    const summary = await this._buildSimSummary(weekGames, results, state?.managed_club_id, seasonId);

    const maxSimDate = weekGames.map(g => g.game_date).sort().pop();
    this._currentGameDateCache = maxSimDate;
    this._gameStateCache = { ...state, last_simulated_week: weekNumber, last_simulated_at: new Date().toISOString() };
    await supabaseAdmin
      .from('saved_games')
      .update({ current_game_date: maxSimDate, game_state: this._gameStateCache })
      .eq('id', this.savedGameId);

    return { seasonComplete: false, week: weekNumber, results, summary, current_game_date: maxSimDate };
  }

  async getNextUserGame() {
    const state = await this._getGameState();
    const managedClubId = state?.managed_club_id;
    if (!managedClubId) throw new Error('No managed team set');

    const seasonId = state?.season_id || await this.getCurrentSeasonId();

    const { data: nextGame, error } = await supabaseAdmin
      .from('games')
      .select(`
        id, game_date, week, status, home_team_id, away_team_id,
        home_team:home_team_id(id, name, abbreviation, city),
        away_team:away_team_id(id, name, abbreviation, city)
      `)
      .eq('season_id', seasonId)
      .eq('status', 'scheduled')
      .or(`home_team_id.eq.${managedClubId},away_team_id.eq.${managedClubId}`)
      .order('game_date', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Failed to find next user game: ${error.message}`);
    if (!nextGame) return { seasonComplete: true, nextUserGame: null, leagueGamesBeforeCount: 0 };

    const { count, error: countError } = await supabaseAdmin
      .from('games')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', seasonId)
      .eq('status', 'scheduled')
      .lt('game_date', nextGame.game_date);
    if (countError) throw new Error(`Failed to count prior games: ${countError.message}`);

    return {
      seasonComplete: false,
      leagueGamesBeforeCount: count ?? 0,
      nextUserGame: { ...nextGame, isHome: nextGame.home_team_id === managedClubId },
    };
  }

  async simulateToNextUserGame() {
    const state = await this._getGameState();
    const managedClubId = state?.managed_club_id;
    if (!managedClubId) throw new Error('No managed team set');

    const seasonId = state?.season_id || await this.getCurrentSeasonId();

    const { data: nextUserGame, error: nextError } = await supabaseAdmin
      .from('games')
      .select(`
        id, game_date, week, status, home_team_id, away_team_id,
        home_team:home_team_id(id, name, abbreviation, city),
        away_team:away_team_id(id, name, abbreviation, city)
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

    const { data: gamesToSim, error: gamesError } = await supabaseAdmin
      .from('games')
      .select('*')
      .eq('season_id', seasonId)
      .eq('status', 'scheduled')
      .lt('game_date', `${nextUserGame.game_date.slice(0, 10)}T00:00:00.000Z`)
      .order('game_date', { ascending: true });
    if (gamesError) throw new Error(`Failed to fetch games: ${gamesError.message}`);

    const results = await this._bulkSimulateGames(gamesToSim, seasonId, 'batch');
    const summary = await this._buildSimSummary(gamesToSim, results, managedClubId, seasonId);

    const maxSimDate = gamesToSim.length > 0
      ? gamesToSim.map(g => g.game_date).sort().pop()
      : nextUserGame.game_date;
    this._currentGameDateCache = maxSimDate;
    this._gameStateCache = { ...state, last_simulated_at: new Date().toISOString(), last_sim_to_date: nextUserGame.game_date };
    await supabaseAdmin
      .from('saved_games')
      .update({ current_game_date: maxSimDate, game_state: this._gameStateCache })
      .eq('id', this.savedGameId);

    return {
      seasonComplete: false,
      gamesSimulated: gamesToSim.length,
      results,
      nextUserGame: { ...nextUserGame, isHome: nextUserGame.home_team_id === managedClubId },
      summary,
      current_game_date: maxSimDate,
    };
  }

  async simulateToDate(targetDate, chunkSize = 500) {
    if (!targetDate) throw new Error('targetDate is required');
    const seasonId = await this.getCurrentSeasonId();

    const [{ data: games, error: gamesErr }, { count, error: countErr }] = await Promise.all([
      supabaseAdmin
        .from('games')
        .select('*')
        .eq('season_id', seasonId)
        .eq('status', 'scheduled')
        .lte('game_date', `${targetDate}T23:59:59.999Z`)
        .order('game_date', { ascending: true })
        .limit(chunkSize),
      supabaseAdmin
        .from('games')
        .select('id', { count: 'exact', head: true })
        .eq('season_id', seasonId)
        .eq('status', 'scheduled')
        .lte('game_date', `${targetDate}T23:59:59.999Z`),
    ]);
    if (gamesErr) throw new Error(`Failed to fetch games: ${gamesErr.message}`);
    if (countErr) throw new Error(`Failed to count games: ${countErr.message}`);
    if (!games?.length) return { gamesSimulated: 0, gamesRemaining: 0, complete: true, results: [], summary: null };

    const results = await this._bulkSimulateGames(games, seasonId, 'batch');
    const maxSimDate = games[games.length - 1].game_date;
    const state = await this._getGameState();
    const summary = await this._buildSimSummary(games, results, state?.managed_club_id, seasonId);

    this._gameStateCache = { ...state, last_simulated_to: maxSimDate, last_simulated_at: new Date().toISOString() };
    this._currentGameDateCache = maxSimDate;
    await supabaseAdmin
      .from('saved_games')
      .update({ current_game_date: maxSimDate, game_state: this._gameStateCache })
      .eq('id', this.savedGameId);

    return {
      gamesSimulated: games.length,
      gamesRemaining: Math.max(0, (count || 0) - games.length),
      complete: (count || 0) <= games.length,
      results,
      summary,
    };
  }

  // ── Core Bulk Simulation (HOT PATH - HEAVILY OPTIMIZED) ─────────────────────
  async _bulkSimulateGames(games, seasonId, progressionType = 'batch') {
    if (!games?.length) return [];

    const teamIds = [...new Set(games.flatMap(g => [g.home_team_id, g.away_team_id]))];

    const [rosterMap, lineupMap] = await Promise.all([
      this._getRostersForTeams(teamIds),
      this._getLineupsForTeams(teamIds),
    ]);

    const len = games.length;
    const simResults = new Array(len);
    const allBoxScores = [];

    for (let i = 0; i < len; i++) {
      const game = games[i];
      const result = GameSimulationEngine.simulateGame(
        rosterMap[game.home_team_id] || [],
        rosterMap[game.away_team_id] || [],
        {
          homeCourtAdvantage: 1.03,
          homeLineup: lineupMap[game.home_team_id],
          awayLineup: lineupMap[game.away_team_id],
        }
      );

      const homeStats = result.homeBoxScores.map(b => mapBoxScore(b, game.home_team_id, game.id, this.savedGameId));
      const awayStats = result.awayBoxScores.map(b => mapBoxScore(b, game.away_team_id, game.id, this.savedGameId));

      simResults[i] = { game, result, allBoxScores: homeStats.concat(awayStats) };
      allBoxScores.push(...homeStats, ...awayStats);
    }

    // --- Player game stats (upsert is safe here — onConflict handles duplicates) ---
    const statsBatches = [];
    for (let i = 0; i < allBoxScores.length; i += BATCH_SIZE_LARGE) {
      statsBatches.push(
        supabaseAdmin.from('player_game_stats').upsert(
          allBoxScores.slice(i, i + BATCH_SIZE_LARGE),
          { onConflict: 'game_id,player_id' }
        )
      );
    }

    // --- Game updates: individual .update() — never upserts, never risks a partial INSERT ---
    const gameUpdates = new Array(len);
    for (let i = 0; i < len; i++) {
      gameUpdates[i] = supabaseAdmin
        .from('games')
        .update({
          home_score: simResults[i].result.homeScore,
          away_score: simResults[i].result.awayScore,
          status: 'completed',
        })
        .eq('id', games[i].id);
    }

    const [statsResults, gameResults] = await Promise.all([
      Promise.all(statsBatches),
      Promise.all(gameUpdates),
    ]);

    for (const { error } of statsResults) {
      if (error) throw new Error(`Failed to insert player stats: ${error.message}`);
    }
    for (const { error } of gameResults) {
      if (error) throw new Error(`Failed to update games: ${error.message}`);
    }

    await Promise.all([
      this._upsertTeamStats(simResults, seasonId),
      this._upsertPlayerSeasonStats(allBoxScores, seasonId),
      playerProgressionService.progressPlayersFromBoxScores(this.savedGameId, allBoxScores, { seasonId, progressionType }),
    ]);

    const returnResults = new Array(len);
    for (let i = 0; i < len; i++) {
      returnResults[i] = {
        gameId: games[i].id,
        game_date: games[i].game_date,
        homeTeamId: games[i].home_team_id,
        awayTeamId: games[i].away_team_id,
        homeScore: simResults[i].result.homeScore,
        awayScore: simResults[i].result.awayScore,
        overtime: simResults[i].result.overtime,
      };
    }
    return returnResults;
  }

  // ── Simulation Summary ──────────────────────────────────────────────────────
  async _buildSimSummary(games, simResults, managedTeamId, seasonId) {
    const gameIds = simResults.map(r => r.gameId);
    if (!gameIds?.length) return null;

    let simImpact = { games: 0, wins: 0, losses: 0, pointsFor: 0, pointsAllowed: 0 };
    for (let i = 0; i < simResults.length; i++) {
      const res = simResults[i];
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

    const [standingsRes, performersRes, userRosterRes] = await Promise.all([
      supabaseAdmin
        .from('team_season_stats')
        .select('wins, losses, points_for, points_against, team:team_id(id, name, abbreviation)')
        .eq('season_id', seasonId)
        .order('wins', { ascending: false })
        .order('points_for', { ascending: false }),
      supabaseAdmin
        .from('player_game_stats')
        .select('points, rebounds, assists, blocks, steals, player_id, team_id, player:player_id(first_name, last_name), team:team_id(abbreviation)')
        .in('game_id', gameIds)
        .order('points', { ascending: false })
        .limit(10),
      supabaseAdmin
        .from('players')
        .select('id')
        .eq('team_id', managedTeamId)
        .eq('saved_game_id', this.savedGameId),
    ]);

    const standings = standingsRes.data || [];
    const performers = performersRes.data || [];
    const userPlayerIds = (userRosterRes.data || []).map(p => p.id);
    const userSeasonRecord = standings.find(s => s.team?.id === managedTeamId);

    let userProgression = [];
    if (userPlayerIds.length > 0) {
      const { data: progData } = await supabaseAdmin
        .from('player_progression')
        .select('player_id, overall_before, overall_after, player:player_id(first_name, last_name)')
        .in('game_id', gameIds)
        .in('player_id', userPlayerIds);
      userProgression = (progData || [])
        .map(p => ({
          playerId: p.player_id,
          playerName: p.player ? `${p.player.first_name} ${p.player.last_name}` : 'Unknown',
          overallBefore: p.overall_before,
          overallAfter: p.overall_after,
          delta: p.overall_after - p.overall_before,
        }))
        .filter(p => p.delta !== 0);
    }

    const dates = games.map(g => g.game_date).sort();
    return {
      summary: {
        gamesSimulated: gameIds.length,
        datesCovered: { from: dates[0]?.slice(0, 10) || null, to: dates[dates.length - 1]?.slice(0, 10) || null },
      },
      userTeamImpact: {
        thisSim: {
          record: `${simImpact.wins}-${simImpact.losses}`,
          pointsFor: simImpact.pointsFor,
          pointsAllowed: simImpact.pointsAllowed,
        },
        seasonTotal: userSeasonRecord ? {
          record: `${userSeasonRecord.wins}-${userSeasonRecord.losses}`,
          pointsFor: userSeasonRecord.points_for,
          pointsAgainst: userSeasonRecord.points_against,
        } : null,
      },
      standingsSnapshot: standings.slice(0, 5).map(s => ({
        teamId: s.team?.id,
        name: s.team?.name,
        abbreviation: s.team?.abbreviation,
        wins: s.wins,
        losses: s.losses,
      })),
      topPerformers: performers.map(p => ({
        playerId: p.player_id,
        playerName: p.player ? `${p.player.first_name} ${p.player.last_name}` : 'Unknown',
        teamAbbreviation: p.team?.abbreviation || '???',
        points: p.points,
        rebounds: p.rebounds,
        assists: p.assists,
        blocks: p.blocks,
        steals: p.steals,
      })),
      playerProgression: userProgression,
    };
  }

  // ── Team Stats Upsert ───────────────────────────────────────────────────────
  async _upsertTeamStats(simResults, seasonId) {
    const deltas = new Map();
    for (const { game, result } of simResults) {
      const update = (teamId, pf, pa, isHome) => {
        let d = deltas.get(teamId);
        if (!d) {
          d = { wins: 0, losses: 0, points_for: 0, points_against: 0, home_wins: 0, home_losses: 0, away_wins: 0, away_losses: 0 };
          deltas.set(teamId, d);
        }
        const win = pf > pa;
        d.wins += win ? 1 : 0;
        d.losses += win ? 0 : 1;
        d.points_for += pf;
        d.points_against += pa;
        if (isHome) { d.home_wins += win ? 1 : 0; d.home_losses += win ? 0 : 1; }
        else { d.away_wins += win ? 1 : 0; d.away_losses += win ? 0 : 1; }
      };
      update(game.home_team_id, result.homeScore, result.awayScore, true);
      update(game.away_team_id, result.awayScore, result.homeScore, false);
    }

    const { data: current } = await supabaseAdmin
      .from('team_season_stats')
      .select('*')
      .eq('season_id', seasonId)
      .in('team_id', [...deltas.keys()]);

    const byId = new Map((current || []).map(s => [s.team_id, s]));

    const upserts = [...deltas.entries()].map(([teamId, d]) => {
      const ex = byId.get(teamId) || {};
      return {
        team_id: teamId,
        season_id: seasonId,
        saved_game_id: this.savedGameId,
        wins: (ex.wins || 0) + d.wins,
        losses: (ex.losses || 0) + d.losses,
        points_for: (ex.points_for || 0) + d.points_for,
        points_against: (ex.points_against || 0) + d.points_against,
        home_wins: (ex.home_wins || 0) + d.home_wins,
        home_losses: (ex.home_losses || 0) + d.home_losses,
        away_wins: (ex.away_wins || 0) + d.away_wins,
        away_losses: (ex.away_losses || 0) + d.away_losses,
      };
    });

    const { error } = await supabaseAdmin.from('team_season_stats').upsert(upserts, { onConflict: 'team_id,season_id' });
    if (error) throw new Error(`Failed to upsert team stats: ${error.message}`);
  }

  // ── Player Season Stats Upsert ──────────────────────────────────────────────
  async _upsertPlayerSeasonStats(boxScores, seasonId) {
    const deltas = new Map();
    for (const box of boxScores) {
      let d = deltas.get(box.player_id);
      if (!d) {
        d = {
          team_id: 0, games_played: 0, total_points: 0, total_rebounds: 0,
          total_assists: 0, total_steals: 0, total_blocks: 0, total_turnovers: 0,
          total_fga: 0, total_fgm: 0, total_fga_3: 0, total_fgm_3: 0,
          total_fta: 0, total_ftm: 0, offensive_rebounds: 0, defensive_rebounds: 0, minutes: 0,
        };
        deltas.set(box.player_id, d);
      }
      d.team_id = box.team_id;
      d.games_played++;
      d.total_points += box.points;
      d.total_rebounds += box.rebounds;
      d.total_assists += box.assists;
      d.total_steals += box.steals;
      d.total_blocks += box.blocks;
      d.total_turnovers += box.turnovers;
      d.total_fga += box.fga;
      d.total_fgm += box.fgm;
      d.total_fga_3 += box.fga_3;
      d.total_fgm_3 += box.fgm_3;
      d.total_fta += box.fta;
      d.total_ftm += box.ftm;
      d.offensive_rebounds += box.offensive_rebounds;
      d.defensive_rebounds += box.defensive_rebounds;
      d.minutes += box.minutes_played;
    }

    const playerIds = [...deltas.keys()];
    const { data: existing } = await supabaseAdmin
      .from('player_season_stats')
      .select('*')
      .eq('season_id', seasonId)
      .in('player_id', playerIds);

    const byId = new Map((existing || []).map(s => [s.player_id, s]));

    const upserts = playerIds.map(pid => {
      const d = deltas.get(pid);
      const ex = byId.get(pid) || {};
      return {
        player_id: pid,
        season_id: seasonId,
        team_id: d.team_id,
        saved_game_id: this.savedGameId,
        games_played: (ex.games_played || 0) + d.games_played,
        total_points: (ex.total_points || 0) + d.total_points,
        total_rebounds: (ex.total_rebounds || 0) + d.total_rebounds,
        total_assists: (ex.total_assists || 0) + d.total_assists,
        total_steals: (ex.total_steals || 0) + d.total_steals,
        total_blocks: (ex.total_blocks || 0) + d.total_blocks,
        total_turnovers: (ex.total_turnovers || 0) + d.total_turnovers,
        total_fga: (ex.total_fga || 0) + d.total_fga,
        total_fgm: (ex.total_fgm || 0) + d.total_fgm,
        total_fga_3: (ex.total_fga_3 || 0) + d.total_fga_3,
        total_fgm_3: (ex.total_fgm_3 || 0) + d.total_fgm_3,
        total_fta: (ex.total_fta || 0) + d.total_fta,
        total_ftm: (ex.total_ftm || 0) + d.total_ftm,
        offensive_rebounds: (ex.offensive_rebounds || 0) + d.offensive_rebounds,
        defensive_rebounds: (ex.defensive_rebounds || 0) + d.defensive_rebounds,
        minutes: (ex.minutes || 0) + d.minutes,
      };
    });

    const batches = [];
    for (let i = 0; i < upserts.length; i += BATCH_SIZE_LARGE) {
      batches.push(
        supabaseAdmin.from('player_season_stats').upsert(upserts.slice(i, i + BATCH_SIZE_LARGE), { onConflict: 'player_id,season_id' })
      );
    }
    const results = await Promise.all(batches);
    for (const { error } of results) {
      if (error) throw new Error(`Failed to upsert player season stats: ${error.message}`);
    }
  }

  // ── Date-based Simulation ───────────────────────────────────────────────────
  // async simulateToDate(targetDate, chunkSize = 500) {
  //   if (!targetDate) throw new Error('targetDate is required');
  //   const seasonId = await this.getCurrentSeasonId();

  //   const [{ data: games, error: gamesErr }, { count, error: countErr }] = await Promise.all([
  //     supabaseAdmin
  //       .from('games')
  //       .select('*')
  //       .eq('season_id', seasonId)
  //       .eq('status', 'scheduled')
  //       .lte('game_date', `${targetDate}T23:59:59.999Z`)
  //       .order('game_date', { ascending: true })
  //       .limit(chunkSize),
  //     supabaseAdmin
  //       .from('games')
  //       .select('id', { count: 'exact', head: true })
  //       .eq('season_id', seasonId)
  //       .eq('status', 'scheduled')
  //       .lte('game_date', `${targetDate}T23:59:59.999Z`),
  //   ]);
  //   if (gamesErr) throw new Error(`Failed to fetch games: ${gamesErr.message}`);
  //   if (countErr) throw new Error(`Failed to count games: ${countErr.message}`);
  //   if (!games?.length) return { gamesSimulated: 0, gamesRemaining: 0, complete: true, results: [], summary: null };

  //   const results = await this._bulkSimulateGames(games, seasonId, 'batch');
  //   const maxSimDate = games[games.length - 1].game_date;
  //   const state = await this._getGameState();
  //   const summary = await this._buildSimSummary(games, results, state?.managed_club_id, seasonId);

  //   this._gameStateCache = { ...state, last_simulated_to: maxSimDate, last_simulated_at: new Date().toISOString() };
  //   await supabaseAdmin
  //     .from('saved_games')
  //     .update({ current_game_date: maxSimDate, game_state: this._gameStateCache })
  //     .eq('id', this.savedGameId);

  //   return {
  //     gamesSimulated: games.length,
  //     gamesRemaining: Math.max(0, (count || 0) - games.length),
  //     complete: (count || 0) <= games.length,
  //     results,
  //     summary,
  //   };
  // }

  async simulateSeason() {
    throw new Error('Use simulateWeek() or simulateToNextUserGame() instead.');
  }

  // ── Free Agency ─────────────────────────────────────────────────────────────
  async createFreeAgents(season = 1, count = 75) {
    const players = generateFreeAgentPool(this.savedGameId, count);
    const batches = [];
    for (let i = 0; i < players.length; i += FA_BATCH_SIZE) {
      batches.push(supabaseAdmin.from('players').insert(players.slice(i, i + FA_BATCH_SIZE)).select());
    }
    const results = await Promise.all(batches);
    const inserted = [];
    for (const { data, error } of results) {
      if (error) throw new Error(`Failed to create free agents: ${error.message}`);
      if (data) inserted.push(...data);
    }
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
      .select('id, team_id, first_name, last_name')
      .eq('id', playerId)
      .eq('saved_game_id', this.savedGameId)
      .single();
    if (fetchError || !player) throw new Error('Player not found');
    if (player.team_id === null) throw new Error('Player is already a free agent');

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('players')
      .update({ team_id: null })
      .eq('id', playerId)
      .eq('saved_game_id', this.savedGameId)
      .select()
      .single();
    if (updateError) throw new Error(`Failed to release player: ${updateError.message}`);
    this._rosterCache.delete(player.team_id);
    return updated;
  }

  async signFreeAgent(playerId, teamId) {
    const [{ data: player, error: fetchError }, { data: team, error: teamError }] = await Promise.all([
      supabaseAdmin
        .from('players')
        .select('id, team_id, first_name, last_name, overall_rating, position')
        .eq('id', playerId)
        .eq('saved_game_id', this.savedGameId)
        .single(),
      supabaseAdmin
        .from('teams')
        .select('id, name')
        .eq('id', teamId)
        .eq('saved_game_id', this.savedGameId)
        .single(),
    ]);
    if (fetchError || !player) throw new Error('Player not found');
    if (player.team_id !== null) throw new Error('Player is not a free agent');
    if (teamError || !team) throw new Error('Team not found');

    const { count, error: countError } = await supabaseAdmin
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('saved_game_id', this.savedGameId);
    if (countError) throw new Error(`Failed to check roster size: ${countError.message}`);
    if ((count ?? 0) >= MAX_ROSTER_SIZE) throw new Error(`Roster full — ${team.name} has ${count} players`);

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('players')
      .update({ team_id: teamId })
      .eq('id', playerId)
      .eq('saved_game_id', this.savedGameId)
      .select()
      .single();
    if (updateError) throw new Error(`Failed to sign free agent: ${updateError.message}`);
    this._rosterCache.delete(teamId);
    return updated;
  }

  // ── Trades ──────────────────────────────────────────────────────────────────
  async proposeTrade(proposingTeamId, receivingTeamId, playerIdsFromProposer, playerIdsFromReceiver) {
    const sgId = this.savedGameId;
    const { data: teams, error: teamsError } = await supabaseAdmin
      .from('teams')
      .select('id')
      .in('id', [proposingTeamId, receivingTeamId])
      .eq('saved_game_id', sgId);
    if (teamsError) throw new Error(`Failed to validate teams: ${teamsError.message}`);
    if (!teams || teams.length !== 2) throw new Error('Invalid teams');

    const allPlayerIds = [...playerIdsFromProposer, ...playerIdsFromReceiver];
    if (!allPlayerIds.length) throw new Error('Must include players from each team');

    const { data: players, error: playersError } = await supabaseAdmin
      .from('players')
      .select('id, team_id, overall_rating, potential_rating, age')
      .in('id', allPlayerIds)
      .eq('saved_game_id', sgId);
    if (playersError) throw new Error(`Failed to validate players: ${playersError.message}`);

    const playerMap = new Map(players.map(p => [p.id, p]));
    for (const pid of playerIdsFromProposer) {
      if (playerMap.get(pid)?.team_id !== proposingTeamId) throw new Error(`Player ${pid} not on proposing team`);
    }
    for (const pid of playerIdsFromReceiver) {
      if (playerMap.get(pid)?.team_id !== receivingTeamId) throw new Error(`Player ${pid} not on receiving team`);
    }

    const { data: pendingTradePlayers, error: pendingError } = await supabaseAdmin
      .from('trade_players')
      .select('player_id, trade:trade_id(id, status, saved_game_id)')
      .in('player_id', allPlayerIds);
    if (pendingError) throw new Error(`Failed to check pending trades: ${pendingError.message}`);
    if ((pendingTradePlayers || []).some(tp => tp.trade?.saved_game_id === sgId && tp.trade?.status === 'pending')) {
      throw new Error('Players already in a pending trade');
    }

    const evaluation = evaluateTrade(
      playerIdsFromProposer.map(id => playerMap.get(id)),
      playerIdsFromReceiver.map(id => playerMap.get(id))
    );

    const { data: trade, error: tradeInsertError } = await supabaseAdmin
      .from('trades')
      .insert({
        saved_game_id: sgId,
        proposing_team_id: proposingTeamId,
        receiving_team_id: receivingTeamId,
        status: 'pending',
      })
      .select()
      .single();
    if (tradeInsertError) throw new Error(`Failed to create trade: ${tradeInsertError.message}`);

    const tradePlayerRows = [
      ...playerIdsFromProposer.map(pid => ({ trade_id: trade.id, player_id: pid, from_team_id: proposingTeamId, to_team_id: receivingTeamId })),
      ...playerIdsFromReceiver.map(pid => ({ trade_id: trade.id, player_id: pid, from_team_id: receivingTeamId, to_team_id: proposingTeamId })),
    ];

    const { error: tradePlayersError } = await supabaseAdmin.from('trade_players').insert(tradePlayerRows);
    if (tradePlayersError) throw new Error(`Failed to insert trade players: ${tradePlayersError.message}`);

    if (evaluation.accepted) {
      await this.acceptTrade(trade.id, false);
      trade.status = 'completed';
      trade.result = 'Trade accepted and completed';
    } else {
      trade.status = 'pending';
      trade.result = evaluation.reason;
    }
    return trade;
  }

  async acceptTrade(tradeId, requireAuthority = true) {
    const sgId = this.savedGameId;
    const { data: trade, error: tradeError } = await supabaseAdmin
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .eq('saved_game_id', sgId)
      .eq('status', 'pending')
      .single();
    if (tradeError || !trade) throw new Error('Trade not found or not pending');

    const { data: tradePlayers, error: tpError } = await supabaseAdmin
      .from('trade_players')
      .select('*')
      .eq('trade_id', tradeId);
    if (tpError) throw new Error(`Failed to load trade players: ${tpError.message}`);

    const playerUpdates = (tradePlayers || []).map(tp => ({
      id: tp.player_id,
      team_id: tp.to_team_id,
      updated_at: new Date().toISOString(),
    }));
    const { error: updateError } = await supabaseAdmin.from('players').upsert(playerUpdates, { onConflict: 'id' });
    if (updateError) throw new Error(`Failed to move players: ${updateError.message}`);

    const { error: completeError } = await supabaseAdmin
      .from('trades')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', tradeId);
    if (completeError) throw new Error(`Failed to complete trade: ${completeError.message}`);

    for (const tp of (tradePlayers || [])) {
      this._rosterCache.delete(tp.from_team_id);
      this._rosterCache.delete(tp.to_team_id);
    }
    return { ...trade, status: 'completed' };
  }

  async rejectTrade(tradeId) {
    const { data, error } = await supabaseAdmin
      .from('trades')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', tradeId)
      .eq('saved_game_id', this.savedGameId)
      .eq('status', 'pending')
      .select()
      .single();
    if (error || !data) throw new Error('Trade not found or not pending');
    return data;
  }

  async cancelTrade(tradeId) {
    const { data, error } = await supabaseAdmin
      .from('trades')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', tradeId)
      .eq('saved_game_id', this.savedGameId)
      .eq('status', 'pending')
      .select()
      .single();
    if (error || !data) throw new Error('Trade not found or not pending');
    return data;
  }

  async getTrades(teamId = null) {
    let query = supabaseAdmin
      .from('trades')
      .select('*, players:trade_players(player_id, from_team_id, to_team_id)')
      .eq('saved_game_id', this.savedGameId)
      .order('created_at', { ascending: false });
    if (teamId) query = query.or(`proposing_team_id.eq.${teamId},receiving_team_id.eq.${teamId}`);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to load trades: ${error.message}`);
    return data || [];
  }

  async getTradeById(tradeId) {
    const { data, error } = await supabaseAdmin
      .from('trades')
      .select('*, players:trade_players(player_id, from_team_id, to_team_id)')
      .eq('id', tradeId)
      .eq('saved_game_id', this.savedGameId)
      .single();
    if (error || !data) throw new Error('Trade not found');
    return data;
  }

  // ── Coaches ─────────────────────────────────────────────────────────────────
  async createCoaches(teams) {
    const coachGen = new CoachGenerator(this.savedGameId);
    const coaches = coachGen.generateLeagueCoaches(teams, this._lastTeamTiers || {});
    const { data, error } = await supabaseAdmin.from('coaches').insert(coaches).select();
    if (error) throw new Error(`Failed to create coaches: ${error.message}`);
    for (const coach of data) this._coachCache.set(coach.team_id, coach);
    await FinanceService.initializeCoachContracts(this.savedGameId, data);
    return data;
  }

  async tradePlayer(playerId, newTeamId) {
    const { data: destTeam, error: te } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('id', newTeamId)
      .eq('saved_game_id', this.savedGameId)
      .single();
    if (te || !destTeam) throw new Error('Destination team not found');

    const { data: playerBefore, error: fetchErr } = await supabaseAdmin
      .from('players')
      .select('id, team_id')
      .eq('id', playerId)
      .eq('saved_game_id', this.savedGameId)
      .single();
    if (fetchErr || !playerBefore) throw new Error('Player not found');
    const oldTeamId = playerBefore.team_id;

    const { data, error } = await supabaseAdmin
      .from('players')
      .update({ team_id: newTeamId })
      .eq('id', playerId)
      .eq('saved_game_id', this.savedGameId)
      .select()
      .single();
    if (error) throw new Error(`Failed to trade player: ${error.message}`);
    this._rosterCache.delete(oldTeamId);
    this._rosterCache.delete(newTeamId);
    return data;
  }
}

module.exports = leagueService;