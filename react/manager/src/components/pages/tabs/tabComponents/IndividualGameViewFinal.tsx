import React from 'react';
import { GameResult } from '../../../../api/leagueApi';
import { X } from 'lucide-react';
import './styles/IndividualGameView.css';

interface IndividualGameViewProps {
  game: GameResult;
  homeTeam: { name: string; abbreviation: string };
  awayTeam: { name: string; abbreviation: string };
  onClose: () => void;
}

const IndividualGameView: React.FC<IndividualGameViewProps> = ({
  game,
  homeTeam,
  awayTeam,
  onClose,
}) => {
  const isFinal = game.status === 'completed' && game.home_score != null;
  const date = game.game_date || game.played_at
    ? new Date(game.game_date || game.played_at!).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  // Add this array right above the `return` statement to keep the JSX clean
  const placeholderPositions = ['PG', 'SG', 'SF', 'PF', 'C', '6M'];
  const renderPlaceholderRow = (pos: string, keyPrefix: string) => (
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
      {/* Added igm-expanded-view class here to trigger the wider layout */}
      <div className="individual-game-modal igm-expanded-view" onClick={(e) => e.stopPropagation()}>
        
        <div className="igm-layout-wrapper">
          
          {/* ── LEFT FLANK: HOME BOX SCORE ── */}
          <aside className="igm-side-panel igm-side-panel--home">
            {/* <div className="igm-sp-header">
              <span className="igm-sp-abbr">{homeTeam.abbreviation}</span>
              <span className="igm-sp-name">{homeTeam.name}</span>
              {isFinal && <span className="igm-sp-score">{game.home_score}</span>}
            </div> */}
            <div className="igm-sp-grid-wrapper">
              <div className="igm-bs-grid">
                <div className="igm-bs-row igm-bs-row--head">
                  <span className="igm-bs-cell igm-bs-pos">POS</span>
                  <span className="igm-bs-cell igm-bs-player">PLAYER</span>
                  <span className="igm-bs-cell igm-bs-num">MIN</span>
                  <span className="igm-bs-cell igm-bs-num">FGM-A</span>
                  <span className="igm-bs-cell igm-bs-num">3PM-A</span>
                  <span className="igm-bs-cell igm-bs-num">REB</span>
                  <span className="igm-bs-cell igm-bs-num">AST</span>
                  <span className="igm-bs-cell igm-bs-num">STL</span>
                  <span className="igm-bs-cell igm-bs-num">BLK</span>
                  <span className="igm-bs-cell igm-bs-num igm-bs-pts">PTS</span>
                </div>
                {placeholderPositions.map((pos) => renderPlaceholderRow(pos, 'home'))}
              </div>
            </div>
          </aside>

          {/* ── CENTER: MAIN GAME INFO ── */}
          <main className="igm-main-panel">
            {/* <div className="igm-header">
              <h2 className="igm-title">Game Details</h2>
              <button className="igm-close-btn" onClick={onClose}>
                <X size={18} strokeWidth={2} />
              </button>
            </div> */}

            <div className="igm-content">
              <div className="igm-matchup">
                <div className="igm-team">
                  <span className="igm-team-abbr">{homeTeam.abbreviation}</span>
                  <span className="igm-team-name">{homeTeam.name}</span>
                  {isFinal && <span className="igm-team-label">HOME</span>}
                </div>
                <div className="igm-vs-pill">VS</div>
                <div className="igm-team igm-team--away">
                  <span className="igm-team-abbr">{awayTeam.abbreviation}</span>
                  <span className="igm-team-name">{awayTeam.name}</span>
                  {isFinal && <span className="igm-team-label">AWAY</span>}
                </div>
              </div>

              <div className="igm-score-status">
                {isFinal ? (
                  <div className="igm-final-score">
                    <span className="igm-score-num">{game.home_score}</span>
                    <span className="igm-score-dash">–</span>
                    <span className="igm-score-num">{game.away_score}</span>
                  </div>
                ) : (
                  <div className="igm-scheduled-wrap">
                    <span className="igm-status-badge igm-status-scheduled">SCHEDULED</span>
                  </div>
                )}
              </div>

              <div className="igm-meta-row">
                {game.week && <span className="igm-meta-chip">Week {game.week}</span>}
                {date && <span className="igm-meta-chip">{date}</span>}
                {isFinal && <span className="igm-status-badge igm-status-final">FINAL</span>}
              </div>
            </div>
          </main>

          {/* ── RIGHT FLANK: AWAY BOX SCORE ── */}
          <aside className="igm-side-panel igm-side-panel--away">
            {/* <div className="igm-sp-header">
              <span className="igm-sp-abbr">{awayTeam.abbreviation}</span>
              <span className="igm-sp-name">{awayTeam.name}</span>
              {isFinal && <span className="igm-sp-score">{game.away_score}</span>}
            </div> */}
            <div className="igm-sp-grid-wrapper">
              <div className="igm-bs-grid">
                <div className="igm-bs-row igm-bs-row--head">
                  <span className="igm-bs-cell igm-bs-pos">POS</span>
                  <span className="igm-bs-cell igm-bs-player">PLAYER</span>
                  <span className="igm-bs-cell igm-bs-num">MIN</span>
                  <span className="igm-bs-cell igm-bs-num">FGM-A</span>
                  <span className="igm-bs-cell igm-bs-num">3PM-A</span>
                  <span className="igm-bs-cell igm-bs-num">REB</span>
                  <span className="igm-bs-cell igm-bs-num">AST</span>
                  <span className="igm-bs-cell igm-bs-num">STL</span>
                  <span className="igm-bs-cell igm-bs-num">BLK</span>
                  <span className="igm-bs-cell igm-bs-num igm-bs-pts">PTS</span>
                </div>
                {placeholderPositions.map((pos) => renderPlaceholderRow(pos, 'away'))}
              </div>
            </div>
          </aside>

        </div>
      </div>
    </div>
  );
}

export default IndividualGameView;