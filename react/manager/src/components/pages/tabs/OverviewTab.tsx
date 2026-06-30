import React, { useState } from 'react';
import { SavedGame, Team, Player } from '../../../shared/index';
import GameResults from '../GameResults';
import { TrendingUp, TrendingDown, Calendar, ArrowRight, User, Target, Play, Settings, ArrowRightLeft } from 'lucide-react';
import TradePanel from './tabComponents/TradePanel';
import "./styles/OverviewTab.css";



interface OverviewTabProps {
  game: SavedGame;
  userTeam: Team | undefined;
  userTeamPlayers: Player[];
  players: Player[];
  record: string;
  winPct: string;
  savedGameId: string;
  refreshKey: number;
  onGameClick: (gameId: string) => void;
  allTeams: Team[];
}

const OverviewTab: React.FC<OverviewTabProps> = ({
  game,
  userTeam,
  userTeamPlayers,
  players,
  record,
  winPct,
  savedGameId,
  refreshKey,
  onGameClick,
  allTeams
}) => {
  const [showTradeModal, setShowTradeModal] = useState(false);


  const getPlayerName = (player: Player) => `${player.first_name} ${player.last_name}`;

  const leaderByStat = (stat: keyof Pick<Player, 'points' | 'rebounds' | 'assists'>) => {
    const sorted = [...userTeamPlayers].sort((a, b) => (b[stat] ?? 0) - (a[stat] ?? 0));
    return sorted.length > 0 ? getPlayerName(sorted[0]) : '-';
  };

  const leagueLeaders = (stat: keyof Pick<Player, 'points' | 'rebounds' | 'assists'>) => {
    return [...players]
      .sort((a, b) => (b[stat] ?? 0) - (a[stat] ?? 0))
      .slice(0, 5)
      .map((p) => ({ name: getPlayerName(p), value: p[stat] ?? 0 }));
  };

  const teamAverages = () => {
    if (userTeamPlayers.length === 0) return { pts: '0.0', reb: '0.0', ast: '0.0' };
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

  if (!userTeam) {
    return (
      <div className="overview-container error-state">
        <div className="error-card">
          <p>Team data not available. Please ensure the league is initialised correctly.</p>
        </div>
      </div>
    );
  }

  // Placeholder for next game – replace with real data if you have it
  const nextGame = { opponent: 'TBD', date: 'Season in progress', venue: 'N/A' };

  return (
    <div className="overview-container">
      <div className="overview-grid">

        {/* --- LEFT COLUMN: TEAM IDENTITY --- */}
        <div className="overview-left-panel">
          <div className="team-header">
            <div className="team-avatar">🏀</div>
            <div className="team-info">
              <h1 className="team-name">{userTeam.name}</h1>
              <p className="team-meta">
                <User className="icon-small" />
                {userTeam.conference || 'N/A'} • {userTeam.division || 'N/A'}
              </p>
            </div>
          </div>

          <div className="record-progress">
            <TrendingUp size={16} strokeWidth={2} />
            <div className="record-label">
              <span>{record}</span>
              <span className="record-pct">({winPct}%)</span>
            </div>
          </div>

          <div className="quick-actions">
            <button className="icon-btn">
              <Play size={18} strokeWidth={2} />
              <span>Sim Next Game</span>
            </button>
            <button className="icon-btn">
              <Settings size={18} strokeWidth={2} />
              <span>Adjust Lineup</span>
            </button>
            <button
              className="icon-btn"
              onClick={() => setShowTradeModal(true)}
            >
              <ArrowRightLeft size={18} strokeWidth={2} />
              <span>Trade</span>
            </button>
          </div>
        </div>

        {/* --- CENTER COLUMN: TEAM STATS & LEADERS --- */}
        <div className="overview-center-panel">
          <div className="kpi-grid">
            {[
              { label: 'Points', value: avg.pts, icon: '🔥' },
              { label: 'Rebounds', value: avg.reb, icon: '💪' },
              { label: 'Assists', value: avg.ast, icon: '🎯' }
            ].map((stat, idx) => (
              <div key={idx} className="kpi-card">
                <div className="kpi-header">
                  <span className="kpi-label">{stat.label}</span>
                  <span className="kpi-icon">{stat.icon}</span>
                </div>
                <div className="kpi-body">
                  <span className="kpi-value">{stat.value}</span>
                  <span className="kpi-trend kpi-trend-up">
                    <TrendingUp className="icon-small" /> +0.2
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="team-leaders-card">
            <h3 className="card-title">
              <Target className="icon-small" /> Team Leaders
            </h3>
            {userTeamPlayers.length > 0 ? (
              <div className="leader-list">
                {[
                  { stat: 'Points', value: leaderByStat('points') },
                  { stat: 'Rebounds', value: leaderByStat('rebounds') },
                  { stat: 'Assists', value: leaderByStat('assists') }
                ].map((item, i) => (
                  <div key={i} className="leader-item">
                    <span className="leader-label">{item.stat}</span>
                    <span className="leader-name">{item.value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">No players on roster yet</div>
            )}
          </div>
        </div>

        {/* --- RIGHT COLUMN: NEXT GAME & LEAGUE SNAPSHOT --- */}
        <div className="overview-right-panel">
          <div className="next-game-card">
            <div className="next-game-header">
              <div>
                <p className="next-game-label">Next Match</p>
                <p className="next-game-opponent">{nextGame.opponent}</p>
              </div>
              <Calendar className="icon-medium" />
            </div>
            <div className="next-game-details">
              <p className="detail-item"><span className="dot" /> {nextGame.date}</p>
              <p className="detail-item muted">{nextGame.venue}</p>
            </div>
          </div>

          <div className="league-snapshot-card">
            <h3 className="card-title">League Leaders</h3>
            <div className="leader-snapshot-list">
              {['points', 'rebounds', 'assists'].map((stat) => {
                const top = leagueLeaders(stat as keyof Pick<Player, 'points' | 'rebounds' | 'assists'>)[0];
                return top ? (
                  <div key={stat} className="snapshot-item">
                    <span className="snapshot-label">{stat}</span>
                    <span className="snapshot-value">{top.name} <span className="snapshot-number">({top.value})</span></span>
                  </div>
                ) : null;
              })}
            </div>
            <div className="snapshot-footer">
              <a href="#" className="link-cyan">Full Leaderboard <ArrowRight className="icon-small" /></a>
            </div>
          </div>
        </div>
      </div>

      {/* --- BOTTOM: GAME RESULTS (always at the end) --- */}
      <div className="overview-game-results">
        <GameResults
          key={refreshKey}
          savedGameId={savedGameId}
          onGameClick={onGameClick}
        />
      </div>



            {showTradeModal && userTeam && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowTradeModal(false)} // close on backdrop click
        >
          <div
            className="modal-content"
            style={{
              background: '#fff',
              borderRadius: '8px',
              padding: '20px',
              width: '90%',
              maxWidth: '1200px',
              maxHeight: '90vh',
              overflowY: 'auto',
              position: 'relative',
            }}
            onClick={e => e.stopPropagation()} // prevent closing when clicking inside
          >
            <button
              onClick={() => setShowTradeModal(false)}
              style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                background: 'none',
                border: 'none',
                fontSize: '20px',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
            <TradePanel
              savedGameId={savedGameId}
              userTeamId={userTeam.id}
              teams={allTeams.filter(t => t.id !== userTeam.id)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default OverviewTab;