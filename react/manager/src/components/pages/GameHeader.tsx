// src/components/SelectedGame/GameHeader.tsx
import React from 'react';

interface GameHeaderProps {
  gameName: string;
  record: string;
  winPct: string;
  onBack: () => void;
  onDelete: () => void;
}

const GameHeader: React.FC<GameHeaderProps> = ({
  gameName,
  record,
  winPct,
  onBack,
  onDelete,
}) => {
  return (
    <header className="game-global-header">
      <div className="game-global-header-top">
        <div className="game-global-header-left">
          <button className="back-to-dashboard-btn" onClick={onBack}>
            ← Back to Dashboard
          </button>
          <span className="game-title-badge">🏀 {gameName}</span>
        </div>
        <div className="game-global-header-right">
          <span className="game-status">● LIVE</span>
          <span className="game-record">{record} ({winPct}%)</span>
          <button className="delete-game-btn" onClick={onDelete}>
            🗑️
          </button>
        </div>
      </div>
    </header>
  );
};

export default GameHeader;