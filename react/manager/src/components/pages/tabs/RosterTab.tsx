import React, { useState } from 'react';
import { Team, Player } from '../../../shared/index';
import "./styles/RosterTab.css";

interface RosterTabProps {
  teams: Team[];
  allPlayers: Player[];
  userTeamId?: string; // to pre‑select user’s team
  onViewPlayer: (player: Player) => void;
}

const RosterTab: React.FC<RosterTabProps> = ({
  teams,
  allPlayers,
  userTeamId,
  onViewPlayer,
}) => {
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(
    userTeamId || (teams.length > 0 ? teams[0].id : null)
  );

  // Get players for the selected team
  const selectedTeamPlayers = allPlayers.filter(
    (p) => p.team_id === selectedTeamId
  );

  // Sort players by overall rating (descending)
  const sortedPlayers = [...selectedTeamPlayers].sort(
    (a, b) => (b.overall_rating || 0) - (a.overall_rating || 0)
  );

  const selectedTeam = teams.find((t) => t.id === selectedTeamId);

  return (
    <div className="tab-panel roster-panel">
      <div className="roster-layout">
        {/* Left sidebar: team list */}
        <div className="team-list">
          <ul>
            {teams.map((team) => (
              <li
                key={team.id}
                className={`team-item ${team.id === selectedTeamId ? 'active' : ''}`}
                onClick={() => setSelectedTeamId(team.id)}
              >
                <span className="team-name">{team.name}</span>
                <span className="team-record">
                  {team.wins ?? 0}–{team.losses ?? 0}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right side: roster of selected team */}
        <div className="roster-content">
          {selectedTeam ? (
            <>
              <div className="roster-header">
                <h4>
                  {selectedTeam.name} Roster
                  <span className="roster-count">
                    {sortedPlayers.length} players
                  </span>
                </h4>
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
                    {sortedPlayers.map((player, index) => (
                      <tr key={player.id}>
                        <td>{index + 1}</td>
                        <td>{`${player.first_name} ${player.last_name}`}</td>
                        <td>{player.position}</td>
                        <td>
                          <span className="rating">{player.overall_rating}</span>
                        </td>
                        <td>{player.points ?? 0}</td>
                        <td>{player.rebounds ?? 0}</td>
                        <td>{player.assists ?? 0}</td>
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
                    {sortedPlayers.length === 0 && (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '20px' }}>
                          No players on this team yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p>Select a team to view its roster.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default RosterTab;