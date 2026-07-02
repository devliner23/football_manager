import React from 'react';
import { Player } from '../../../../shared';
import {
  X, Star, BarChart3, Crosshair, Shield, Zap,
  Activity, TrendingUp, GitCompare, Target,
  Eye, PlusCircle, ArrowUpRight
} from 'lucide-react';
import "./styles/PlayerViewModal.css";

interface PlayerViewModalProps {
  player: Player;
  teamName?: string;
  teamWins?: number;
  teamLosses?: number;
  onClose: () => void;
}

const PlayerViewModal: React.FC<PlayerViewModalProps> = ({
  player,
  teamName,
  teamWins,
  teamLosses,
  onClose,
}) => {
  const points = player.points ?? 0;
  const rebounds = player.rebounds ?? 0;
  const assists = player.assists ?? 0;
  const steals = (player as any).steals ?? 0;
  const blocks = (player as any).blocks ?? 0;
  const turnovers = (player as any).turnovers ?? 0;
  const fgPct = (player as any).fg_pct ?? 0.45;
  const threePct = (player as any).three_pct ?? 0.35;
  const ftPct = (player as any).ft_pct ?? 0.75;

  return (
    <div className="player-modal-overlay" onClick={onClose}>
      <div className="player-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}>
          <X size={20} strokeWidth={2} />
        </button>

        {/* Hero Section */}
        <div className="modal-hero">
          <div className="modal-hero-left">
            <div className="player-avatar-large">
              {player.first_name.charAt(0)}{player.last_name.charAt(0)}
            </div>
            <div className="player-info-block">
              <h2 className="modal-player-name">{player.first_name} {player.last_name}</h2>
              <span className="modal-position">{player.position}</span>
              {teamName && (
                <span className="modal-team">
                  {teamName}
                  {(teamWins !== undefined && teamLosses !== undefined) && (
                    <span className="modal-record">{teamWins}-{teamLosses}</span>
                  )}
                </span>
              )}
            </div>
          </div>
          <div className="modal-hero-right">
            <div className="modal-rating-badge">
              <Star size={18} strokeWidth={2} />
              <span>{player.overall_rating}</span>
            </div>
          </div>
        </div>

        {/* Season Averages */}
        <div className="modal-stats-section">
          <h3 className="modal-section-title">
            <BarChart3 size={18} strokeWidth={1.5} />
            Season Averages
          </h3>
          <div className="modal-stats-grid">
            <StatCard icon={<Crosshair size={16} />} label="PTS" value={points} type="pts" />
            <StatCard icon={<Shield size={16} />} label="REB" value={rebounds} type="reb" />
            <StatCard icon={<Zap size={16} />} label="AST" value={assists} type="ast" />
            <StatCard icon={<Activity size={16} />} label="STL" value={steals} type="stl" />
            <StatCard icon={<TrendingUp size={16} />} label="BLK" value={blocks} type="blk" />
            <StatCard icon={<GitCompare size={16} />} label="TOV" value={turnovers} type="tov" />
          </div>
        </div>

        {/* Shooting Splits */}
        <div className="modal-stats-section">
          <h3 className="modal-section-title">
            <Target size={18} strokeWidth={1.5} />
            Shooting Splits
          </h3>
          <div className="modal-shooting-grid">
            <ShootingCard label="FG%" value={fgPct} />
            <ShootingCard label="3P%" value={threePct} />
            <ShootingCard label="FT%" value={ftPct} />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="modal-actions">
          <button className="action-btn primary"><Eye size={16} /> View Game Log</button>
          <button className="action-btn secondary"><GitCompare size={16} /> Compare</button>
          <button className="action-btn secondary"><PlusCircle size={16} /> Watchlist</button>
          <button className="action-btn secondary"><ArrowUpRight size={16} /> Trade</button>
        </div>
      </div>
    </div>
  );
};

// Small helper components for cleaner markup
const StatCard = ({ icon, label, value, type }: any) => (
  <div className="stat-card">
    <div className={`stat-icon ${type}-icon`}>{icon}</div>
    <div className="stat-details">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  </div>
);

const ShootingCard = ({ label, value }: any) => (
  <div className="shooting-card">
    <span className="shooting-label">{label}</span>
    <span className="shooting-value">
      {typeof value === 'number' ? (value * 100).toFixed(1) + '%' : '--'}
    </span>
  </div>
);

export default PlayerViewModal;