import React, { useState, useMemo } from 'react';
import { Team, Player } from '../../../shared/index';
import { StandingsRow } from '../../../api/leagueApi';
import {
  Users,
  User,
  Trophy,
  TrendingUp,
  Eye,
  Star,
  Activity,
  BarChart3,
  Hash,
} from 'lucide-react';
import PlayerViewModal from './tabComponents/PlayerViewModal';
import './styles/RosterTab.css';

interface RosterTabProps {
  teams: Team[];
  allPlayers: Player[];
  userTeamId?: string;
  onViewPlayer: (player: Player) => void;
  standings: StandingsRow[];
}

const RosterTab: React.FC<RosterTabProps> = ({
  teams,
  allPlayers,
  userTeamId,
  onViewPlayer,
  standings,
}) => {
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(
    userTeamId || (teams.length > 0 ? teams[0].id : null)
  );
  const [viewingPlayer, setViewingPlayer] = useState<Player | null>(null);

  const standingsMap = useMemo(() => {
    const map: Record<string, StandingsRow> = {};
    standings.forEach((row) => { map[row.team_id] = row; });
    return map;
  }, [standings]);

  const conferenceRanks = useMemo(() => {
    const ranks: Record<string, number> = {};
    const conferences: Record<string, StandingsRow[]> = {};
    standings.forEach((row) => {
      const conf = row.conference || 'Unknown';
      if (!conferences[conf]) conferences[conf] = [];
      conferences[conf].push(row);
    });
    Object.values(conferences).forEach((teamsInConf) => {
      teamsInConf.sort((a, b) => (b.win_pct || 0) - (a.win_pct || 0));
      teamsInConf.forEach((team, index) => { ranks[team.team_id] = index + 1; });
    });
    return ranks;
  }, [standings]);

  const getStandingsForTeam = (teamId: string): StandingsRow | undefined => standingsMap[teamId];

  const selectedTeamPlayers = allPlayers.filter((p) => p.team_id === selectedTeamId);
  const sortedPlayers = [...selectedTeamPlayers].sort((a, b) => (b.overall_rating || 0) - (a.overall_rating || 0));

  const selectedTeam = teams.find((t) => t.id === selectedTeamId);
  const selectedTeamStandings = selectedTeamId ? getStandingsForTeam(selectedTeamId) : undefined;
  const topPlayers = sortedPlayers.slice(0, 3);

  return (
    <div className="roster-panel">
      <div className="roster-layout">
        {/* Left sidebar: team list */}
        <div className="team-list-container">
          <div className="team-list-header">
            <Users size={16} strokeWidth={2} />
            <span>Teams</span>
            <span className="team-list-count">{teams.length}</span>
          </div>
          
          <ul className="team-list">
            {teams.map((team) => {
              const st = getStandingsForTeam(team.id);
              const confRank = st ? conferenceRanks[team.id] : undefined;
              const wins = st?.wins ?? team.wins ?? 0;
              const losses = st?.losses ?? team.losses ?? 0;

              return (
                <li
                  key={team.id}
                  className={`team-item ${team.id === selectedTeamId ? 'active' : ''}`}
                  onClick={() => setSelectedTeamId(team.id)}
                >
                  <div className="team-info">
                    <span className="team-name">{st?.team_name || team.name}</span>
                    <div className="team-meta-row">
                      {confRank && (
                        <span className="team-rank">
                          <Hash size={10} strokeWidth={2.5} />
                          {confRank}
                        </span>
                      )}
                      <span className="team-record">{wins}–{losses}</span>
                    </div>
                  </div>
                  {team.id === selectedTeamId && (
                    <div className="team-active-indicator" />
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Right side: roster of selected team */}
        <div className="roster-content">
          {selectedTeam ? (
            <>
              {/* Roster Header Card */}
              <div className="roster-header-card">
                <div className="roster-header-left">
                  <div className="roster-header-icon-wrap">
                    <Trophy size={18} strokeWidth={2} />
                  </div>
                  <div>
                    <h4 className="roster-title">
                      {selectedTeamStandings && conferenceRanks[selectedTeam.id] && (
                        <span className="header-rank-badge">
                          #{conferenceRanks[selectedTeam.id]} {selectedTeamStandings.conference}
                        </span>
                      )}
                      {selectedTeamStandings?.team_name || selectedTeam.name}
                    </h4>
                    <span className="roster-subtitle">{sortedPlayers.length} players on roster</span>
                  </div>
                </div>
                <div className="roster-header-right">
                  <div className="team-stats-badge">
                    <TrendingUp size={14} strokeWidth={2} />
                    <span>
                      {selectedTeamStandings?.wins ?? selectedTeam.wins ?? 0}W – {selectedTeamStandings?.losses ?? selectedTeam.losses ?? 0}L
                    </span>
                  </div>
                </div>
              </div>

              {/* Top Players Showcase Card */}
              {topPlayers.length > 0 && (
                <div className="top-players-card">
                  <div className="top-players-label">
                    <Star size={13} strokeWidth={2} />
                    <span>Top Performers</span>
                  </div>
                  <div className="top-players-grid">
                    {topPlayers.map((player, index) => (
                      <div key={player.id} className="top-player-item">
                        <div className="top-player-rank">#{index + 1}</div>
                        <div className="top-player-info">
                          <span className="top-player-name">
                            {player.first_name} {player.last_name}
                          </span>
                          <span className="top-player-pos">{player.position}</span>
                        </div>
                        <div className="top-player-rating-wrap">
                          <span className={`top-player-ovr ${player.overall_rating >= 85 ? 'ovr-elite' : player.overall_rating >= 70 ? 'ovr-good' : 'ovr-avg'}`}>
                            {player.overall_rating}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Roster Table Card */}
              <div className="roster-table-card">
                <div className="roster-table-container">
                  <table className="roster-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th className="col-player">Player</th>
                        <th>Pos</th>
                        <th>
                          <div className="th-content">
                            <Star size={12} strokeWidth={2} />
                            <span>OVR</span>
                          </div>
                        </th>
                        <th>
                          <div className="th-content">
                            <Activity size={12} strokeWidth={2} />
                            <span>PPG</span>
                          </div>
                        </th>
                        <th>
                          <div className="th-content">
                            <BarChart3 size={12} strokeWidth={2} />
                            <span>RPG</span>
                          </div>
                        </th>
                        <th>
                          <div className="th-content">
                            <BarChart3 size={12} strokeWidth={2} />
                            <span>APG</span>
                          </div>
                        </th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPlayers.map((player, index) => (
                        <tr key={player.id} className="player-row">
                          <td className="td-rank">{index + 1}</td>
                          <td className="td-player">
                            <User size={14} strokeWidth={2} className="player-icon" />
                            <span className="player-full-name">{player.first_name} {player.last_name}</span>
                          </td>
                          <td>
                            <span className="position-badge">{player.position}</span>
                          </td>
                          <td>
                            <span className={`rating-cell ${player.overall_rating >= 85 ? 'elite' : player.overall_rating >= 70 ? 'good' : 'average'}`}>
                              {player.overall_rating}
                            </span>
                          </td>
                          <td className="td-stat">{player.points ?? 0}</td>
                          <td className="td-stat">{player.rebounds ?? 0}</td>
                          <td className="td-stat">{player.assists ?? 0}</td>
                          <td>
                            <button className="view-player-btn" onClick={() => setViewingPlayer(player)}>
                              <Eye size={14} strokeWidth={2} />
                              <span>View</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                      {sortedPlayers.length === 0 && (
                        <tr>
                          <td colSpan={8} className="empty-state-cell">
                            <Users size={32} strokeWidth={1.5} />
                            <p>No players on this team yet.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state-main">
              <Users size={40} strokeWidth={1.5} />
              <p>Select a team to view its roster.</p>
            </div>
          )}
        </div>
      </div>

      {viewingPlayer && (
        <PlayerViewModal
          player={viewingPlayer}
          teamName={selectedTeamStandings?.team_name || selectedTeam?.name}
          teamWins={selectedTeamStandings?.wins ?? selectedTeam?.wins}
          teamLosses={selectedTeamStandings?.losses ?? selectedTeam?.losses}
          onClose={() => setViewingPlayer(null)}
        />
      )}
    </div>
  );
};

export default RosterTab;