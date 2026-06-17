import React, { useState, useEffect } from 'react';
import { SavedGame } from '../../types';
import { leagueAPI, Team, Player, StandingsRow } from '../../api/leagueApi';
import GameResults from './GameResults';
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
  const [activeTab, setActiveTab] = useState<'overview' | 'roster' | 'standings' | 'trade' | 'freeagents' | 'frontoffice'>('overview');
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [standings, setStandings] = useState<StandingsRow[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);


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

  // PPG / OPPG – placeholder
  const ppg = userTeam ? 'N/A' : '0.0';
  const oppg = userTeam ? 'N/A' : '0.0';

  const getPlayerName = (player: Player) => `${player.first_name} ${player.last_name}`;

  const leaderByStat = (stat: 'points' | 'rebounds' | 'assists') => {
    const leader = [...userTeamPlayers].sort((a, b) => (b[stat] ?? 0) - (a[stat] ?? 0))[0];
    return leader ? getPlayerName(leader) : '-';
  };

  // League leaders (top 5 across all players)
  const leagueLeaders = (stat: 'points' | 'rebounds' | 'assists') => {
    return [...players]
      .sort((a, b) => (b[stat] ?? 0) - (a[stat] ?? 0))
      .slice(0, 5)
      .map(p => ({ name: getPlayerName(p), value: p[stat] ?? 0 }));
  };

  // Team averages from players
  const teamAverages = () => {
    if (userTeamPlayers.length === 0) return { pts: 0, reb: 0, ast: 0 };
    const total = userTeamPlayers.reduce(
      (acc, p) => ({
        pts: acc.pts + (p.points ?? 0),
        reb: acc.reb + (p.rebounds ?? 0),
        ast: acc.ast + (p.assists ?? 0),
      }),
      { pts: 0, reb: 0, ast: 0 }
    );
    const count = userTeamPlayers.length;
    return {
      pts: (total.pts / count).toFixed(1),
      reb: (total.reb / count).toFixed(1),
      ast: (total.ast / count).toFixed(1),
    };
  };
  const avg = teamAverages();

  // Handlers
  const handleSimulate = async () => {
    if (!window.confirm('Simulate the entire season?')) return;
    setLoading(true);
    try {
      await leagueAPI.simulateSeason(game.id);
      await loadLeagueData();
    } catch (error) {
      console.error('Simulation failed:', error);
      alert('Simulation failed. Check console.');
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = async () => {
    setLoading(true);
    try {
        const response = await leagueAPI.simulateWeek(game.id);
        if (response.data.success) {
        // Reload all data to reflect updated standings, rosters, etc.
        await loadLeagueData();

        if (response.data.seasonComplete) {
            alert('🏆 Season complete!');
            // Optionally disable further simulation
        } else {
            const gameCount = response.data.games?.length || 0;
            console.log(`Simulated ${gameCount} games for week ${response.data.week}`);
        }
        }
    } catch (error) {
        console.error('Failed to simulate week:', error);
        alert('Failed to simulate games. Check console.');
    } finally {
        setLoading(false);
    }
  };

  // Helper to generate a consistent color from a string
  const stringToColor = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 70%, 55%)`;
  };

  // Group standings by conference/division
  const groupedStandings = () => {
    const groups: { conference: string; division: string; rows: typeof standingsWithTeam }[] = [];
    const map = new Map<string, typeof standingsWithTeam>();
    standingsWithTeam.forEach(row => {
      const team = row.team;
      if (!team) return;
      const key = `${team.conference}-${team.division}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    });
    // for (const [key, rows] of map.entries()) {
    //   const [conference, division] = key.split('-');
    //   groups.push({ conference, division, rows });
    // }
    // Sort by conference then division
    groups.sort((a, b) => a.conference.localeCompare(b.conference) || a.division.localeCompare(b.division));
    return groups;
  };

  return (
    <div className="selected-game-fullscreen">
      {/* Header */}
      <header className="game-global-header">
        <div className="game-global-header-top">
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
        <nav className="game-global-nav">
          <button
            className={`nav-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            📊 Dashboard
          </button>
          <button
            className={`nav-btn ${activeTab === 'roster' ? 'active' : ''}`}
            onClick={() => setActiveTab('roster')}
          >
            👥 Rosters
          </button>
          <button
            className={`nav-btn ${activeTab === 'standings' ? 'active' : ''}`}
            onClick={() => setActiveTab('standings')}
          >
            📈 Standings
          </button>
          <button
            className={`nav-btn ${activeTab === 'trade' ? 'active' : ''}`}
            onClick={() => setActiveTab('trade')}
          >
            🔄 Trade Center
          </button>
          <button
            className={`nav-btn ${activeTab === 'freeagents' ? 'active' : ''}`}
            onClick={() => setActiveTab('freeagents')}
          >
            📋 Free Agents
          </button>
          <button
            className={`nav-btn ${activeTab === 'frontoffice' ? 'active' : ''}`}
            onClick={() => setActiveTab('frontoffice')}
          >
            🏢 Front Office
          </button>
        </nav>
      </header>

      {/* Main Content */}
      <div className="game-fullscreen-content">
        {/* Sidebar */}
        <aside className="game-sidebar">
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
        </aside>

        {/* Main Content Area */}
        <main className="game-main-content">
          <div className="tab-content">
            {loading && <div className="loading-spinner">Loading...</div>}

            {!loading && activeTab === 'overview' && (
              <div className="tab-panel overview-panel">
                <div className="overview-grid">
                  {/* Team Information Card */}
                  <div className="info-card full-width">
                    <GameResults 
                    savedGameId={game.id}
                    onGameClick={(gameId) => setSelectedGameId(gameId)}
                    />
                  </div>
                  <div className="info-card">
                    <h4>🏷️ Team Information</h4>
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
                    <div className="info-row">
                      <span className="info-label">Record</span>
                      <span className="info-value record-value">{record}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Win %</span>
                      <span className="info-value">{winPct}%</span>
                    </div>
                  </div>

                  {/* Team Leaders Card */}
                  <div className="info-card">
                    <h4>🏆 Team Leaders</h4>
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

                  {/* Team Averages Card */}
                  <div className="info-card">
                    <h4>📊 Team Averages (per player)</h4>
                    <div className="info-row">
                      <span className="info-label">Points</span>
                      <span className="info-value">{avg.pts}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Rebounds</span>
                      <span className="info-value">{avg.reb}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Assists</span>
                      <span className="info-value">{avg.ast}</span>
                    </div>
                  </div>

                                    <div className="info-card">
                    <h4>📊 Team Averages (per player)</h4>
                    <div className="info-row">
                      <span className="info-label">Points</span>
                      <span className="info-value">{avg.pts}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Rebounds</span>
                      <span className="info-value">{avg.reb}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Assists</span>
                      <span className="info-value">{avg.ast}</span>
                    </div>
                  </div>

                  {/* League Leaders Card */}
                  <div className="info-card full-width">
                    <h4>🌟 League Leaders</h4>
                    <div className="league-leaders-grid">
                      <div>
                        <h5>Points</h5>
                        {leagueLeaders('points').map((p, i) => (
                          <div key={i} className="leader-row">
                            <span>{i+1}. {p.name}</span>
                            <span>{p.value}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <h5>Rebounds</h5>
                        {leagueLeaders('rebounds').map((p, i) => (
                          <div key={i} className="leader-row">
                            <span>{i+1}. {p.name}</span>
                            <span>{p.value}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <h5>Assists</h5>
                        {leagueLeaders('assists').map((p, i) => (
                          <div key={i} className="leader-row">
                            <span>{i+1}. {p.name}</span>
                            <span>{p.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  {/* <div className="info-card full-width">
                    <h4>⚡ Quick Actions</h4>
                    <div className="quick-actions-grid">
                      <button className="action-btn primary" onClick={handleContinue} disabled={loading}>
                        ▶ Continue Season
                      </button>
                      <button className="action-btn success" onClick={handleSimulate} disabled={loading}>
                        ⚡ Simulate Season
                      </button>
                      <button className="action-btn info" onClick={() => setActiveTab('standings')}>
                        📊 View Standings
                      </button>
                    </div>
                  </div> */}
                </div>
              </div>
            )}

            {!loading && activeTab === 'roster' && (
              <div className="tab-panel roster-panel">
                <div className="roster-header">
                  <h4>👥 Team Roster</h4>
                  <span className="roster-count">{userTeamPlayers.length} players</span>
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
                        <th>Actions</th>
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
                          <td>
                            <button
                              className="view-player-btn"
                              onClick={() => setSelectedPlayer(player)}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!loading && activeTab === 'standings' && (
              <div className="tab-panel standings-panel">
                <h4>📈 League Standings</h4>
                <div className="standings-container">
                  {groupedStandings().map((group, idx) => (
                    <div key={idx} className="standings-group">
                      <div className="standings-group-header">
                        <span className="conference">{group.conference}</span>
                        <span className="division">{group.division}</span>
                      </div>
                      <table className="standings-table">
                        <thead>
                          <tr>
                            <th>Team</th>
                            <th>W</th>
                            <th>L</th>
                            <th>PCT</th>
                            <th>GB</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((row, i) => {
                            const isUser = row.team_id === userTeam?.id;
                            const color = stringToColor(row.team?.name || '');
                            const initials = row.team?.name?.split(' ').map(w => w[0]).join('').slice(0,2) || '??';
                            // Compute games behind (relative to first in group)
                            const first = group.rows[0];
                            const gb = first ? ((first.wins - row.wins) + (row.losses - first.losses)) / 2 : 0;
                            const gbDisplay = gb === 0 ? '-' : gb.toFixed(1);
                            const pct = (row.wins + row.losses) > 0 ? ((row.wins / (row.wins + row.losses)) * 100) : 0;
                            const isPlayoff = i < 8; // simple top 8

                            return (
                              <tr key={row.team_id} className={isUser ? 'highlighted' : ''}>
                                <td className="team-cell">
                                  <div className="team-avatar" style={{ backgroundColor: color }}>
                                    {initials}
                                  </div>
                                  <span className="team-name">{row.team?.name || 'Unknown'}</span>
                                  {isUser && <span className="user-badge">⭐</span>}
                                </td>
                                <td className="wins">{row.wins}</td>
                                <td className="losses">{row.losses}</td>
                                <td>
                                  <div className="pct-bar">
                                    <div className="pct-fill" style={{ width: `${pct}%`, backgroundColor: color }}></div>
                                    <span className="pct-label">{pct.toFixed(1)}%</span>
                                  </div>
                                </td>
                                <td>{gbDisplay}</td>
                                <td>
                                  {isPlayoff ? (
                                    <span className="playoff-badge">🏆</span>
                                  ) : (
                                    <span className="playoff-badge eliminated">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!loading && activeTab === 'trade' && (
              <div className="tab-panel placeholder-panel">
                <div className="placeholder-content">
                  <h3>🔄 Trade Center</h3>
                  <p>Trade negotiations and offers will appear here.</p>
                  <p className="coming-soon">Coming soon!</p>
                </div>
              </div>
            )}

            {!loading && activeTab === 'freeagents' && (
              <div className="tab-panel placeholder-panel">
                <div className="placeholder-content">
                  <h3>📋 Free Agents</h3>
                  <p>Browse and sign available players.</p>
                  <p className="coming-soon">Coming soon!</p>
                </div>
              </div>
            )}

            {!loading && activeTab === 'frontoffice' && (
              <div className="tab-panel placeholder-panel">
                <div className="placeholder-content">
                  <h3>🏢 Front Office</h3>
                  <p>Manage staff, finances, and team operations.</p>
                  <p className="coming-soon">Coming soon!</p>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Player Detail Modal */}
      {selectedPlayer && (
        <div className="modal-overlay" onClick={() => setSelectedPlayer(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedPlayer(null)}>×</button>
            <h2>{selectedPlayer.first_name} {selectedPlayer.last_name}</h2>
            <div className="modal-grid">
              <div className="modal-item">
                <span className="modal-label">Position</span>
                <span className="modal-value">{selectedPlayer.position}</span>
              </div>
              <div className="modal-item">
                <span className="modal-label">Overall Rating</span>
                <span className="modal-value">{selectedPlayer.overall_rating}</span>
              </div>
              <div className="modal-item">
                <span className="modal-label">Points</span>
                <span className="modal-value">{selectedPlayer.points ?? 0}</span>
              </div>
              <div className="modal-item">
                <span className="modal-label">Rebounds</span>
                <span className="modal-value">{selectedPlayer.rebounds ?? 0}</span>
              </div>
              <div className="modal-item">
                <span className="modal-label">Assists</span>
                <span className="modal-value">{selectedPlayer.assists ?? 0}</span>
              </div>
              {/* <div className="modal-item">
                <span className="modal-label">Steals</span>
                <span className="modal-value">{selectedPlayer.steals ?? 0}</span>
              </div>
              <div className="modal-item">
                <span className="modal-label">Blocks</span>
                <span className="modal-value">{selectedPlayer.blocks ?? 0}</span>
              </div>
              <div className="modal-item">
                <span className="modal-label">Turnovers</span>
                <span className="modal-value">{selectedPlayer.turnovers ?? 0}</span>
              </div>
              <div className="modal-item">
                <span className="modal-label">FG%</span>
                <span className="modal-value">{selectedPlayer.field_goal_percentage ?? 0}%</span>
              </div>
              <div className="modal-item">
                <span className="modal-label">3P%</span>
                <span className="modal-value">{selectedPlayer.three_point_percentage ?? 0}%</span>
              </div>
              <div className="modal-item">
                <span className="modal-label">FT%</span>
                <span className="modal-value">{selectedPlayer.free_throw_percentage ?? 0}%</span>
              </div> */}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SelectedGame;