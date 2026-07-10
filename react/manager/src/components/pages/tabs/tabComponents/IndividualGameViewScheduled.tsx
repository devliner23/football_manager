import React from 'react';
import { GameResult } from '../../../../api/leagueApi';
import { X } from 'lucide-react';
import './styles/IndividualGameView.css';

interface ScheduledGameViewProps {
  game: GameResult;
  homeTeam: { name: string; abbreviation: string };
  awayTeam: { name: string; abbreviation: string };
  onClose: () => void;
}

const ScheduledGameView: React.FC<ScheduledGameViewProps> = ({
  game,
  homeTeam,
  awayTeam,
  onClose,
}) => {
  const date = game.game_date || game.played_at
    ? new Date((game.game_date || game.played_at!) + 'T00:00:00').toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  // Placeholder array for the starting lineup slots
  const placeholderPositions = ['PG', 'SG', 'SF', 'PF', 'C', '6M'];
  
  // Renders a placeholder row matching the 10-column CSS grid
  const renderLineupRow = (pos: string, keyPrefix: string) => (
    <div className="igm-bs-row" key={`${keyPrefix}-${pos}`}>
      <span className="igm-bs-cell igm-bs-pos">{pos}</span>
      <span className="igm-bs-cell igm-bs-player">—</span>
      <span className="igm-bs-cell igm-bs-num">--</span>
      <span className="igm-bs-cell igm-bs-num">--</span>
      <span className="igm-bs-cell igm-bs-num">--</span>
      <span className="igm-bs-cell igm-bs-num">--</span>
      <span className="igm-bs-cell igm-bs-num">--</span>
      <span className="igm-bs-cell igm-bs-num">--</span>
      <span className="igm-bs-cell igm-bs-num">--</span>
      <span className="igm-bs-cell igm-bs-num igm-bs-pts">--</span>
    </div>
  );

  return (
    <div className="individual-game-overlay" onClick={onClose}>
      <div className="individual-game-modal igm-expanded-view" onClick={(e) => e.stopPropagation()}>
        
        <div className="igm-layout-wrapper">
          
          {/* ── LEFT FLANK: HOME LINEUP ── */}
          <aside className="igm-side-panel igm-side-panel--home">
            <div className="igm-sp-header">
              <span className="igm-sp-abbr">{homeTeam.abbreviation}</span>
              <span className="igm-sp-name">{homeTeam.name}</span>
            </div>
            <div className="igm-sp-grid-wrapper">
              <div className="igm-bs-grid">
                <div className="igm-bs-row igm-bs-row--head">
                  <span className="igm-bs-cell igm-bs-pos">POS</span>
                  <span className="igm-bs-cell igm-bs-player">PLAYER</span>
                  <span className="igm-bs-cell igm-bs-num">HT</span>
                  <span className="igm-bs-cell igm-bs-num">WT</span>
                  <span className="igm-bs-cell igm-bs-num">AGE</span>
                  <span className="igm-bs-cell igm-bs-num">OVR</span>
                  <span className="igm-bs-cell igm-bs-num">INS</span>
                  <span className="igm-bs-cell igm-bs-num">3PT</span>
                  <span className="igm-bs-cell igm-bs-num">DEF</span>
                  <span className="igm-bs-cell igm-bs-num igm-bs-pts">POT</span>
                </div>
                {placeholderPositions.map((pos) => renderLineupRow(pos, 'home'))}
              </div>
            </div>
          </aside>

          {/* ── CENTER: MAIN GAME INFO ── */}
          <main className="igm-main-panel">
            <div className="igm-header">
              <h2 className="igm-title">Upcoming Matchup</h2>
              <button className="igm-close-btn" onClick={onClose}>
                <X size={18} strokeWidth={2} />
              </button>
            </div>

            <div className="igm-content">
              <div className="igm-matchup">
                <div className="igm-team">
                  <span className="igm-team-abbr">{homeTeam.abbreviation}</span>
                  <span className="igm-team-name">{homeTeam.name}</span>
                  <span className="igm-team-label">HOME</span>
                </div>
                <div className="igm-vs-pill">VS</div>
                <div className="igm-team igm-team--away">
                  <span className="igm-team-abbr">{awayTeam.abbreviation}</span>
                  <span className="igm-team-name">{awayTeam.name}</span>
                  <span className="igm-team-label">AWAY</span>
                </div>
              </div>

              <div className="igm-score-status">
                <div className="igm-scheduled-wrap">
                  <span className="igm-status-badge igm-status-scheduled">SCHEDULED</span>
                </div>
              </div>

              <div className="igm-meta-row">
                {game.week && <span className="igm-meta-chip">Week {game.week}</span>}
                {date && <span className="igm-meta-chip">{date}</span>}
              </div>
            </div>
          </main>

          {/* ── RIGHT FLANK: AWAY LINEUP ── */}
          <aside className="igm-side-panel igm-side-panel--away">
            <div className="igm-sp-header">
              <span className="igm-sp-abbr">{awayTeam.abbreviation}</span>
              <span className="igm-sp-name">{awayTeam.name}</span>
            </div>
            <div className="igm-sp-grid-wrapper">
              <div className="igm-bs-grid">
                <div className="igm-bs-row igm-bs-row--head">
                  <span className="igm-bs-cell igm-bs-pos">POS</span>
                  <span className="igm-bs-cell igm-bs-player">PLAYER</span>
                  <span className="igm-bs-cell igm-bs-num">HT</span>
                  <span className="igm-bs-cell igm-bs-num">WT</span>
                  <span className="igm-bs-cell igm-bs-num">AGE</span>
                  <span className="igm-bs-cell igm-bs-num">OVR</span>
                  <span className="igm-bs-cell igm-bs-num">INS</span>
                  <span className="igm-bs-cell igm-bs-num">3PT</span>
                  <span className="igm-bs-cell igm-bs-num">DEF</span>
                  <span className="igm-bs-cell igm-bs-num igm-bs-pts">POT</span>
                </div>
                {placeholderPositions.map((pos) => renderLineupRow(pos, 'away'))}
              </div>
            </div>
          </aside>

        </div>
      </div>
    </div>
  );
}

export default ScheduledGameView;