// NewGameForm.tsx
import React, { useState, useEffect } from 'react';
import { gameAPI } from '../../api/client';
import { leagueAPI } from '../../api/leagueApi';
import { SavedGame } from '../../shared';
import NewGameTeamData from '../pages/tabs/tabComponents/NewGameTeamData';
import './Dashboard.css';

interface NewGameFormProps {
  onClose: () => void;
  onGameCreated: (game: SavedGame) => void;
}

interface Team {
  city: string;
  name: string;
  primaryColor: string;
}

const teams: Team[] = [
  // same team list as before with primaryColor ...
  { city: 'Atlanta', name: 'Embers', primaryColor: '#E03A3E' },
  { city: 'Boston', name: 'Sentinels', primaryColor: '#007A33' },
  { city: 'Brooklyn', name: 'Anchors', primaryColor: '#000000' },
  { city: 'Charlotte', name: 'Sovereigns', primaryColor: '#00788C' },
  { city: 'Chicago', name: 'Gales', primaryColor: '#CE1141' },
  { city: 'Cleveland', name: 'Anvils', primaryColor: '#860038' },
  { city: 'Dallas', name: 'Wranglers', primaryColor: '#0053BC' },
  { city: 'Denver', name: 'Apex', primaryColor: '#0E2240' },
  { city: 'Detroit', name: 'Forge', primaryColor: '#C8102E' },
  { city: 'Golden State', name: 'Prospectors', primaryColor: '#1D428A' },
  { city: 'Houston', name: 'Orbit', primaryColor: '#CE1141' },
  { city: 'Indiana', name: 'Chariots', primaryColor: '#002D62' },
  { city: 'Los Angeles', name: 'Waves', primaryColor: '#552583' },
  { city: 'Los Angeles', name: 'Luminaries', primaryColor: '#1D428A' },
  { city: 'Memphis', name: 'Pharaohs', primaryColor: '#5D76A9' },
  { city: 'Miami', name: 'Tempest', primaryColor: '#98002E' },
  { city: 'Milwaukee', name: 'Masons', primaryColor: '#00471B' },
  { city: 'Minnesota', name: 'Voyageurs', primaryColor: '#0C2340' },
  { city: 'New Orleans', name: 'Krewe', primaryColor: '#0C2340' },
  { city: 'New York', name: 'Skyliners', primaryColor: '#006BB6' },
  { city: 'Oklahoma City', name: 'Twisters', primaryColor: '#007AC1' },
  { city: 'Orlando', name: 'Spells', primaryColor: '#0077C0' },
  { city: 'Philadelphia', name: 'Bellringers', primaryColor: '#006BB6' },
  { city: 'Phoenix', name: 'Solar Flares', primaryColor: '#1D1160' },
  { city: 'Portland', name: 'Cascades', primaryColor: '#E03A3E' },
  { city: 'Sacramento', name: 'Miners', primaryColor: '#5A2D81' },
  { city: 'San Antonio', name: 'Toros', primaryColor: '#000000' },
  { city: 'Toronto', name: 'Aurora', primaryColor: '#CE1141' },
  { city: 'Utah', name: 'Monoliths', primaryColor: '#002B5C' },
  { city: 'Washington', name: 'Monuments', primaryColor: '#002B5C' },
];

const NewGameForm: React.FC<NewGameFormProps> = ({ onClose, onGameCreated }) => {
  const [formData, setFormData] = useState({
    managed_club_id: '',
    difficulty: 'pro' as 'rookie' | 'pro' | 'all_star' | 'hall_of_fame',
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [teamData, setTeamData] = useState<any>(null);

  const selectedTeam = teams.find((t) => t.name === formData.managed_club_id);

  useEffect(() => {
  if (formData.managed_club_id) {
    // Example: fetch from a local JSON file or an API
    fetch('/api/teams')  // or import teams.json directly
      .then(res => res.json())
      .then(allTeams => {
        const found = allTeams.find(
          (t: any) => t.name === formData.managed_club_id
        );
        setTeamData(found || null);
      })
      .catch(() => setTeamData(null));
  } else {
    setTeamData(null);
  }
}, [formData.managed_club_id]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    // unchanged
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
        <button onClick={onClose} className="close-button" disabled={loading}>
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-group">

          {/* Glass-tinted name display */}
          {selectedTeam && (
            <span
                className="glass-team-name"
                style={{
                '--team-color': selectedTeam.primaryColor,
                } as React.CSSProperties}
            >
                {selectedTeam.city} {selectedTeam.name}
            </span>
          )}
          {teamData && <NewGameTeamData teamName={teamData} />}


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

        {/* ... rest unchanged */}
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