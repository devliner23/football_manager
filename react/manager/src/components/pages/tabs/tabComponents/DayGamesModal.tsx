import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { GameResult } from '../../../../api/leagueApi';
import IndividualGameView from './IndividualGameView';

interface TeamLite {
  id: string;
  name: string;
  abbreviation: string;
}

interface DayGamesModalProps {
  date: Date | null;
  games: GameResult[];
  teams: TeamLite[];
  onClose: () => void;
}

const DayGamesModal: React.FC<DayGamesModalProps> = ({ date, games, teams, onClose }) => {
  const [selectedGame, setSelectedGame] = useState<GameResult | null>(null);

  // Reset the drill-down whenever a new day is opened
  useEffect(() => {
    setSelectedGame(null);
  }, [date]);

  if (!date) return null;

  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const handleClose = () => {
    setSelectedGame(null);
    onClose();
  };

  const modalContent = (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="day-modal" onClick={(e) => e.stopPropagation()}>
        {selectedGame ? (
          teamMap.get(selectedGame.home_team_id) && teamMap.get(selectedGame.away_team_id) ? (
            <IndividualGameView
              game={selectedGame}
              homeTeam={teamMap.get(selectedGame.home_team_id)!}
              awayTeam={teamMap.get(selectedGame.away_team_id)!}
              onClose={handleClose}
            />
          ) : null
        ) : (
          <>
            <div className="modal-header">
              <h3 className="modal-title">
                {date.toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </h3>
              <button className="modal-close" onClick={handleClose}>✕</button>
            </div>
            <div className="modal-games-list">
              {games.length === 0 ? (
                <p className="no-games">No games scheduled on this date.</p>
              ) : (
                games.map((game) => {
                  const home = teamMap.get(game.home_team_id);
                  const away = teamMap.get(game.away_team_id);
                  return (
                    <div
                      key={game.id}
                      className="modal-game-row clickable"
                      onClick={() => setSelectedGame(game)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="modal-game-teams">
                        <div className="modal-team home">
                          <span className="team-abbr-full">{home?.abbreviation || 'TBD'}</span>
                          <span className="team-name">{home?.name || ''}</span>
                        </div>
                        <div className="modal-vs">VS</div>
                        <div className="modal-team away">
                          <span className="team-abbr-full">{away?.abbreviation || 'TBD'}</span>
                          <span className="team-name">{away?.name || ''}</span>
                        </div>
                      </div>
                      <div className="modal-game-info">
                        <div className="modal-score-big">
                          {game.status === 'completed' && game.home_score != null
                            ? `${game.home_score} - ${game.away_score}`
                            : '—'}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.getElementById('modal-root') || document.body);
};

export default DayGamesModal;