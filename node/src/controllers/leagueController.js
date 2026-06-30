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

async function updateCurrentGameDate(savedGameId, seasonId, explicitDate = null) {
  let dateToSet = explicitDate;

  if (!dateToSet) {
    const { data, error } = await supabaseAdmin
      .from('games')
      .select('game_date')
      .eq('season_id', seasonId)
      .eq('status', 'completed')
      .order('game_date', { ascending: false })
      .limit(1);

    if (error) throw error;
    if (!data || data.length === 0) return null;
    dateToSet = data[0].game_date;
  }

  const { error: updateError } = await supabaseAdmin
    .from('saved_games')
    .update({ current_game_date: dateToSet })
    .eq('id', savedGameId);

  if (updateError) throw updateError;
  return dateToSet;
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

  // ── GET /api/league/archetypes ─────────────────────────────────────────────
  // Public (no savedGameId needed) – returns the static archetype catalogue
  // so the frontend can display the picker without an active game.

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

  // ── POST /api/league/:savedGameId/initialize ───────────────────────────────
  // Body: { season?, managedClubName, userArchetype? }

  async initializeLeague(req, res, next) {
    try {
      const { savedGameId } = req.params;
      const {
        season          = 1,
        managedClubName = null,
        userArchetype   = null,   // ← new
      } = req.body;

      console.log('📦 Initialization body:', req.body);
      console.log('🆔 managedClubName:', managedClubName, '| archetype:', userArchetype);

      // Validate archetype if provided
      if (userArchetype && !TeamArchetypeService.isValidArchetype(userArchetype)) {
        return res.status(400).json({
          error: `Invalid archetype "${userArchetype}". ` +
                 `Valid options: ${TeamArchetypeService.getArchetypes().map(a => a.id).join(', ')}`,
        });
      }

      const game = await loadOwnedGame(savedGameId, req.user.id);
      if (!game) return res.status(404).json({ error: 'Game not found or unauthorized' });

      const leagueService = new LeagueService(savedGameId);
      const result        = await leagueService.initializeLeague(season, managedClubName, userArchetype);

      res.json({
        success: true,
        message: 'League initialized successfully',
        data:    result,
      });
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

      const { data: savedGame, error: fetchError } = await supabaseAdmin
        .from('saved_games')
        .select('current_game_date')
        .eq('id', savedGameId)
        .single();
      if (!fetchError && savedGame) {
        result.currentGameDate = savedGame.current_game_date;
      }

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

      const seasonId = game.game_state?.season_id;
      if (seasonId) {
        const currentDate  = await updateCurrentGameDate(savedGameId, seasonId);
        result.currentGameDate = currentDate;
      }

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

  async getRecentGames(req, res, next) {
    try {
      const { savedGameId } = req.params;
      const seasonId = await getCurrentSeasonId(savedGameId);
      if (!seasonId) return res.json({ success: true, data: [] });

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
          game_id, player_id, team_id,
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

      const result      = await leagueService.simulateGame(nextGame.id);
      const currentDate = await updateCurrentGameDate(savedGameId, seasonId);
      result.currentGameDate = currentDate;

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

      const seasonId = game.game_state?.season_id;
      if (seasonId) {
        const currentDate  = await updateCurrentGameDate(savedGameId, seasonId);
        result.currentGameDate = currentDate;
      }

      res.json({ success: true, ...result });
    } catch (error) {
      console.error('Simulate week error:', error);
      next(error);
    }
  },

  async simulateToDate(req, res, next) {
    try {
      const { savedGameId } = req.params;
      const { targetDate }  = req.body;

      if (!targetDate) {
        return res.status(400).json({ error: 'targetDate is required' });
      }

      const game = await loadOwnedGame(savedGameId, req.user.id);
      if (!game) {
        return res.status(404).json({ error: 'Game not found or unauthorized' });
      }

      const leagueService = new LeagueService(savedGameId);
      const result        = await leagueService.simulateToDate(targetDate);

      const seasonId = game.game_state?.season_id;
      if (seasonId) {
        const actualDate  = result.actualDate || targetDate;
        const currentDate = await updateCurrentGameDate(savedGameId, seasonId, actualDate);
        result.currentGameDate = currentDate;
      }

      res.json({ success: true, data: result });
    } catch (error) {
      console.error('simulateToDate error:', error);
      next(error);
    }
  },

  // ─────────────────────────────────────────────────────────────────────────────
// FREE AGENCY — controller handlers
//
// Add these three methods to the `leagueController` object in leagueController.js
// (alongside getTeams, getPlayers, tradePlayer, etc.)
// ─────────────────────────────────────────────────────────────────────────────

  // ── GET /api/league/:savedGameId/free-agents ────────────────────────────────
  // Query params:
  //   position    string  filter by position (PG|SG|SF|PF|C)
  //   minOverall  number  minimum overall rating
  //   limit       number  max results (default 100, max 200)
  //   offset      number  pagination offset (default 0)

  async getFreeAgents(req, res, next) {
    try {
      const { savedGameId } = req.params;
      const {
        position,
        minOverall,
        limit  = 100,
        offset = 0,
      } = req.query;

      // Ownership check
      const game = await loadOwnedGame(savedGameId, req.user.id);
      if (!game) return res.status(404).json({ error: 'Game not found or unauthorized' });

      const leagueService = new LeagueService(savedGameId);
      const freeAgents    = await leagueService.getFreeAgents({
        position:   position   || undefined,
        minOverall: minOverall ? parseInt(minOverall, 10) : undefined,
        limit:      Math.min(parseInt(limit,  10) || 100, 200),
        offset:     parseInt(offset, 10) || 0,
      });

      res.json({
        success: true,
        data:    freeAgents,
        count:   freeAgents.length,
      });
    } catch (error) {
      next(error);
    }
  },

  // ── POST /api/league/:savedGameId/free-agents/sign ─────────────────────────
  // Body: { playerId: string, teamId: string }

  async signFreeAgent(req, res, next) {
    try {
      const { savedGameId }     = req.params;
      const { playerId, teamId } = req.body;

      if (!playerId || !teamId) {
        return res.status(400).json({ error: 'playerId and teamId are required' });
      }

      const game = await loadOwnedGame(savedGameId, req.user.id);
      if (!game) return res.status(404).json({ error: 'Game not found or unauthorized' });

      const leagueService = new LeagueService(savedGameId);
      const player        = await leagueService.signFreeAgent(playerId, teamId);

      res.json({
        success: true,
        message: `Player signed successfully`,
        data:    player,
      });
    } catch (error) {
      // Surface roster-full and business-rule errors as 400 rather than 500
      if (
        error.message.includes('Roster full') ||
        error.message.includes('not a free agent') ||
        error.message.includes('already a free agent') ||
        error.message.includes('not found')
      ) {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  },

  // ── POST /api/league/:savedGameId/players/:playerId/release ────────────────
  // No body required.

  async releasePlayer(req, res, next) {
    try {
      const { savedGameId, playerId } = req.params;

      const game = await loadOwnedGame(savedGameId, req.user.id);
      if (!game) return res.status(404).json({ error: 'Game not found or unauthorized' });

      const leagueService = new LeagueService(savedGameId);
      const player        = await leagueService.releasePlayer(playerId);

      res.json({
        success: true,
        message: `${player.first_name} ${player.last_name} released to free agency`,
        data:    player,
      });
    } catch (error) {
      if (
        error.message.includes('already a free agent') ||
        error.message.includes('not found')
      ) {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  },
  async proposeTrade(req, res, next) {
    try {
      const { savedGameId } = req.params;
      const { receivingTeamId, playerIdsFromProposer, playerIdsFromReceiver } = req.body;
      const proposingTeamId = req.userManagedTeamId; // from auth middleware

      if (!receivingTeamId || !playerIdsFromProposer || !playerIdsFromReceiver) {
        return res.status(400).json({ error: 'Missing required fields.' });
      }

      const trade = await leagueService.proposeTrade(
        savedGameId,
        proposingTeamId,
        receivingTeamId,
        playerIdsFromProposer,
        playerIdsFromReceiver
      );

      return res.status(201).json(trade);
    } catch (err) {
      next(err);
    }
  },

  // GET /saved-games/:savedGameId/trades
  async getTrades(req, res, next) {
    try {
      const { savedGameId } = req.params;
      const teamId = req.query.teamId || req.userManagedTeamId; // optional filter
      const trades = await leagueService.getTrades(savedGameId, teamId);
      return res.json(trades);
    } catch (err) {
      next(err);
    }
  },

  // GET /saved-games/:savedGameId/trades/:tradeId
  async getTradeById(req, res, next) {
    try {
      const { savedGameId, tradeId } = req.params;
      const trade = await leagueService.getTradeById(tradeId, savedGameId);
      return res.json(trade);
    } catch (err) {
      next(err);
    }
  },

  // POST /saved-games/:savedGameId/trades/:tradeId/accept
  async acceptTrade(req, res, next) {
    try {
      const { savedGameId, tradeId } = req.params;
      // Only the receiving team (or admin) should be allowed to accept
      const trade = await leagueService.getTradeById(tradeId, savedGameId);
      if (trade.receiving_team_id !== req.userManagedTeamId) {
        return res.status(403).json({ error: 'Only the receiving team can accept a trade.' });
      }
      const updated = await leagueService.acceptTrade(tradeId, savedGameId, true);
      return res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  // POST /saved-games/:savedGameId/trades/:tradeId/reject
  async rejectTrade(req, res, next) {
    try {
      const { savedGameId, tradeId } = req.params;
      const trade = await leagueService.getTradeById(tradeId, savedGameId);
      if (trade.receiving_team_id !== req.userManagedTeamId) {
        return res.status(403).json({ error: 'Only the receiving team can reject a trade.' });
      }
      const updated = await leagueService.rejectTrade(tradeId, savedGameId);
      return res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  // DELETE /saved-games/:savedGameId/trades/:tradeId (cancel)
  async cancelTrade(req, res, next) {
    try {
      const { savedGameId, tradeId } = req.params;
      // Both the proposing team and the receiving team can cancel a pending trade
      const trade = await leagueService.getTradeById(tradeId, savedGameId);
      if (trade.proposing_team_id !== req.userManagedTeamId && trade.receiving_team_id !== req.userManagedTeamId) {
        return res.status(403).json({ error: 'Not authorized to cancel this trade.' });
      }
      const updated = await leagueService.cancelTrade(tradeId, savedGameId);
      return res.json(updated);
    } catch (err) {
      next(err);
    }
  }
};
  


module.exports = leagueController;