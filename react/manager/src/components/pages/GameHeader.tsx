import React from 'react';
import {
  ArrowLeft,
  Trophy,
  Circle,
  Trash2,
  TrendingUp,
  Calendar
} from 'lucide-react';
import './styles/GameHeader.css';

interface GameHeaderProps {
  gameName: string;         // e.g. "Solar Flares"
  record: string;
  winPct: string;
  teamColor?: string;       // optional direct override
  onBack: () => void;
  onDelete: () => void;
}

/* --- Team color map (same as in NewGameForm) ---
   Move this to a shared file (e.g. shared/teamData.ts)
   to keep it in one place. */
const teams = [
  { city: 'Atlanta', name: 'Embers', primaryColor: '#E03A3E' },
  { city: 'Boston', name: 'Sentinels', primaryColor: '#007A33' },
  { city: 'Brooklyn', name: 'Anchors', primaryColor: '#000000' },
  { city: 'Charlotte', name: 'Sovereigns', primaryColor: '#00788C' },
  { city: 'Chicago', name: 'Gales', primaryColor: '#CE1141' },
  { city: 'Cleveland', name: 'Anvils', primaryColor: '#860038' },
  { city: 'Dallas', name: 'Wranglers', primaryColor: '#0053BC' },
  { city: 'Denver', name: 'Apex', primaryColor: '#0E2240' },
  { city: 'Detroit', name: 'Forge', primaryColor: '#C8102E' },
  { city: 'Golden State', name: 'Prospectors', primaryColor: '#1D428A' },
  { city: 'Houston', name: 'Orbit', primaryColor: '#CE1141' },
  { city: 'Indiana', name: 'Chariots', primaryColor: '#002D62' },
  { city: 'Los Angeles', name: 'Waves', primaryColor: '#552583' },
  { city: 'Los Angeles', name: 'Luminaries', primaryColor: '#1D428A' },
  { city: 'Memphis', name: 'Pharaohs', primaryColor: '#5D76A9' },
  { city: 'Miami', name: 'Tempest', primaryColor: '#98002E' },
  { city: 'Milwaukee', name: 'Masons', primaryColor: '#00471B' },
  { city: 'Minnesota', name: 'Voyageurs', primaryColor: '#0C2340' },
  { city: 'New Orleans', name: 'Krewe', primaryColor: '#0C2340' },
  { city: 'New York', name: 'Skyliners', primaryColor: '#006BB6' },
  { city: 'Oklahoma City', name: 'Twisters', primaryColor: '#007AC1' },
  { city: 'Orlando', name: 'Spells', primaryColor: '#0077C0' },
  { city: 'Philadelphia', name: 'Bellringers', primaryColor: '#006BB6' },
  { city: 'Phoenix', name: 'Solar Flares', primaryColor: '#1D1160' },
  { city: 'Portland', name: 'Cascades', primaryColor: '#E03A3E' },
  { city: 'Sacramento', name: 'Miners', primaryColor: '#5A2D81' },
  { city: 'San Antonio', name: 'Toros', primaryColor: '#000000' },
  { city: 'Toronto', name: 'Aurora', primaryColor: '#CE1141' },
  { city: 'Utah', name: 'Monoliths', primaryColor: '#002B5C' },
  { city: 'Washington', name: 'Monuments', primaryColor: '#002B5C' },
];

const GameHeader: React.FC<GameHeaderProps> = ({
  gameName,
  record,
  winPct,
  teamColor,
  onBack,
  onDelete,
}) => {
  const winPctNum = parseFloat(winPct);
  const winColor = winPctNum >= 60 ? '#4ade80' : winPctNum >= 45 ? '#fbbf24' : '#f87171';

  // Derive team color from gameName if not explicitly passed
  const derivedColor =
    teamColor || teams.find(t => t.name === gameName)?.primaryColor || '#FF6B35';

  return (
    <header className="game-global-header">
      <div className="game-global-header-top">
        <div className="game-global-header-left">
          <button className="back-to-dashboard-btn" onClick={onBack}>
            <ArrowLeft size={20} strokeWidth={2.5} />
            <span>Back to Dashboard</span>
          </button>

          {/* Glass-tinted team nameplate */}
          <div
            className="glass-team-name"
            style={{ '--team-color': derivedColor } as React.CSSProperties}
          >
            <Trophy size={24} strokeWidth={2} className="trophy-icon" />
            <span>{gameName}</span>
          </div>
        </div>

        <div className="game-global-header-right">
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