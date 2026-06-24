// controllers/leagueController.js
const { supabaseAdmin }      = require('../config/supabase');
const LeagueService          = require('../services/leagueService');
const TeamArchetypeService   = require('../services/teamArchetypeService');

const SORTABLE_PLAYER_COLUMNS = new Set([
  'overall_rating', 'potential_rating', 'age', 'height', 'weight',
  'points', 'rebounds', 'assists',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadOwnedGame(savedGameId, userId) {
  const { data: game, error } = await supabaseAdmin
    .from('saved_games')
    .select('*')
    .eq('id', savedGameId)
    .eq('user_id', userId)
    .single();
  if (error || !game) return null;
  return game;
}

async function getCurrentSeasonId(savedGameId) {
  const { data: game, error } = await supabaseAdmin
    .from('saved_games')
    .select('game_state')
    .eq('id', savedGameId)
    .single();
  if (error) throw new Error(`Failed to load saved game: ${error.message}`);
  if (game?.game_state?.season_id) return game.game_state.season_id;

  const { data: seasons, error: sError } = await supabaseAdmin
    .from('seasons')
    .select('id')
    .eq('saved_game_id', savedGameId)
    .order('season_number', { ascending: false })
    .limit(1);
  if (sError || !seasons?.length) return null;
  return seasons[0].id;
}

// ── Controller ────────────────────────────────────────────────────────────────

const leagueController = {

  async initializeLeague(req, res, next) {
    try {
      const { savedGameId } = req.params;
      const { season = 1, managedClubName = null } = req.body;

      console.log('📦 Initialization body:', req.body);
      console.log('🆔 managedClubName received:', managedClubName, typeof managedClubName);

      const game = await loadOwnedGame(savedGameId, req.user.id);
      if (!game) return res.status(404).json({ error: 'Game not found or unauthorized' });

      const leagueService = new LeagueService(savedGameId);
      const result        = await leagueService.initializeLeague(season, managedClubName);

      res.json({ success: true, message: 'League initialized successfully', data: result });
    } catch (error) {
      if (error.message.includes('already initialized')) {
        return res.status(409).json({ error: error.message });
      }
      console.error('League initialization error:', error);
      next(error);
    }
  },

  // ── GET /api/league/:savedGameId/next-user-game ───────────────────────────
  //
  // Returns the next scheduled game for the managed team, with team details
  // joined in, plus a count of league games that will be auto-simulated first.
  //
  // Response shape:
  // {
  //   success: true,
  //   data: {
  //     seasonComplete: false,
  //     leagueGamesBeforeCount: 4,
  //     nextUserGame: {
  //       id, game_date, week, isHome,
  //       home_team: { id, name, abbreviation, city },
  //       away_team: { id, name, abbreviation, city }
  //     }
  //   }
  // }

  async getNextUserGame(req, res, next) {
    try {
      const { savedGameId } = req.params;
      const game = await loadOwnedGame(savedGameId, req.user.id);
      if (!game) return res.status(404).json({ error: 'Game not found or unauthorized' });

      const leagueService = new LeagueService(savedGameId);
      const result        = await leagueService.getNextUserGame();

      res.json({ success: true, data: result });
    } catch (error) {
      console.error('getNextUserGame error:', error);
      next(error);
    }
  },

  // ── POST /api/league/:savedGameId/simulate-to-next-game ──────────────────
  //
  // Simulates every league game whose game_date is strictly before the
  // managed team's next game.  Returns the simulation results and the
  // upcoming user game so the UI can surface it immediately after.
  //
  // Response shape:
  // {
  //   success: true,
  //   data: {
  //     seasonComplete: false,
  //     gamesSimulated: 4,
  //     results: [ { gameId, game_date, homeTeamId, awayTeamId, homeScore, awayScore, overtime } ],
  //     nextUserGame: { id, game_date, isHome, home_team, away_team }
  //   }
  // }

  async simulateToNextGame(req, res, next) {
    try {
      const { savedGameId } = req.params;
      const game = await loadOwnedGame(savedGameId, req.user.id);
      if (!game) return res.status(404).json({ error: 'Game not found or unauthorized' });

      const leagueService = new LeagueService(savedGameId);
      const result        = await leagueService.simulateToNextUserGame();

      res.json({ success: true, data: result });
    } catch (error) {
      console.error('simulateToNextGame error:', error);
      next(error);
    }
  },

  // ── Existing handlers (unchanged) ─────────────────────────────────────────

  async simulateSeason(req, res, next) {
    try {
      const { savedGameId } = req.params;
      const game = await loadOwnedGame(savedGameId, req.user.id);
      if (!game) return res.status(404).json({ error: 'Game not found or unauthorized' });

      const leagueService = new LeagueService(savedGameId);
      await leagueService.simulateSeason();

      res.json({ success: true, message: 'Season simulated successfully' });
    } catch (error) {
      if (error.message.includes('not implemented')) {
        return res.status(501).json({ error: 'Season simulation is not built yet. Use simulate-to-next-game instead.' });
      }
      console.error('Season simulation error:', error);
      next(error);
    }
  },

  async getTeams(req, res, next) {
    try {
      const { savedGameId } = req.params;
      const { data, error } = await supabaseAdmin
        .from('teams').select('*').eq('saved_game_id', savedGameId);
      if (error) throw error;
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },

  async getPlayers(req, res, next) {
    try {
      const { savedGameId } = req.params;
      const { data, error } = await supabaseAdmin
        .from('players').select('*').eq('saved_game_id', savedGameId);
      if (error) throw error;
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },

  async getStandings(req, res, next) {
    try {
      const { savedGameId } = req.params;
      const { data: standings, error } = await supabaseAdmin
        .from('v_standings')
        .select('*')
        .eq('saved_game_id', savedGameId)
        .order('win_pct', { ascending: false })
        .order('wins',    { ascending: false });
      if (error) throw error;
      res.json({ success: true, data: standings });
    } catch (error) { next(error); }
  },

  async getSchedule(req, res, next) {
    try {
      const { savedGameId } = req.params;
      const seasonId = await getCurrentSeasonId(savedGameId);
      if (!seasonId) return res.status(404).json({ error: 'No active season found' });

      const { data: games, error } = await supabaseAdmin
        .from('games')
        .select(`
          *,
          home_team:home_team_id(name, abbreviation),
          away_team:away_team_id(name, abbreviation)
        `)
        .eq('season_id', seasonId)
        .order('game_date', { ascending: true });

      if (error) throw error;

      const grouped = games.reduce((acc, game) => {
        const week = game.week || 0;
        if (!acc[week]) acc[week] = [];
        acc[week].push(game);
        return acc;
      }, {});

      res.json({ success: true, data: grouped });
    } catch (error) { next(error); }
  },

  async getLeagueLeaders(req, res, next) {
    try {
      const { savedGameId, stat } = req.params;
      if (!SORTABLE_PLAYER_COLUMNS.has(stat)) {
        return res.status(400).json({ error: `Unknown stat "${stat}"` });
      }
      const { data: players, error } = await supabaseAdmin
        .from('players')
        .select('*')
        .eq('saved_game_id', savedGameId)
        .order(stat, { ascending: false })
        .limit(10);
      if (error) throw error;
      res.json({ success: true, data: players });
    } catch (error) { next(error); }
  },

  async getPlayerStats(req, res, next) {
    try {
      const { savedGameId, playerId } = req.params;
      const [playerRes, seasonRes] = await Promise.all([
        supabaseAdmin.from('players').select('*').eq('saved_game_id', savedGameId).eq('id', playerId).single(),
        supabaseAdmin.from('v_player_averages').select('*').eq('player_id', playerId),
      ]);
      if (playerRes.error) throw playerRes.error;
      res.json({ success: true, data: { player: playerRes.data, seasonStats: seasonRes.data || [] } });
    } catch (error) { next(error); }
  },

  async tradePlayer(req, res, next) {
    try {
      const { savedGameId }         = req.params;
      const { playerId, newTeamId } = req.body;
      if (!playerId || !newTeamId) return res.status(400).json({ error: 'playerId and newTeamId are required' });

      const game = await loadOwnedGame(savedGameId, req.user.id);
      if (!game) return res.status(404).json({ error: 'Game not found or unauthorized' });

      const leagueService = new LeagueService(savedGameId);
      const player        = await leagueService.tradePlayer(playerId, newTeamId);
      res.json({ success: true, message: 'Trade completed', data: player });
    } catch (error) { next(error); }
  },

  async getArchetypes(req, res, next) {
    try {
      const archetypes = TeamArchetypeService.getArchetypes().map(arch => ({
        id:          arch.id,
        label:       arch.label,
        description: arch.description,
        icon:        arch.icon,
        strengths:   TeamArchetypeService._getArchetypeStrengths(arch),
        weaknesses:  TeamArchetypeService._getArchetypeWeaknesses(arch),
      }));
      res.json({ success: true, data: archetypes });
    } catch (error) { next(error); }
  },

  async simulateNextGame(req, res, next) {
    try {
      const { savedGameId } = req.params;
      const game = await loadOwnedGame(savedGameId, req.user.id);
      if (!game) return res.status(404).json({ error: 'Game not found or unauthorized' });

      const leagueService = new LeagueService(savedGameId);
      const seasonId      = game.game_state?.season_id;
      if (!seasonId) return res.status(400).json({ error: 'No season initialised for this game' });

      const { data: nextGame, error: findError } = await supabaseAdmin
        .from('games')
        .select('*')
        .eq('season_id', seasonId)
        .eq('status', 'scheduled')
        .order('game_date', { ascending: true })
        .limit(1)
        .single();

      if (findError || !nextGame) {
        await supabaseAdmin.from('seasons')
          .update({ status: 'finished', end_date: new Date().toISOString() })
          .eq('id', seasonId);
        return res.json({ success: true, message: 'Season complete', seasonComplete: true });
      }

      const result = await leagueService.simulateGame(nextGame.id);
      res.json({ success: true, message: 'Game simulated', data: result, seasonComplete: false });
    } catch (error) {
      console.error('Simulate next game error:', error);
      next(error);
    }
  },

  async simulateWeek(req, res, next) {
    try {
      const { savedGameId } = req.params;
      const game = await loadOwnedGame(savedGameId, req.user.id);
      if (!game) return res.status(404).json({ error: 'Game not found or unauthorized' });

      const leagueService = new LeagueService(savedGameId);
      const result        = await leagueService.simulateWeek();

      res.json({ success: true, ...result });
    } catch (error) {
      console.error('Simulate week error:', error);
      next(error);
    }
  },

  async simulateToDate(req, res, next) {
    try {
        const { savedGameId } = req.params;
        const { targetDate } = req.body;   // ISO string or date string

        if (!targetDate) {
        return res.status(400).json({ error: 'targetDate is required' });
        }

        // Ownership check
        const game = await loadOwnedGame(savedGameId, req.user.id);
        if (!game) {
        return res.status(404).json({ error: 'Game not found or unauthorized' });
        }

        const leagueService = new LeagueService(savedGameId);
        const result = await leagueService.simulateToDate(targetDate);

        res.json({ success: true, data: result });
    } catch (error) {
        console.error('simulateToDate error:', error);
        next(error);
    }
  },
};

module.exports = leagueController;