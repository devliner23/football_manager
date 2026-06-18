// src/components/SelectedGame/tabs/StandingsTab.tsx
import React from 'react';
import { Team, StandingsRow } from '../../../api/leagueApi';

interface StandingsTabProps {
  standings: StandingsRow[];
  teams: Team[];
  userTeamId?: string;
}

const StandingsTab: React.FC<StandingsTabProps> = ({
  standings,
  teams,
  userTeamId,
}) => {
  const getTeamById = (teamId: string) => teams.find((t) => t.id === teamId);

  const stringToColor = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 70%, 55%)`;
  };

  const standingsWithTeam = standings.map((row) => {
    const team = getTeamById(row.team_id);
    return { ...row, team };
  });

  // Group standings by conference/division
  const groupedStandings = () => {
    const map = new Map<string, typeof standingsWithTeam>();
    standingsWithTeam.forEach(row => {
      const team = row.team;
      if (!team) return;
      const key = `${team.conference}-${team.division}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    });
    
    const groups: { conference: string; division: string; rows: typeof standingsWithTeam }[] = [];
    const entries = Array.from(map.entries());
    for (const [key, rows] of entries) {
        const [conference, division] = key.split('-');
        groups.push({ conference, division, rows });
    }
    groups.sort((a, b) => a.conference.localeCompare(b.conference) || a.division.localeCompare(b.division));
    return groups;
  };

  return (
    <div className="tab-panel standings-panel">
      <h4>📈 League Standings</h4>
      <div className="standings-container">
        {groupedStandings().map((group, idx) => {
          const first = group.rows[0];
          
          return (
            <div key={idx} className="standings-group">
              <div className="standings-group-header">
                <span className="conference">{group.conference}</span>
                <span className="division">{group.division}</span>
              </div>
              <table className="standings-table">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>W</th>
                    <th>L</th>
                    <th>PCT</th>
                    <th>GB</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row, i) => {
                    const isUser = row.team_id === userTeamId;
                    const color = stringToColor(row.team?.name || '');
                    const initials = row.team?.name?.split(' ').map(w => w[0]).join('').slice(0,2) || '??';
                    const gb = first ? ((first.wins - row.wins) + (row.losses - first.losses)) / 2 : 0;
                    const gbDisplay = gb === 0 ? '-' : gb.toFixed(1);
                    const pct = (row.wins + row.losses) > 0 ? ((row.wins / (row.wins + row.losses)) * 100) : 0;
                    const isPlayoff = i < 8;

                    return (
                      <tr key={row.team_id} className={isUser ? 'highlighted' : ''}>
                        <td className="team-cell">
                          <div className="team-avatar" style={{ backgroundColor: color }}>
                            {initials}
                          </div>
                          <span className="team-name">{row.team?.name || 'Unknown'}</span>
                          {isUser && <span className="user-badge">⭐</span>}
                        </td>
                        <td className="wins">{row.wins}</td>
                        <td className="losses">{row.losses}</td>
                        <td>
                          <div className="pct-bar">
                            <div className="pct-fill" style={{ width: `${pct}%`, backgroundColor: color }}></div>
                            <span className="pct-label">{pct.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td>{gbDisplay}</td>
                        <td>
                          {isPlayoff ? (
                            <span className="playoff-badge">🏆</span>
                          ) : (
                            <span className="playoff-badge eliminated">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StandingsTab;