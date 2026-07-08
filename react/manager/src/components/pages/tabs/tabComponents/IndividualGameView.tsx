import React from 'react';
import { GameResult } from '../../../../api/leagueApi';
import './styles/IndividualGameView.css'; // new stylesheet (or add to Dashboard.css)

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
        <div className="modal-header">
          <h2 className="modal-title">Game Details</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="game-detail-content">
          {/* Matchup */}
          <div className="matchup-container">
            <div className="team home-team">
              <span className="team-abbr">{homeTeam.abbreviation}</span>
              <span className="team-city">{homeTeam.name}</span>
            </div>
            <div className="vs-badge">VS</div>
            <div className="team away-team">
              <span className="team-abbr">{awayTeam.abbreviation}</span>
              <span className="team-city">{awayTeam.name}</span>
            </div>
          </div>

          {/* Score / Status */}
          <div className="score-status">
            {isFinal ? (
              <div className="final-score">
                <span className="score-number">{game.home_score}</span>
                <span className="score-divider">-</span>
                <span className="score-number">{game.away_score}</span>
              </div>
            ) : (
              <span className="status-badge status-scheduled">SCHEDULED</span>
            )}
          </div>

          {/* Meta info */}
          <div className="game-meta">
            {game.week && <span className="meta-item">Week {game.week}</span>}
            {date && <span className="meta-item">{date}</span>}
            {game.status === 'completed' && (
              <span className="status-badge status-final">FINAL</span>
            )}
          </div>

          {/* Placeholder for future player data */}
          <div className="player-placeholder">
            <p>Player stats coming soon …</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IndividualGameView;