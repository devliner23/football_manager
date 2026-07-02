// src/components/pages/tabs/tabComponents/GameSnapshot.tsx
import React from 'react';
import { Trophy, Clock, CircleDot } from 'lucide-react';
import { GameResult } from '../../../../api/leagueApi';

interface TeamLite {
  id: string;
  name: string;
  abbreviation: string;
}

interface GameSnapshotProps {
  game: GameResult | null;
  homeTeam: TeamLite | null;
  awayTeam: TeamLite | null;
}

const GameSnapshot: React.FC<GameSnapshotProps> = ({ game, homeTeam, awayTeam }) => {
  if (!game || !homeTeam || !awayTeam) {
    return (
      <div className="game-snapshot empty">
        <p>Select a game to preview it here.</p>
      </div>
    );
  }

  const finished = game.status === 'completed' && game.home_score != null;
  const homeWin = finished && (game.home_score ?? 0) > (game.away_score ?? 0);
  const awayWin = finished && (game.away_score ?? 0) > (game.home_score ?? 0);
  const dateSrc = game.game_date || game.played_at;

  return (
    <div className="game-snapshot">
      <h4 className="snapshot-title">
        <Trophy size={14} strokeWidth={2} style={{ marginRight: 6, opacity: 0.6 }} />
        Game Preview
      </h4>

      <div className="snapshot-teams">
        <div className="snapshot-team">
          <span className={`snapshot-abbr ${awayWin ? 'snapshot-abbr--win' : ''}`}>
            {awayTeam.abbreviation}
          </span>
          <span className="snapshot-name">{awayTeam.name}</span>
        </div>
        <span className="snapshot-vs">@</span>
        <div className="snapshot-team">
          <span className={`snapshot-abbr ${homeWin ? 'snapshot-abbr--win' : ''}`}>
            {homeTeam.abbreviation}
          </span>
          <span className="snapshot-name">{homeTeam.name}</span>
        </div>
      </div>

      <div className="snapshot-score">
        {finished ? `${game.away_score} – ${game.home_score}` : '— vs —'}
      </div>

      <div className={`snapshot-status status-${game.status}`}>
        {finished ? (
          <>
            <CircleDot size={11} strokeWidth={3} /> Final
          </>
        ) : (
          <>
            <Clock size={11} strokeWidth={2.5} /> {game.status}
          </>
        )}
      </div>

      {dateSrc && (
        <div className="snapshot-date">
          {new Date(dateSrc).toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </div>
      )}
    </div>
  );
};

export default GameSnapshot;