// src/components/pages/tabs/OverviewTab.tsx
import React from 'react';
import { SavedGame, Team, Player } from '../../../shared/index';
import GameResults from '../GameResults';

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
}) => {
  const getPlayerName = (player: Player) => `${player.first_name} ${player.last_name}`;

  const leaderByStat = (stat: keyof Pick<Player, 'points' | 'rebounds' | 'assists'>) => {
    const sorted = [...userTeamPlayers].sort((a, b) => (b[stat] ?? 0) - (a[stat] ?? 0));
    return sorted.length > 0 ? getPlayerName(sorted[0]) : '-';
  };

  const leagueLeaders = (stat: keyof Pick<Player, 'points' | 'rebounds' | 'assists'>) => {
    return [...players]
      .sort((a, b) => (b[stat] ?? 0) - (a[stat] ?? 0))
      .slice(0, 5)
      .map(p => ({ name: getPlayerName(p), value: p[stat] ?? 0 }));
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

  return (
    <div className="tab-panel overview-panel">
      <div className="overview-grid">
        <div className="info-card full-width">
          <GameResults
            key={refreshKey}
            savedGameId={savedGameId}
            onGameClick={onGameClick}
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

        <div className="info-card">
          <h4>📊 Team Averages</h4>
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
      </div>
    </div>
  );
};

export default OverviewTab;