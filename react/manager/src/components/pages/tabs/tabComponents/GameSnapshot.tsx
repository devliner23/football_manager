import React from 'react';
import { GameResult } from '../../../../shared';

interface GameSnapshotProps {
  game: GameResult | null;
  homeTeam: { id: string; name: string; abbreviation: string } | null;
  awayTeam: { id: string; name: string; abbreviation: string } | null;
}

const GameSnapshot: React.FC<GameSnapshotProps> = ({ game, homeTeam, awayTeam }) => {
  if (!game || !homeTeam || !awayTeam) {
    return (
      <div className="game-snapshot empty">
        <p>Select a game to see details</p>
      </div>
    );
  }

  const isFinished = game.status === 'completed';
  return (
    <div className="game-snapshot">
      <h4 className="snapshot-title">Selected Game</h4>
      <div className="snapshot-teams">
        <div className="snapshot-team home">
          <span className="snapshot-abbr">{homeTeam.abbreviation}</span>
          <span className="snapshot-name">{homeTeam.name}</span>
        </div>
        <div className="snapshot-vs">VS</div>
        <div className="snapshot-team away">
          <span className="snapshot-abbr">{awayTeam.abbreviation}</span>
          <span className="snapshot-name">{awayTeam.name}</span>
        </div>
      </div>
      <div className="snapshot-score">
        {isFinished ? `${game.home_score} - ${game.away_score}` : 'Upcoming'}
      </div>
      <div className={`snapshot-status status-${game.status}`}>{game.status}</div>
      {game.played_at && (
        <div className="snapshot-date">{new Date(game.played_at).toLocaleString()}</div>
      )}
    </div>
  );
};

export default GameSnapshot;