import React, { useState, useEffect } from 'react';
import { SavedGame } from '../../types';
import { leagueAPI, Team, Player, StandingsRow } from '../../api/leagueApi';
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
  onUpdate,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'roster' | 'standings'>('overview');
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [standings, setStandings] = useState<StandingsRow[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);

  // Load all league data
  const loadLeagueData = async () => {
    setLoading(true);
    try {
      const [teamsRes, playersRes, standingsRes] = await Promise.all([
        leagueAPI.getTeams(game.id),
        leagueAPI.getPlayers(game.id),
        leagueAPI.getStandings(game.id),
      ]);

      if (teamsRes.data.success) setTeams(teamsRes.data.data);
      if (playersRes.data.success) setPlayers(playersRes.data.data);
      if (standingsRes.data.success) setStandings(standingsRes.data.data);
    } catch (error) {
      console.error('Failed to load league data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeagueData();
  }, [game.id]);

  // Helpers
  const getTeamById = (teamId: string) => teams.find((t) => t.id === teamId);
  const getPlayersForTeam = (teamId: string) =>
    players.filter((p) => p.team_id === teamId);

  const userTeam = teams.find(
    (t) => t.team_id === game.managed_club_id || t.id === game.managed_club_id
  );
  const userTeamPlayers = userTeam ? getPlayersForTeam(userTeam.id) : [];

  // Combine team details with standings
  const standingsWithTeam = standings.map((row) => {
    const team = getTeamById(row.team_id);
    return { ...row, team };
  });

  // Record and win %
  const record = userTeam
    ? `${userTeam.wins ?? 0}-${userTeam.losses ?? 0}`
    : '0-0';
  const winPct =
    userTeam && (userTeam.wins ?? 0) + (userTeam.losses ?? 0) > 0
      ? (((userTeam.wins ?? 0) / ((userTeam.wins ?? 0) + (userTeam.losses ?? 0))) * 100).toFixed(1)
      : '0.0';

  // PPG / OPPG – we don't have points_for/against in the current schema,
  // so we compute from team_season_stats? Not available. We'll keep as placeholder.
  const ppg = userTeam ? 'N/A' : '0.0';
  const oppg = userTeam ? 'N/A' : '0.0';

  const getPlayerName = (player: Player) => `${player.first_name} ${player.last_name}`;

  const leaderByStat = (stat: 'points' | 'rebounds' | 'assists') => {
    const leader = [...userTeamPlayers].sort((a, b) => (b[stat] ?? 0) - (a[stat] ?? 0))[0];
    return leader ? getPlayerName(leader) : '-';
  };

  // Handlers
  const handleSimulate = async () => {
    if (!window.confirm('Simulate the entire season?')) return;
    setLoading(true);
    try {
      await leagueAPI.simulateSeason(game.id);
      // Refresh data to show updated standings and team records
      await loadLeagueData();
      // Optionally update saved game's current_season via onUpdate or refetch
      // For simplicity, we reload the game from parent? We'll call onUpdate with updated game?
      // Better to fetch the updated saved_game from the backend, but that's outside this component.
      // We'll just reload league data.
    } catch (error) {
      console.error('Simulation failed:', error);
      alert('Simulation failed. Check console.');
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    // If you have a "next game" concept, implement it here.
    // For now, just simulate the next game (or season) as a placeholder.
    handleSimulate();
  };

  return (
    <div className="selected-game-fullscreen">
      {/* Header */}
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
        {/* Sidebar */}
        <div className="game-sidebar">
          <div className="game-sidebar-section">
            <h4>Season {game.current_season}</h4>
            <div className="sidebar-record">
              <span className="sidebar-wins">{userTeam?.wins ?? 0}</span>
              <span className="sidebar-dash">-</span>
              <span className="sidebar-losses">{userTeam?.losses ?? 0}</span>
            </div>
            <div className="sidebar-pct">Win %: {winPct}%</div>
          </div>

          <div className="game-sidebar-section">
            <h4>Quick Stats</h4>
            <div className="sidebar-stat">
              <span className="sidebar-stat-label">PPG</span>
              <span className="sidebar-stat-value">{ppg}</span>
            </div>
            <div className="sidebar-stat">
              <span className="sidebar-stat-label">OPPG</span>
              <span className="sidebar-stat-value">{oppg}</span>
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
              onClick={handleContinue}
              disabled={loading}
            >
              ▶ Continue
            </button>
            <button
              className="sidebar-action-btn success"
              onClick={handleSimulate}
              disabled={loading}
            >
              ⚡ Simulate
            </button>
            <button
              className="sidebar-action-btn info"
              onClick={() => setActiveTab('standings')}
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
          </div>

          {/* Tab Content */}
          <div className="tab-content">
            {loading && <div className="loading-spinner">Loading...</div>}

            {!loading && activeTab === 'overview' && (
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

                    {/* Inside the overview panel */}
                  <div className="info-card">
                    <h4>Team Leaders</h4>
                    {userTeamPlayers.length > 0 ? (
                        <>
                        <div className="info-row">
                            <span className="info-label">Points</span>
                            <span className="info-value">{leaderByStat('points')}</span>
                        </div>
                        <div className="info-row">
                            <span className="info-label">Rebounds</span>
                            <span className="info-value">{leaderByStat('rebounds')}</span>
                        </div>
                        <div className="info-row">
                            <span className="info-label">Assists</span>
                            <span className="info-value">{leaderByStat('assists')}</span>
                        </div>
                        </>
                    ) : (
                        <div className="info-row">No players yet</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!loading && activeTab === 'roster' && (
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
                        <tr key={player.id}>
                          <td>{index + 1}</td>
                          <td>{`${player.first_name} ${player.last_name}`}</td>
                          <td>{player.position}</td>
                          <td><span className="rating">{player.overall_rating}</span></td>
                          <td>{player.points || 0}</td>
                          <td>{player.rebounds || 0}</td>
                          <td>{player.assists || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!loading && activeTab === 'standings' && (
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
                      {standingsWithTeam.map((row) => (
                        <tr
                          key={row.team_id}
                          className={row.team_id === userTeam?.id ? 'highlighted' : ''}
                        >
                          <td>{row.team?.name || 'Unknown'}</td>
                          <td>{row.wins}</td>
                          <td>{row.losses}</td>
                          <td>
                            {row.wins + row.losses > 0
                              ? ((row.wins / (row.wins + row.losses)) * 100).toFixed(1)
                              : '0.0'}
                            %
                          </td>
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