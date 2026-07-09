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

  return (
    <div className="individual-game-overlay" onClick={onClose}>
      <div className="individual-game-modal" onClick={(e) => e.stopPropagation()}>
        <div className="igm-header">
          <h2 className="igm-title">Game Details</h2>
          <button className="igm-close-btn" onClick={onClose}>
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="igm-content">
          {/* Matchup */}
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

          {/* Score / Status */}
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

          {/* Meta info */}
          <div className="igm-meta-row">
            {game.week && <span className="igm-meta-chip">Week {game.week}</span>}
            {date && <span className="igm-meta-chip">{date}</span>}
            {isFinal && (
              <span className="igm-status-badge igm-status-final">FINAL</span>
            )}
          </div>

          {/* Placeholder for future player data */}
          <div className="igm-placeholder">
            <p>Player box score stats coming soon …</p>
            <span className="igm-placeholder-tag">Coming Soon</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IndividualGameView;