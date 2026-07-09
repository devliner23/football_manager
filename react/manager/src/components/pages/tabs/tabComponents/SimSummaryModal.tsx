import React from 'react';
import { SimSummary } from '../../../../api/leagueApi';
import { X, Star, Trophy, TrendingUp, CalendarDays } from 'lucide-react';
import './styles/SimSummaryModal.css';

interface SimSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: SimSummary | null;
  gamesSimulated: number;
  gamesRemaining: number;
}

const SimSummaryModal: React.FC<SimSummaryModalProps> = ({
  isOpen,
  onClose,
  summary,
  gamesSimulated,
  gamesRemaining,
}) => {
  if (!isOpen || !summary) return null;

  const { userTeamImpact, standingsSnapshot, topPerformers, playerProgression } = summary;

  return (
    <div className="sim-summary-backdrop" onClick={onClose}>
      <div className="sim-summary-container" onClick={(e) => e.stopPropagation()}>

        <div className="sim-summary-header">
          <div className="sim-header-left">
            <CalendarDays size={20} strokeWidth={2} className="sim-header-icon" />
            <div>
              <h2 className="sim-summary-title">Simulation Complete</h2>
              <p className="sim-summary-subtitle">
                {summary.summary.datesCovered.from === summary.summary.datesCovered.to
                  ? `Date: ${summary.summary.datesCovered.from}`
                  : `${summary.summary.datesCovered.from} → ${summary.summary.datesCovered.to}`}
              </p>
            </div>
          </div>
          <button className="sim-summary-close" onClick={onClose}>
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="sim-summary-body">

          {/* Quick Stats - Distinct Glass Boxes */}
          <div className="sim-quick-stats">
            <div className="sim-stat-box">
              <div className="sim-stat-value">{gamesSimulated}</div>
              <div className="sim-stat-label">Games Simmed</div>
            </div>
            <div className="sim-stat-box sim-stat-box--blue">
              <div className="sim-stat-value">{userTeamImpact.thisSim.record}</div>
              <div className="sim-stat-label">Your Record (This Sim)</div>
            </div>
            <div className="sim-stat-box sim-stat-box--amber">
              <div className="sim-stat-value">{gamesRemaining}</div>
              <div className="sim-stat-label">Games Remaining</div>
            </div>
          </div>

          {/* Season Totals - Enclosed Glass Panel */}
          {userTeamImpact.seasonTotal && (
            <div className="sim-panel">
              <h3 className="sim-panel-title">Season Totals</h3>
              <div className="sim-season-row">
                <span className="sim-season-record">{userTeamImpact.seasonTotal.record}</span>
                <div className="sim-season-meta">
                  <div className="sim-season-chip">PF: <span>{userTeamImpact.seasonTotal.pointsFor}</span></div>
                  <div className="sim-season-chip">PA: <span>{userTeamImpact.seasonTotal.pointsAgainst}</span></div>
                </div>
              </div>
            </div>
          )}

          {/* Top Performers - Faint Glass Rows */}
          <div className="sim-section">
            <h3 className="sim-panel-title">
              <Star size={14} strokeWidth={2} />
              Top Performers
            </h3>
            <div className="sim-list">
              {topPerformers.slice(0, 5).map((player, idx) => (
                <div key={player.playerId} className="sim-list-row">
                  <div className="sim-list-left">
                    <span className="sim-list-rank">{idx + 1}</span>
                    <div>
                      <div className="sim-list-name">{player.playerName}</div>
                      <div className="sim-list-sub">{player.teamAbbreviation}</div>
                    </div>
                  </div>
                  <div className="sim-list-stats">
                    <div className="sim-stat-mini">
                      <div className="sim-stat-mini-value">{player.points}</div>
                      <div className="sim-stat-mini-label">PTS</div>
                    </div>
                    <div className="sim-stat-mini">
                      <div className="sim-stat-mini-value">{player.rebounds}</div>
                      <div className="sim-stat-mini-label">REB</div>
                    </div>
                    <div className="sim-stat-mini">
                      <div className="sim-stat-mini-value">{player.assists}</div>
                      <div className="sim-stat-mini-label">AST</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Standings Table - Glass Styling */}
          <div className="sim-section">
            <h3 className="sim-panel-title">
              <Trophy size={14} strokeWidth={2} />
              Top 5 Standings
            </h3>
            <table className="sim-standings-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Team</th>
                  <th>W</th>
                  <th>L</th>
                </tr>
              </thead>
              <tbody>
                {standingsSnapshot.map((team, idx) => (
                  <tr key={team.teamId}>
                    <td className="sim-standings-rank">{idx + 1}</td>
                    <td className="sim-standings-team">{team.abbreviation}</td>
                    <td className="sim-standings-win">{team.wins}</td>
                    <td className="sim-standings-loss">{team.losses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Player Progression - Faint Glass Rows with Delta Pills */}
          {playerProgression.length > 0 && (
            <div className="sim-section">
              <h3 className="sim-panel-title">
                <TrendingUp size={14} strokeWidth={2} />
                Your Team Progression
              </h3>
              <div className="sim-list">
                {playerProgression.map((prog) => (
                  <div key={prog.playerId} className="sim-list-row">
                    <span className="sim-list-name">{prog.playerName}</span>
                    <div className="sim-progression-delta">
                      <span className="sim-prog-pill sim-prog-before">{prog.overallBefore}</span>
                      <span className={`sim-prog-arrow ${prog.delta > 0 ? 'up' : 'down'}`}>
                        {prog.delta > 0 ? '▲' : '▼'} {Math.abs(prog.delta)}
                      </span>
                      <span className="sim-prog-pill sim-prog-after">{prog.overallAfter}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="sim-summary-footer">
          <button className="sim-summary-continue-btn" onClick={onClose}>Continue</button>
        </div>
      </div>
    </div>
  );
};

export default SimSummaryModal;