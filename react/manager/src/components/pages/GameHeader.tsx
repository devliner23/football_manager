// src/components/SelectedGame/GameHeader.tsx
import React from 'react';
import { 
  ArrowLeft, 
  Trophy, 
  Circle, 
  Trash2,
  TrendingUp,
  Calendar
} from 'lucide-react';
import "./styles/GameHeader.css";

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
  const winPctNum = parseFloat(winPct);
  const winColor = winPctNum >= 60 ? '#4ade80' : winPctNum >= 45 ? '#fbbf24' : '#f87171';

  return (
    <header className="game-global-header">
      <div className="game-global-header-top">
        <div className="game-global-header-left">
          <button className="back-to-dashboard-btn" onClick={onBack}>
            <ArrowLeft size={20} strokeWidth={2.5} />
            <span>Back to Dashboard</span>
          </button>
          
          <div className="game-title-badge">
            <Trophy size={24} strokeWidth={2} className="trophy-icon" />
            <span>{gameName}</span>
          </div>
        </div>
        
        <div className="game-global-header-right">
          <div className="game-status">
            <Circle size={12} fill="#4ade80" stroke="none" className="pulse-dot" />
            <span>LIVE</span>
          </div>
          
          <div className="game-record-wrapper">
            <div className="game-record" style={{ borderColor: `${winColor}40` }}>
              <Calendar size={16} strokeWidth={2} />
              <span>{record}</span>
            </div>
            <div className="game-win-pct" style={{ 
              background: `linear-gradient(135deg, ${winColor}20, ${winColor}10)`,
              borderColor: `${winColor}40`
            }}>
              <TrendingUp size={16} strokeWidth={2} style={{ color: winColor }} />
              <span style={{ color: winColor }}>{winPct}%</span>
            </div>
          </div>
          
          <button className="delete-game-btn" onClick={onDelete}>
            <Trash2 size={20} strokeWidth={2} />
          </button>
        </div>
      </div>
    </header>
  );
};

export default GameHeader;