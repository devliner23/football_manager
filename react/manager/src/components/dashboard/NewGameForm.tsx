import React, { useState } from 'react';
import { gameAPI } from '../../api/client';
import { leagueAPI } from '../../api/leagueApi';
import { SavedGame } from '../../shared';
import './Dashboard.css';

interface NewGameFormProps {
  onClose: () => void;
  onGameCreated: (game: SavedGame) => void;
}

interface Team {
  city: string;
  name: string;
}

const teams: Team[] = [
  { city: 'Atlanta', name: 'Embers' },
  { city: 'Boston', name: 'Sentinels' },
  { city: 'Brooklyn', name: 'Anchors' },
  { city: 'Charlotte', name: 'Sovereigns' },
  { city: 'Chicago', name: 'Gales' },
  { city: 'Cleveland', name: 'Anvils' },
  { city: 'Dallas', name: 'Wranglers' },
  { city: 'Denver', name: 'Apex' },
  { city: 'Detroit', name: 'Forge' },
  { city: 'Golden State', name: 'Prospectors' },
  { city: 'Houston', name: 'Orbit' },
  { city: 'Indiana', name: 'Chariots' },
  { city: 'Los Angeles', name: 'Waves' },
  { city: 'Los Angeles', name: 'Luminaries' },
  { city: 'Memphis', name: 'Pharaohs' },
  { city: 'Miami', name: 'Tempest' },
  { city: 'Milwaukee', name: 'Masons' },
  { city: 'Minnesota', name: 'Voyageurs' },
  { city: 'New Orleans', name: 'Krewe' },
  { city: 'New York', name: 'Skyliners' },
  { city: 'Oklahoma City', name: 'Twisters' },
  { city: 'Orlando', name: 'Spells' },
  { city: 'Philadelphia', name: 'Bellringers' },
  { city: 'Phoenix', name: 'Solar Flares' },
  { city: 'Portland', name: 'Cascades' },
  { city: 'Sacramento', name: 'Miners' },
  { city: 'San Antonio', name: 'Toros' },
  { city: 'Toronto', name: 'Aurora' },
  { city: 'Utah', name: 'Monoliths' },
  { city: 'Washington', name: 'Monuments' },
];

const NewGameForm: React.FC<NewGameFormProps> = ({ onClose, onGameCreated }) => {
  const [formData, setFormData] = useState({
    managed_club_id: '',
    difficulty: 'pro' as 'rookie' | 'pro' | 'all_star' | 'hall_of_fame',
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Find the selected team object for the highlight
  const selectedTeam = teams.find((t) => t.name === formData.managed_club_id);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (!formData.managed_club_id) {
      setError('Please select your team');
      return;
    }

    setLoading(true);
    try {
      const gameName = formData.managed_club_id;

      const response = await gameAPI.createGame({
        name: gameName,
        managed_club_id: formData.managed_club_id,
        difficulty: formData.difficulty,
      });

      if (response.data.success && response.data.data) {
        const savedGame = response.data.data;
        await leagueAPI.initializeLeague(savedGame.id, {
          season: 1,
          managedClub: formData.managed_club_id,
        });
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
        {/* Team Selection */}
        <div className="form-group">
          <label htmlFor="team">Your Team</label>

          {/* Highlighted selected team */}
          {selectedTeam && (
            <div className="selected-team-highlight">
              <span className="highlight-icon">🏀</span>
              <span className="highlight-text">
                {selectedTeam.city} {selectedTeam.name}
              </span>
            </div>
          )}

          <div className="input-wrapper">
            <span className="input-icon">🏀</span>
            <select
              id="team"
              value={formData.managed_club_id}
              onChange={(e) =>
                setFormData({ ...formData, managed_club_id: e.target.value })
              }
              disabled={loading}
              required
            >
              <option value="">Choose your franchise</option>
              {teams.map((team) => (
                <option key={team.name} value={team.name}>
                  {team.city} {team.name}
                </option>
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
              onChange={(e) =>
                setFormData({
                  ...formData,
                  difficulty: e.target.value as
                    | 'rookie'
                    | 'pro'
                    | 'all_star'
                    | 'hall_of_fame',
                })
              }
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
          <button
            type="button"
            onClick={onClose}
            className="cancel-button"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="create-button"
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Start Season'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default NewGameForm;