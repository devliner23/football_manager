// src/components/SelectedGame/GameSidebar.tsx
import React, { useState, useEffect } from 'react';
import { UserGameInfo } from '../../api/leagueApi';
import { useGameContext } from '../../context/GameContext';
import "./styles/GameSidebar.css"

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
  onSimulateToDate: (date: string) => void;
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
  const [simDate, setSimDate] = useState<string>("");

  const ctx = useGameContext();

  // Sync with latest simulated date whenever it changes
  useEffect(() => {
    if (lastSimulatedDate) {
      const formatted = new Date(lastSimulatedDate).toISOString().slice(0, 10);
      setSimDate(formatted);
    } else {
      setSimDate(new Date().toISOString().slice(0, 10));
    }
  }, [lastSimulatedDate]);
  
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
          <div className="sim-date-picker-card">
            <input
              type="date"
              id="sim-date"
              value={simDate}
              onChange={(e) => setSimDate(e.target.value)}
            />
          </div>
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