// src/components/SelectedGame/GameSidebar.tsx
import React from 'react';

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
        <button
          className="sidebar-action-btn primary"
          onClick={onContinue}
          disabled={loading}
        >
          ▶ Continue
        </button>
        <button
          className="sidebar-action-btn success"
          onClick={onSimulate}
          disabled={loading}
        >
          ⚡ Simulate
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