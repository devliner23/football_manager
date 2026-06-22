const { supabase } = require('../config/supabase');
const gameService = require('../services/gameService');
const { resolveTeamId } = require("../utils/resolveUUID");

const gameController = {

async createGame(req, res, next) {
  try {
    // 1. Destructure ALL required fields from the request body
    const {
      saved_game_id,
      season_id,
      home_team,          // team name (e.g., "Thunder") or UUID
      away_team,          // team name (e.g., "Lakers") or UUID
      game_date,
      week,               // optional
      status = 'scheduled'
    } = req.body;

    // 2. Validate required fields
    if (!saved_game_id || !season_id || !home_team || !away_team) {
      return res.status(400).json({
        error: 'Missing required fields: saved_game_id, season_id, home_team, away_team'
      });
    }

    // 3. Resolve team names → UUIDs (scoped to the saved game)
    const homeTeamId = await resolveTeamId(saved_game_id, home_team);
    const awayTeamId = await resolveTeamId(saved_game_id, away_team);

    // 4. Insert the game into the `games` table
    const { data, error } = await supabaseAdmin
      .from('games')
      .insert({
        saved_game_id,
        season_id,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        game_date: game_date || new Date().toISOString(),
        week: week || null,
        status: status,
        // other fields will use defaults (home_score, away_score, etc.)
      })
      .select()   // returns the inserted row
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      data,
      message: 'Game created successfully'
    });
  } catch (error) {
    // If the error is from resolveTeamId (team not found)
    if (error.message.startsWith('Team "') && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    console.error('Create game error:', error);
    next(error);
  }
},
  // Get game by ID
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
      
      // Update last_played
      await supabase
        .from('saved_games')
        .update({ last_played: new Date() })
        .eq('id', id);
      
      res.json({
        success: true,
        data: game
      });
    } catch (error) {
      next(error);
    }
  },
  
  // Update game state
  async updateGame(req, res, next) {
    try {
      const { id } = req.params;
      const { game_state, current_season, current_game_date, name } = req.body;
      
      // First verify ownership
      const { data: existing, error: verifyError } = await supabase
        .from('saved_games')
        .select('id')
        .eq('id', id)
        .eq('user_id', req.user.id)
        .single();
      
      if (verifyError || !existing) {
        return res.status(404).json({ error: 'Game not found or unauthorized' });
      }
      
      const updateData = {
        updated_at: new Date()
      };
      
      if (name) updateData.name = name;
      if (game_state) updateData.game_state = game_state;
      if (current_season) updateData.current_season = current_season;
      if (current_game_date) updateData.current_game_date = current_game_date;
      
      const { data: game, error } = await supabase
        .from('saved_games')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', req.user.id)
        .select()
        .single();
      
      if (error) throw error;
      
      res.json({
        success: true,
        data: game,
        message: 'Game updated successfully'
      });
    } catch (error) {
      next(error);
    }
  },
  
  // Delete game
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
      
      res.json({
        success: true,
        message: 'Game deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  },
  
  // Simulate a game
  async simulateGame(req, res, next) {
    try {
      const { id } = req.params;
      const { home_team_id, away_team_id, competition = 'regular_season' } = req.body;
      
      if (!home_team_id || !away_team_id) {
        return res.status(400).json({ 
          error: 'Home team and away team are required' 
        });
      }
      
      // Verify game ownership
      const { data: game, error: gameError } = await supabase
        .from('saved_games')
        .select('*')
        .eq('id', id)
        .eq('user_id', req.user.id)
        .single();
      
      if (gameError || !game) {
        return res.status(404).json({ error: 'Game not found or unauthorized' });
      }
      
      // Simulate the match
      const simulationResult = await gameService.simulateMatch(
        home_team_id,
        away_team_id,
        competition
      );
      
      // Save game log
      const { data: gameLog, error: logError } = await supabase
        .from('game_logs')
        .insert([{
          saved_game_id: id,
          game_result: simulationResult,
          home_team_id,
          away_team_id,
          home_score: simulationResult.home_score,
          away_score: simulationResult.away_score,
          game_date: new Date(),
          competition: competition,
          is_playoff: competition === 'playoffs',
          playoff_round: competition === 'playoffs' ? 1 : null,
          simulated_at: new Date()
        }])
        .select()
        .single();
      
      if (logError) throw logError;
      
      // Update game state with new standings or data
      const updatedGameState = game.game_state || {};
      // Add simulation result to game state
      if (!updatedGameState.simulations) {
        updatedGameState.simulations = [];
      }
      updatedGameState.simulations.push({
        game_log_id: gameLog.id,
        timestamp: new Date().toISOString(),
        home_team_id,
        away_team_id,
        home_score: simulationResult.home_score,
        away_score: simulationResult.away_score,
        competition
      });
      
      // Update game with new state
      await supabase
        .from('saved_games')
        .update({
          game_state: updatedGameState,
          updated_at: new Date()
        })
        .eq('id', id);
      
      res.json({
        success: true,
        data: {
          game_log: gameLog,
          simulation: simulationResult
        },
        message: 'Game simulated successfully'
      });
    } catch (error) {
      console.error('Simulation error:', error);
      next(error);
    }
  },
  
  // Get game logs
  async getGameLogs(req, res, next) {
    try {
      const { id } = req.params;
      const { limit = 50, offset = 0 } = req.query;
      
      // Verify ownership
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
        data: logs,
        count: logs.length,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = gameController;