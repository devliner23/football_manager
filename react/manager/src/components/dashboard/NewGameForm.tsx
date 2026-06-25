import React, { useState } from 'react';
import { gameAPI } from '../../api/client';
import { leagueAPI } from '../../api/leagueApi';
import { SavedGame } from '../../shared';
import './Dashboard.css';

interface NewGameFormProps {
  onClose: () => void;
  onGameCreated: (game: SavedGame) => void;
}

const NewGameForm: React.FC<NewGameFormProps> = ({ onClose, onGameCreated }) => {
  const [formData, setFormData] = useState({
    managed_club_id: '',
    difficulty: 'pro' as 'rookie' | 'pro' | 'all_star' | 'hall_of_fame',
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const teams: string[] = [
    'Lakers', 'Celtics', 'Bulls', 'Warriors', 'Heat',
    'Nuggets', 'Suns', '76ers', 'Bucks', 'Mavericks',
    'Nets', 'Clippers', 'Knicks', 'Raptors', 'Grizzlies',
    'Hawks', 'Magic', 'Spurs', 'Thunder', 'Timberwolves'
  ];

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (!formData.managed_club_id) {
      setError('Please select your team');
      return;
    }

    setLoading(true);
    try {
      // Game name is automatically set to the selected team name
      const gameName = formData.managed_club_id;

      // 1. Create the saved game with auto‑generated name
      const response = await gameAPI.createGame({
        name: gameName,
        managed_club_id: formData.managed_club_id,
        difficulty: formData.difficulty,
      });

      if (response.data.success && response.data.data) {
        const savedGame = response.data.data;

        // 2. Initialize the league
        await leagueAPI.initializeLeague(savedGame.id, {
          season: 1,
          managedClub: formData.managed_club_id,
        });

        // 3. Pass the game to parent
        onGameCreated(savedGame);
      } else {
        setError('Failed to create game');
      }
    } catch (err: any) {
      console.error('Failed to create game or initialize league:', err);
      setError(err.response?.data?.error || 'Failed to create game');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="new-game-form">
      <div className="form-header">
        <h2>Start New Season</h2>
        <button onClick={onClose} className="close-button" disabled={loading}>✕</button>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Team Selection (required) */}
        <div className="form-group">
          <label htmlFor="team">Your Team</label>
          <div className="input-wrapper">
            <span className="input-icon">🏀</span>
            <select
              id="team"
              value={formData.managed_club_id}
              onChange={(e) => setFormData({ ...formData, managed_club_id: e.target.value })}
              disabled={loading}
              required
            >
              <option value="">Choose your franchise</option>
              {teams.map(team => (
                <option key={team} value={team}>{team}</option>
              ))}
            </select>
            <span className="dropdown-arrow">▾</span>
          </div>
        </div>

        {/* Difficulty */}
        <div className="form-group">
          <label htmlFor="difficulty">Difficulty</label>
          <div className="input-wrapper">
            <span className="input-icon">⚡</span>
            <select
              id="difficulty"
              value={formData.difficulty}
              onChange={(e) => setFormData({
                ...formData,
                difficulty: e.target.value as 'rookie' | 'pro' | 'all_star' | 'hall_of_fame'
              })}
              disabled={loading}
            >
              <option value="rookie">Rookie</option>
              <option value="pro">Pro</option>
              <option value="all_star">All-Star</option>
              <option value="hall_of_fame">Hall of Fame</option>
            </select>
            <span className="dropdown-arrow">▾</span>
          </div>
        </div>

        {error && (
          <div className="error-message">
            <span>⚠️</span> {error}
          </div>
        )}

        <div className="form-actions">
          <button type="button" onClick={onClose} className="cancel-button" disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="create-button" disabled={loading}>
            {loading ? 'Creating...' : 'Start Season'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default NewGameForm;