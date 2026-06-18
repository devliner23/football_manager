// src/components/SelectedGame/PlayerModal.tsx
import React from 'react';
import { Player } from '../../api/leagueApi';

interface PlayerModalProps {
  player: Player | null;
  onClose: () => void;
}

const PlayerModal: React.FC<PlayerModalProps> = ({ player, onClose }) => {
  if (!player) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h2>{player.first_name} {player.last_name}</h2>
        <div className="modal-grid">
          <div className="modal-item">
            <span className="modal-label">Position</span>
            <span className="modal-value">{player.position}</span>
          </div>
          <div className="modal-item">
            <span className="modal-label">Overall Rating</span>
            <span className="modal-value">{player.overall_rating}</span>
          </div>
          <div className="modal-item">
            <span className="modal-label">Points</span>
            <span className="modal-value">{player.points ?? 0}</span>
          </div>
          <div className="modal-item">
            <span className="modal-label">Rebounds</span>
            <span className="modal-value">{player.rebounds ?? 0}</span>
          </div>
          <div className="modal-item">
            <span className="modal-label">Assists</span>
            <span className="modal-value">{player.assists ?? 0}</span>
          </div>
          <div className="modal-item">
            <span className="modal-label">Age</span>
            <span className="modal-value">{player.age}</span>
          </div>
          <div className="modal-item">
            <span className="modal-label">Height</span>
            <span className="modal-value">{player.height}''</span>
          </div>
          <div className="modal-item">
            <span className="modal-label">Weight</span>
            <span className="modal-value">{player.weight} lbs</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerModal;