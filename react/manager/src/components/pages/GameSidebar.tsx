// src/components/SelectedGame/GameSidebar.tsx
import React from 'react';
import { UserGameInfo } from '../../api/leagueApi';
import "./GameResults.css";


interface GameSidebarProps {
  season: number;
  wins: number;
  losses: number;
  winPct: string;
  playerCount: number;
  ppg: string;
  oppg: string;
  onContinue: () => void;
  onSimulate: () => void;
  onViewStandings: () => void;
  loading: boolean;
  nextUserGame?: UserGameInfo | null;
  leagueGamesBeforeCount?: number;
}

const GameSidebar: React.FC<GameSidebarProps> = ({
  season,
  wins,
  losses,
  winPct,
  playerCount,
  ppg,
  oppg,
  onContinue,
  onSimulate,
  onViewStandings,
  loading,
  nextUserGame, 
  leagueGamesBeforeCount = 0,
}) => {
  return (
    <aside className="game-sidebar">
      <div className="game-sidebar-section">
        <h4>Season {season}</h4>
        <div className="sidebar-record">
          <span className="sidebar-wins">{wins}</span>
          <span className="sidebar-dash">-</span>
          <span className="sidebar-losses">{losses}</span>
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
          <span className="sidebar-stat-value">{playerCount}</span>
        </div>
      </div>

      <div className="game-sidebar-section">
        <h4>Actions</h4>
{nextUserGame && !loading && (
        <div className="next-game-card">
          <p className="next-game-label">Next Game</p>
 
          <p className="next-game-matchup">
            {nextUserGame.isHome
              ? `${nextUserGame.home_team.abbreviation} vs ${nextUserGame.away_team.abbreviation}`
              : `@ ${nextUserGame.home_team.abbreviation}`}
          </p>
 
          <p className="next-game-date">
            {new Date(nextUserGame.game_date).toLocaleDateString(undefined, {
              weekday: 'short',
              month:   'short',
              day:     'numeric',
            })}
          </p>
 
          {leagueGamesBeforeCount > 0 && (
            <p className="next-game-preview">
              {leagueGamesBeforeCount} league game{leagueGamesBeforeCount !== 1 ? 's' : ''} before yours
            </p>
          )}
        </div>
      )}
 
      <button
        className="continue-btn"
        onClick={onContinue}
        disabled={loading}
      >
        {loading
          ? 'Simulating…'
          : leagueGamesBeforeCount > 0
            ? `Sim ${leagueGamesBeforeCount} game${leagueGamesBeforeCount !== 1 ? 's' : ''} → Next`
            : 'Advance to Next Game'}
      </button>
        <button
          className="sidebar-action-btn info"
          onClick={onViewStandings}
        >
          📊 Standings
        </button>
      </div>
    </aside>
  );
};

export default GameSidebar;