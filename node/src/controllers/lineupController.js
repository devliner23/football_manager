// controllers/lineupController.js
const { supabaseAdmin } = require('../config/supabase');
const LineupService = require('../services/lineupService');

async function loadOwnedGame(savedGameId, userId) {
  const { data: game, error } = await supabaseAdmin
    .from('saved_games')
    .select('id')
    .eq('id', savedGameId)
    .eq('user_id', userId)
    .single();
  if (error || !game) return null;
  return game;
}

const lineupController = {

  // GET /api/lineup/:savedGameId/:teamId
  async getLineup(req, res, next) {
    try {
      const { savedGameId, teamId } = req.params;
      const game = await loadOwnedGame(savedGameId, req.user.id);
      if (!game) return res.status(404).json({ error: 'Game not found or unauthorized' });

      const lineupService = new LineupService(savedGameId);
      const lineup = await lineupService.getLineup(teamId);
      res.json({ success: true, data: lineup });
    } catch (error) {
      next(error);
    }
  },

  // PUT /api/lineup/:savedGameId/:teamId
  // body: { starters: string[5], rotation?: string[], minutesTargets?: { [playerId]: number } }
  async setLineup(req, res, next) {
    try {
      const { savedGameId, teamId } = req.params;
      const { starters, rotation, minutesTargets } = req.body;

      const game = await loadOwnedGame(savedGameId, req.user.id);
      if (!game) return res.status(404).json({ error: 'Game not found or unauthorized' });

      const lineupService = new LineupService(savedGameId);
      const lineup = await lineupService.setLineup(teamId, { starters, rotation, minutesTargets });

      res.json({ success: true, message: 'Lineup updated successfully', data: lineup });
    } catch (error) {
      if (error.message?.startsWith('Validation:')) {
        return res.status(400).json({ error: error.message.replace('Validation: ', '') });
      }
      console.error('Set lineup error:', error);
      next(error);
    }
  },

  // POST /api/lineup/:savedGameId/:teamId/auto
  async resetLineup(req, res, next) {
    try {
      const { savedGameId, teamId } = req.params;
      const game = await loadOwnedGame(savedGameId, req.user.id);
      if (!game) return res.status(404).json({ error: 'Game not found or unauthorized' });

      const lineupService = new LineupService(savedGameId);
      const lineup = await lineupService.resetToAuto(teamId);
      res.json({ success: true, message: 'Lineup reset to auto-assigned', data: lineup });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = lineupController;