import React from 'react';
import { SavedGame } from '../../types';

interface SavedGamesProps {
  games: SavedGame[];
  onSelect: (game: SavedGame) => void;
  onDelete: (id: string) => void;
  selectedId: string | null;
}

const SavedGames: React.FC<SavedGamesProps> = ({ games, onSelect, onDelete, selectedId }) => {
  if (games.length === 0) {
    return (
      <div className="no-games-message">
        <p>No saved games yet</p>
        <p className="hint">Start your first season!</p>
      </div>
    );
  }

  return (
    <div className="games-grid">
      {games.map((game) => (
        <div
          key={game.id}
          className={`game-card ${selectedId === game.id ? 'selected' : ''}`}
          onClick={() => onSelect(game)}
        >
          <h4>{game.name}</h4>
          <div className="game-meta">
            <span>Season {game.current_season}</span>
            <span>Club: {game.managed_club_id}</span>
          </div>
          <div className="game-actions">
            <button 
              className="continue-button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(game);
              }}
            >
              Continue
            </button>
            <button 
              className="delete-button"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Delete "${game.name}"?`)) {
                  onDelete(game.id);
                }
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SavedGames;