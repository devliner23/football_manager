import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { GameResult } from '../../../../api/leagueApi';
import { X, CalendarDays } from 'lucide-react';
import IndividualGameView from './IndividualGameView';
import './styles/DayGamesModal.css'

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
              <div className="modal-header-left">
                <CalendarDays size={18} strokeWidth={2} className="modal-date-icon" />
                <h3 className="modal-title">
                  {date.toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </h3>
                <span className="modal-game-count">{games.length} Games</span>
              </div>
              <button className="modal-close-btn" onClick={handleClose}>
                <X size={18} strokeWidth={2} />
              </button>
            </div>
            
            <div className="modal-games-list">
              {games.length === 0 ? (
                <div className="modal-empty-state">
                  <CalendarDays size={28} strokeWidth={1.5} />
                  <p>No games scheduled on this date.</p>
                </div>
              ) : (
                games.map((game) => {
                  const home = teamMap.get(game.home_team_id);
                  const away = teamMap.get(game.away_team_id);
                  return (
                    <div
                      key={game.id}
                      className="modal-game-card"
                      onClick={() => setSelectedGame(game)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="modal-game-teams">
                        <div className="modal-team home-team">
                          <span className="team-abbr">{home?.abbreviation || 'TBD'}</span>
                          <span className="team-full-name">{home?.name || ''}</span>
                        </div>
                        
                        <div className="modal-vs-pill">VS</div>
                        
                        <div className="modal-team away-team">
                          <span className="team-abbr">{away?.abbreviation || 'TBD'}</span>
                          <span className="team-full-name">{away?.name || ''}</span>
                        </div>
                      </div>
                      
                      <div className="modal-game-score-wrap">
                        <span className="modal-score">
                          {game.status === 'completed' && game.home_score != null
                            ? `${game.home_score} - ${game.away_score}`
                            : '—'}
                        </span>
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