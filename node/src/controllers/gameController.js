// controllers/gameController.js
const { supabase, supabaseAdmin } = require('../config/supabase');
const gameService = require('../services/gameService');
const TeamArchetypeService = require('../services/utils/teamArchetypeService');

const VALID_DIFFICULTIES = ['rookie', 'pro', 'all_star', 'hall_of_fame'];

const gameController = {

// ── Create a new save file ────────────────────────────────────────────
  // Called by the frontend with { name, managed_club_id (team name string), difficulty, archetype_choice }
  // managed_club_id is stored in game_state.managed_team_name and resolved to a real UUID
  // by leagueService.initializeLeague() once teams are created.
  // archetype_choice is stored on its own column (not game_state) so
  // leagueService / PlayerGenerator can read it directly when the league
  // is initialized, and so it can be picked at game-creation time before
  // the league (or even the managed team's UUID) exists.
  async createGame(req, res, next) {
    try {
      const { name, managed_club_id, difficulty = 'pro', archetype_choice = null } = req.body;

      if (!name || !managed_club_id) {
        return res.status(400).json({
          error: 'Missing required fields: name, managed_club_id',
        });
      }

      if (!VALID_DIFFICULTIES.includes(difficulty)) {
        return res.status(400).json({
          error: `Invalid difficulty. Must be one of: ${VALID_DIFFICULTIES.join(', ')}`,
        });
      }

      if (archetype_choice && !TeamArchetypeService.isValidArchetype(archetype_choice)) {
        return res.status(400).json({
          error: `Invalid archetype_choice "${archetype_choice}". ` +
                 `Valid options: ${TeamArchetypeService.getArchetypes().map(a => a.id).join(', ')}`,
        });
      }

      // Use supabaseAdmin so we can set user_id server-side from the verified JWT.
      // managed_club_id is a team *name* at this point (e.g. "Lakers") — teams don't
      // exist yet. We store the name in game_state and resolve it to a UUID inside
      // leagueService.initializeLeague() after teams are created.
      const { data, error } = await supabaseAdmin
        .from('saved_games')
        .insert({
          user_id:          req.user.id,
          name,
          difficulty,
          managed_club_id:  null,       // resolved after league init
          archetype_choice,
          game_state: {
            managed_team_name: managed_club_id,  // "Lakers", "Celtics", etc.
          },
        })
        .select()
        .single();

      if (error) throw error;

      res.status(201).json({
        success: true,
        data,
        message: 'Game created successfully',
      });
    } catch (error) {
      console.error('Create game error:', error);
      next(error);
    }
  },

  // ── Get a save file by ID ─────────────────────────────────────────────
  async getGame(req, res, next) {
    try {
      const { id } = req.params;

      const { data: game, error } = await supabase
        .from('saved_games')
        .select('*')
        .eq('id', id)
        .eq('user_id', req.user.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Game not found' });
        }
        throw error;
      }

      // Touch last_played timestamp
      await supabase
        .from('saved_games')
        .update({ last_played: new Date() })
        .eq('id', id);

      res.json({ success: true, data: game });
    } catch (error) {
      next(error);
    }
  },

  // ── Update a save file ────────────────────────────────────────────────
  async updateGame(req, res, next) {
    try {
      const { id } = req.params;
      const { game_state, current_season, current_game_date, name } = req.body;

      // Verify ownership first
      const { data: existing, error: verifyError } = await supabase
        .from('saved_games')
        .select('id')
        .eq('id', id)
        .eq('user_id', req.user.id)
        .single();

      if (verifyError || !existing) {
        return res.status(404).json({ error: 'Game not found or unauthorized' });
      }

      const updateData = { updated_at: new Date() };
      if (name)              updateData.name              = name;
      if (game_state)        updateData.game_state        = game_state;
      if (current_season)    updateData.current_season    = current_season;
      if (current_game_date) updateData.current_game_date = current_game_date;

      const { data: game, error } = await supabase
        .from('saved_games')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', req.user.id)
        .select()
        .single();

      if (error) throw error;

      res.json({ success: true, data: game, message: 'Game updated successfully' });
    } catch (error) {
      next(error);
    }
  },

  // ── Delete a save file ────────────────────────────────────────────────
  async deleteGame(req, res, next) {
    try {
      const { id } = req.params;

      // Verify ownership
      const { data: existing, error: verifyError } = await supabase
        .from('saved_games')
        .select('id')
        .eq('id', id)
        .eq('user_id', req.user.id)
        .single();

      if (verifyError || !existing) {
        return res.status(404).json({ error: 'Game not found or unauthorized' });
      }

      const { error } = await supabase
        .from('saved_games')
        .delete()
        .eq('id', id)
        .eq('user_id', req.user.id);

      if (error) throw error;

      res.json({ success: true, message: 'Game deleted successfully' });
    } catch (error) {
      next(error);
    }
  },

  // ── Quick-simulate a single match (legacy simple path) ────────────────
  // Uses gameService.simulateMatch (random stats). For the full
  // possession-based engine see leagueController.simulateNextGame / simulateWeek.
  async simulateGame(req, res, next) {
    try {
      const { id } = req.params;
      const { home_team_id, away_team_id, competition = 'regular_season' } = req.body;

      if (!home_team_id || !away_team_id) {
        return res.status(400).json({
          error: 'home_team_id and away_team_id are required',
        });
      }

      // Verify ownership
      const { data: game, error: gameError } = await supabase
        .from('saved_games')
        .select('*')
        .eq('id', id)
        .eq('user_id', req.user.id)
        .single();

      if (gameError || !game) {
        return res.status(404).json({ error: 'Game not found or unauthorized' });
      }

      const simulationResult = await gameService.simulateMatch(
        home_team_id, away_team_id, competition
      );

      // Log to game_logs
      const { data: gameLog, error: logError } = await supabase
        .from('game_logs')
        .insert([{
          saved_game_id: id,
          game_result:   simulationResult,
          home_team_id,
          away_team_id,
          home_score:    simulationResult.home_score,
          away_score:    simulationResult.away_score,
          game_date:     new Date(),
          competition,
          is_playoff:    competition === 'playoffs',
          playoff_round: competition === 'playoffs' ? 1 : null,
          simulated_at:  new Date(),
        }])
        .select()
        .single();

      if (logError) throw logError;

      // Record simulation in game_state
      const updatedGameState = game.game_state || {};
      if (!updatedGameState.simulations) updatedGameState.simulations = [];
      updatedGameState.simulations.push({
        game_log_id: gameLog.id,
        timestamp:   new Date().toISOString(),
        home_team_id,
        away_team_id,
        home_score:  simulationResult.home_score,
        away_score:  simulationResult.away_score,
        competition,
      });

      await supabase
        .from('saved_games')
        .update({ game_state: updatedGameState, updated_at: new Date() })
        .eq('id', id);

      res.json({
        success: true,
        data: { game_log: gameLog, simulation: simulationResult },
        message: 'Game simulated successfully',
      });
    } catch (error) {
      console.error('Simulation error:', error);
      next(error);
    }
  },

  // ── Get game logs for a save file ─────────────────────────────────────
  async getGameLogs(req, res, next) {
    try {
      const { id } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      const { data: game, error: verifyError } = await supabase
        .from('saved_games')
        .select('id')
        .eq('id', id)
        .eq('user_id', req.user.id)
        .single();

      if (verifyError || !game) {
        return res.status(404).json({ error: 'Game not found or unauthorized' });
      }

      const { data: logs, error: logsError } = await supabase
        .from('game_logs')
        .select('*')
        .eq('saved_game_id', id)
        .order('game_date', { ascending: false })
        .range(offset, offset + limit - 1);

      if (logsError) throw logsError;

      res.json({
        success: true,
        data:    logs,
        count:   logs.length,
        limit:   parseInt(limit),
        offset:  parseInt(offset),
      });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = gameController;