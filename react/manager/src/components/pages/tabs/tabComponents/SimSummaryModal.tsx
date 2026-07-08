import React from 'react';
import { SimSummary } from '../../../../api/leagueApi';
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
    <div className="sim-summary-backdrop">
      <div className="sim-summary-container">

        <div className="sim-summary-header">
          <div>
            <h2 className="sim-summary-title">Simulation Complete</h2>
            <p className="sim-summary-subtitle">
              {summary.summary.datesCovered.from === summary.summary.datesCovered.to
                ? `Date: ${summary.summary.datesCovered.from}`
                : `${summary.summary.datesCovered.from} → ${summary.summary.datesCovered.to}`}
            </p>
          </div>
          <button className="sim-summary-close" onClick={onClose}>&times;</button>
        </div>

        <div className="sim-summary-body">

          <div className="sim-quick-stats">
            <div className="sim-stat-box">
              <div className="sim-stat-value">{gamesSimulated}</div>
              <div className="sim-stat-label">Games Simmed</div>
            </div>
            <div className="sim-stat-box">
              <div className="sim-stat-value accent-blue">{userTeamImpact.thisSim.record}</div>
              <div className="sim-stat-label">Your Record (This Sim)</div>
            </div>
            <div className="sim-stat-box">
              <div className="sim-stat-value accent-amber">{gamesRemaining}</div>
              <div className="sim-stat-label">Games Remaining</div>
            </div>
          </div>

          {userTeamImpact.seasonTotal && (
            <div className="sim-panel">
              <h3 className="sim-panel-title">Season Totals</h3>
              <div className="sim-season-row">
                <span className="sim-season-record">{userTeamImpact.seasonTotal.record}</span>
                <div className="sim-season-meta">
                  <div>PF: <span>{userTeamImpact.seasonTotal.pointsFor}</span></div>
                  <div>PA: <span>{userTeamImpact.seasonTotal.pointsAgainst}</span></div>
                </div>
              </div>
            </div>
          )}

          <div>
            <h3 className="sim-panel-title">🌟 Top Performers</h3>
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

          <div>
            <h3 className="sim-panel-title">🏆 Top 5 Standings</h3>
            <table className="sim-standings-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Team</th>
                  <th style={{ textAlign: 'center' }}>W</th>
                  <th style={{ textAlign: 'center' }}>L</th>
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

          {playerProgression.length > 0 && (
            <div>
              <h3 className="sim-panel-title">📈 Your Team Progression</h3>
              <div className="sim-list">
                {playerProgression.map((prog) => (
                  <div key={prog.playerId} className="sim-list-row">
                    <span className="sim-list-name">{prog.playerName}</span>
                    <div className="sim-progression-delta">
                      <span className="sim-progression-before">{prog.overallBefore}</span>
                      <span className={`sim-progression-arrow ${prog.delta > 0 ? 'up' : 'down'}`}>
                        {prog.delta > 0 ? '▲' : '▼'} {Math.abs(prog.delta)}
                      </span>
                      <span className="sim-progression-after">{prog.overallAfter}</span>
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