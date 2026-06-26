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
      const seasonId = await getCurrentSeasonId(savedGameId);

      const [playersRes, statsRes] = await Promise.all([
        supabaseAdmin
          .from('players')
          .select('*')
          .eq('saved_game_id', savedGameId),
        seasonId
          ? supabaseAdmin
              .from('player_season_stats')
              .select(
                'player_id, games_played, total_points, total_rebounds, ' +
                'total_assists, total_steals, total_blocks, total_turnovers, ' +
                'total_fga, total_fgm, total_fga_3, total_fgm_3, ' +
                'total_fta, total_ftm, offensive_rebounds, defensive_rebounds, minutes'
              )
              .eq('saved_game_id', savedGameId)
              .eq('season_id', seasonId)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (playersRes.error) throw playersRes.error;

      const statsByPlayer = {};
      (statsRes.data || []).forEach(s => { statsByPlayer[s.player_id] = s; });

      const avg = (val, gp) => (gp > 0 ? parseFloat((val / gp).toFixed(1)) : 0);

      const enriched = (playersRes.data || []).map(p => {
        const s  = statsByPlayer[p.id];
        const gp = s?.games_played || 0;
        return {
          ...p,
          ...(p.traits || {}),
          games_played: gp,
          points:       avg(s?.total_points         || 0, gp),
          rebounds:     avg(s?.total_rebounds        || 0, gp),
          assists:      avg(s?.total_assists         || 0, gp),
          steals:       avg(s?.total_steals          || 0, gp),
          blocks:       avg(s?.total_blocks          || 0, gp),
          turnovers:    avg(s?.total_turnovers       || 0, gp),
          minutes_pg:   avg(s?.minutes              || 0, gp),
          fg_pct:  s?.total_fga   > 0 ? parseFloat(((s.total_fgm   / s.total_fga)   * 100).toFixed(1)) : 0,
          fg3_pct: s?.total_fga_3 > 0 ? parseFloat(((s.total_fgm_3 / s.total_fga_3) * 100).toFixed(1)) : 0,
          ft_pct:  s?.total_fta   > 0 ? parseFloat(((s.total_ftm   / s.total_fta)   * 100).toFixed(1)) : 0,
        };
      });

      res.json({ success: true, data: enriched });
    } catch (error) { next(error); }
  },

  async getStandings(req, res, next) {
    try {
      const { savedGameId } = req.params;
      const seasonId = await getCurrentSeasonId(savedGameId);
      if (!seasonId) return res.json({ success: true, data: [] });

      const { data, error } = await supabaseAdmin
        .from('team_season_stats')
        .select(
          'team_id, wins, losses, points_for, points_against, ' +
          'home_wins, home_losses, away_wins, away_losses, saved_game_id'
        )
        .eq('saved_game_id', savedGameId)
        .eq('season_id', seasonId);

      if (error) throw error;

      const sorted = (data || [])
        .map(row => ({
          ...row,
          win_pct: (row.wins + row.losses) > 0
            ? row.wins / (row.wins + row.losses)
            : 0,
        }))
        .sort((a, b) => b.win_pct - a.win_pct || b.wins - a.wins);

      res.json({ success: true, data: sorted });
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

  // ── GET /api/league/:savedGameId/games/recent ─────────────────────────────
  //
  // Returns every game played during the most recent simulation batch
  // (i.e. all games whose played_at matches the latest completed played_at).
  // Box scores are attached via player_game_stats (correct table name).

  async getRecentGames(req, res, next) {
    try {
      const { savedGameId } = req.params;
      const seasonId = await getCurrentSeasonId(savedGameId);
      if (!seasonId) return res.json({ success: true, data: [] });

      // 1. Find the most recent played_at across completed games
      const { data: latestDateRow, error: dateError } = await supabaseAdmin
        .from('games')
        .select('played_at')
        .eq('season_id', seasonId)
        .eq('status', 'completed')
        .order('played_at', { ascending: false })
        .limit(1)
        .single();

      if (dateError || !latestDateRow) {
        return res.json({ success: true, data: [] });
      }

      const latestDate = latestDateRow.played_at;

      // 2. All completed games from that exact simulation batch
      const { data: games, error: gamesError } = await supabaseAdmin
        .from('games')
        .select(`
          id, game_date, played_at, week, status,
          home_team_id, away_team_id,
          home_score, away_score,
          home_team:home_team_id ( id, name, abbreviation, city ),
          away_team:away_team_id ( id, name, abbreviation, city )
        `)
        .eq('season_id', seasonId)
        .eq('status', 'completed')
        .eq('played_at', latestDate)
        .order('id', { ascending: true });

      if (gamesError) throw gamesError;
      if (!games || games.length === 0) {
        return res.json({ success: true, data: [] });
      }

      // 3. Fetch box scores from player_game_stats (not the non-existent game_stats)
      const gameIds = games.map(g => g.id);

      const { data: allStats, error: statsError } = await supabaseAdmin
        .from('player_game_stats')
        .select(`
          game_id,
          player_id,
          points, rebounds, assists, steals, blocks, turnovers,
          fgm, fga, fgm_3, fga_3, ftm, fta,
          player:player_id ( first_name, last_name )
        `)
        .in('game_id', gameIds);

      if (statsError) throw statsError;

      // 4. Group box scores by game_id and attach to each game
      const statsByGame = {};
      (allStats || []).forEach(stat => {
        if (!statsByGame[stat.game_id]) statsByGame[stat.game_id] = [];
        statsByGame[stat.game_id].push(stat);
      });

      const enrichedGames = games.map(game => ({
        ...game,
        boxScores: statsByGame[game.id] || [],
      }));

      res.json({ success: true, data: enrichedGames });
    } catch (error) {
      next(error);
    }
  },

  // ── GET /api/league/games/:gameId ─────────────────────────────────────────
  //
  // Returns a single completed game with its full box score.
  // Called by GameResults when a user expands a game card.

  async getGameDetails(req, res, next) {
    try {
      const { gameId } = req.params;

      const { data: game, error: gameError } = await supabaseAdmin
        .from('games')
        .select(`
          id, game_date, played_at, week, status,
          home_team_id, away_team_id,
          home_score, away_score,
          home_team:home_team_id ( id, name, abbreviation, city ),
          away_team:away_team_id ( id, name, abbreviation, city )
        `)
        .eq('id', gameId)
        .single();

      if (gameError || !game) {
        return res.status(404).json({ error: 'Game not found' });
      }

      const { data: boxScores, error: statsError } = await supabaseAdmin
        .from('player_game_stats')
        .select(`
          game_id,
          player_id,
          team_id,
          minutes_played,
          points, rebounds, assists, steals, blocks, turnovers,
          fgm, fga, fgm_3, fga_3, ftm, fta,
          plus_minus,
          player:player_id ( first_name, last_name )
        `)
        .eq('game_id', gameId)
        .order('points', { ascending: false });

      if (statsError) throw statsError;

      res.json({ success: true, data: { ...game, boxScores: boxScores || [] } });
    } catch (error) {
      next(error);
    }
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
      const { targetDate } = req.body;

      if (!targetDate) {
        return res.status(400).json({ error: 'targetDate is required' });
      }

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