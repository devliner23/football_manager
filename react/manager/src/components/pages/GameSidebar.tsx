// src/components/SelectedGame/GameSidebar.tsx
import React, { useState } from 'react';
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
  onSimulateToDate: (date: string) => void;   // new
  lastSimulatedDate?: string | null;
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
  lastSimulatedDate,
  onSimulateToDate
}) => {
  const [simDate, setSimDate] = useState<string>(
    new Date().toISOString().slice(0, 10) // today as YYYY-MM-DD
  );

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
        <h4>Simulate</h4>
        {lastSimulatedDate && (
          <p className="sidebar-date-info">
            Last simulated: {new Date(lastSimulatedDate).toLocaleDateString()}
          </p>
        )}
        <div className="sim-date-input">
          <label htmlFor="sim-date">Simulate to:</label>
          <input
            type="date"
            id="sim-date"
            value={simDate}
            onChange={(e) => setSimDate(e.target.value)}
            min={new Date().toISOString().slice(0, 10)} // optional: prevent past dates
          />
        </div>
        <button
          className="sidebar-action-btn"
          onClick={() => onSimulateToDate(simDate)}
          disabled={loading}
        >
          {loading ? 'Simulating…' : 'Simulate to Date'}
        </button>
      </div>
    </aside>
  );
};

export default GameSidebar;