// src/components/pages/tabs/RosterTab.tsx
import React from 'react';
import { Player } from '../../../shared/index';

interface RosterTabProps {
  players: Player[];
  onViewPlayer: (player: Player) => void;
}

const RosterTab: React.FC<RosterTabProps> = ({ players, onViewPlayer }) => {
  return (
    <div className="tab-panel roster-panel">
      <div className="roster-header">
        <h4>👥 Team Roster</h4>
        <span className="roster-count">{players.length} players</span>
      </div>
      <div className="roster-table">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Position</th>
              <th>Rating</th>
              <th>PPG</th>
              <th>RPG</th>
              <th>APG</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player, index) => (
              <tr key={player.id}>
                <td>{index + 1}</td>
                <td>{`${player.first_name} ${player.last_name}`}</td>
                <td>{player.position}</td>
                <td><span className="rating">{player.overall_rating}</span></td>
                <td>{player.points || 0}</td>
                <td>{player.rebounds || 0}</td>
                <td>{player.assists || 0}</td>
                <td>
                  <button
                    className="view-player-btn"
                    onClick={() => onViewPlayer(player)}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RosterTab;