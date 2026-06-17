import React, { useState, useEffect } from 'react';
import { SavedGame } from '../../types';
import { leagueAPI, Team, Player } from '../../api/leagueApi';
import './SelectedGame.css';

interface SelectedGameProps {
  game: SavedGame;
  onBack: () => void;
  onDelete: (id: string) => void;
  onUpdate: (game: SavedGame) => void;
}

const SelectedGame: React.FC<SelectedGameProps> = ({ 
  game, 
  onBack, 
  onDelete,
  onUpdate 
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'roster' | 'schedule' | 'standings' | 'stats' | 'trades'>('overview');
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [standings, setStandings] = useState<any[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);

  useEffect(() => {
    loadLeagueData();
  }, [game.id]);

  const loadLeagueData = async () => {
    setLoading(true);
    try {
      // Fetch league data for the current season
      const response = await leagueAPI.getLeagueData(game.id, game.current_season);
      if (response.data.success) {
        const data = response.data.data;
        setTeams(data.teams);
        setPlayers(data.players);
        setStandings(data.standings);
      }
    } catch (error) {
      console.error('Failed to load league data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Helper to get team by ID
  const getTeamById = (teamId: string) => teams.find(t => t.team_id === teamId);

  // Helper to get players for a team
  const getPlayersForTeam = (teamId: string) => 
    players.filter(p => p.team_id === teamId);

  // Get the user's team
  const userTeam = teams.find(t => t.team_id === game.managed_club_id);
  const userTeamPlayers = userTeam ? getPlayersForTeam(userTeam.team_id) : [];

  // Calculate team record
  const record = userTeam ? `${userTeam.wins}-${userTeam.losses}` : '0-0';
  const winPct = userTeam && (userTeam.wins + userTeam.losses) > 0 
    ? (userTeam.wins / (userTeam.wins + userTeam.losses) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="selected-game-fullscreen">
      {/* Header with real data */}
      <header className="game-global-header">
        <div className="game-global-header-content">
          <div className="game-global-header-left">
            <button className="back-to-dashboard-btn" onClick={onBack}>
              ← Back to Dashboard
            </button>
            <span className="game-title-badge">🏀 {game.name}</span>
          </div>
          <div className="game-global-header-right">
            <span className="game-status">● LIVE</span>
            <span className="game-record">{record} ({winPct}%)</span>
            <button 
              className="delete-game-btn"
              onClick={() => {
                if (window.confirm(`Delete "${game.name}"?`)) {
                  onDelete(game.id);
                }
              }}
            >
              🗑️
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="game-fullscreen-content">
        {/* Sidebar - Show real team stats */}
        <div className="game-sidebar">
          <div className="game-sidebar-section">
            <h4>Season {game.current_season}</h4>
            <div className="sidebar-record">
              <span className="sidebar-wins">{userTeam?.wins || 0}</span>
              <span className="sidebar-dash">-</span>
              <span className="sidebar-losses">{userTeam?.losses || 0}</span>
            </div>
            <div className="sidebar-pct">Win %: {winPct}%</div>
          </div>

          <div className="game-sidebar-section">
            <h4>Quick Stats</h4>
            <div className="sidebar-stat">
              <span className="sidebar-stat-label">PPG</span>
              <span className="sidebar-stat-value">
                {userTeam ? (userTeam.points_for / (userTeam.wins + userTeam.losses)).toFixed(1) : '0.0'}
              </span>
            </div>
            <div className="sidebar-stat">
              <span className="sidebar-stat-label">OPPG</span>
              <span className="sidebar-stat-value">
                {userTeam ? (userTeam.points_against / (userTeam.wins + userTeam.losses)).toFixed(1) : '0.0'}
              </span>
            </div>
            <div className="sidebar-stat">
              <span className="sidebar-stat-label">Players</span>
              <span className="sidebar-stat-value">{userTeamPlayers.length}</span>
            </div>
          </div>

          <div className="game-sidebar-section">
            <h4>Actions</h4>
            <button 
              className="sidebar-action-btn primary"
              onClick={() => {/* Continue season */}}
            >
              ▶ Continue
            </button>
            <button 
              className="sidebar-action-btn success"
              onClick={() => {/* Simulate next game */}}
            >
              ⚡ Simulate
            </button>
            <button 
              className="sidebar-action-btn info"
              onClick={() => {/* View standings */}}
            >
              📊 Standings
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="game-main-content">
          {/* Tab Navigation */}
          <div className="tab-navigation">
            <button 
              className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              📊 Overview
            </button>
            <button 
              className={`tab-btn ${activeTab === 'roster' ? 'active' : ''}`}
              onClick={() => setActiveTab('roster')}
            >
              👥 Roster ({userTeamPlayers.length})
            </button>
            <button 
              className={`tab-btn ${activeTab === 'standings' ? 'active' : ''}`}
              onClick={() => setActiveTab('standings')}
            >
              📈 Standings
            </button>
            {/* Add more tabs */}
          </div>

          {/* Tab Content with real data */}
          <div className="tab-content">
            {activeTab === 'overview' && (
              <div className="tab-panel overview-panel">
                <div className="overview-grid">
                  <div className="info-card">
                    <h4>Team Information</h4>
                    <div className="info-row">
                      <span className="info-label">Team</span>
                      <span className="info-value">{userTeam?.name || 'N/A'}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Conference</span>
                      <span className="info-value">{userTeam?.conference || 'N/A'}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Division</span>
                      <span className="info-value">{userTeam?.division || 'N/A'}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Season</span>
                      <span className="info-value">{game.current_season}</span>
                    </div>
                  </div>

                  <div className="info-card">
                    <h4>Team Leaders</h4>
                    {userTeamPlayers.length > 0 ? (
                      <>
                        <div className="info-row">
                          <span className="info-label">Points</span>
                          <span className="info-value">
                            {userTeamPlayers.sort((a,b) => b.points - a.points)[0]?.first_name || '-'}
                          </span>
                        </div>
                        <div className="info-row">
                          <span className="info-label">Rebounds</span>
                          <span className="info-value">
                            {userTeamPlayers.sort((a,b) => b.rebounds - a.rebounds)[0]?.first_name || '-'}
                          </span>
                        </div>
                        <div className="info-row">
                          <span className="info-label">Assists</span>
                          <span className="info-value">
                            {userTeamPlayers.sort((a,b) => b.assists - a.assists)[0]?.first_name || '-'}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="info-row">No players yet</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'roster' && (
              <div className="tab-panel roster-panel">
                <div className="roster-header">
                  <h4>Team Roster</h4>
                </div>
                <div className="roster-table">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>Position</th>
                        <th>Rating</th>
                        <th>PPG</th>
                        <th>RPG</th>
                        <th>APG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userTeamPlayers.map((player, index) => (
                        <tr key={player.player_id}>
                          <td>{index + 1}</td>
                          <td>{player.first_name} {player.last_name}</td>
                          <td>{player.position}</td>
                          <td><span className="rating">{player.overall_rating}</span></td>
                          <td>{player.points}</td>
                          <td>{player.rebounds}</td>
                          <td>{player.assists}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'standings' && (
              <div className="tab-panel standings-panel">
                <h4>League Standings</h4>
                <div className="standings-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Team</th>
                        <th>W</th>
                        <th>L</th>
                        <th>PCT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((team) => (
                        <tr key={team.team_id} className={team.team_id === game.managed_club_id ? 'highlighted' : ''}>
                          <td>{team.name}</td>
                          <td>{team.wins}</td>
                          <td>{team.losses}</td>
                          <td>{((team.wins / (team.wins + team.losses)) * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SelectedGame;