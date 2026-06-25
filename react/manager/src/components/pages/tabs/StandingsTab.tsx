// src/components/SelectedGame/tabs/StandingsTab.tsx
import React, { useState, useMemo } from 'react';
import { Team, StandingsRow } from '../../../api/leagueApi';
import './styles/StandingsTab.css';

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
  const [activeConference, setActiveConference] = useState<string>('all');
  const [activeDivision, setActiveDivision] = useState<string>('all');

  const getTeamById = (teamId: string) => teams.find((t) => t.id === teamId);

  const stringToColor = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return {
      primary: `hsl(${hue}, 70%, 55%)`,
      light: `hsl(${hue}, 70%, 75%)`,
      dark: `hsl(${hue}, 70%, 35%)`,
      glow: `hsla(${hue}, 70%, 55%, 0.3)`,
      gradient: `linear-gradient(135deg, hsl(${hue}, 70%, 55%), hsl(${hue}, 70%, 35%))`,
    };
  };

  const standingsWithTeam = useMemo(() => {
    return standings.map((row) => {
      const team = getTeamById(row.team_id);
      return { ...row, team };
    });
  }, [standings, teams]);

  const groupedStandings = useMemo(() => {
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
  }, [standingsWithTeam]);

  const conferences = useMemo(() => {
    const confs = new Set(groupedStandings.map(g => g.conference));
    return Array.from(confs).sort();
  }, [groupedStandings]);

  const divisions = useMemo(() => {
    if (activeConference === 'all') {
      const divs = new Set(groupedStandings.map(g => g.division));
      return Array.from(divs).sort();
    }
    const divs = new Set(
      groupedStandings
        .filter(g => g.conference === activeConference)
        .map(g => g.division)
    );
    return Array.from(divs).sort();
  }, [groupedStandings, activeConference]);

  const filteredGroups = useMemo(() => {
    return groupedStandings.filter(group => {
      if (activeConference !== 'all' && group.conference !== activeConference) return false;
      if (activeDivision !== 'all' && group.division !== activeDivision) return false;
      return true;
    });
  }, [groupedStandings, activeConference, activeDivision]);

  // Generate simulated GB timeline data for each team
  const generateTimelineData = (rows: typeof standingsWithTeam, weeks: number = 10) => {
    const sortedRows = [...rows].sort((a, b) => b.wins - a.wins);
    const firstPlaceWins = sortedRows[0]?.wins || 0;
    
    return sortedRows.map(row => {
      // Create a simulated timeline based on current record
      const currentGB = ((firstPlaceWins - row.wins) + (row.losses - sortedRows[0].losses)) / 2;
      const timeline = [];
      
      for (let week = 0; week < weeks; week++) {
        const progress = week / (weeks - 1);
        // Simulate some variance in performance throughout the season
        const variance = Math.sin(week * 0.8) * 1.5 + (Math.random() * 0.5);
        const gb = currentGB * progress + variance * (1 - progress);
        timeline.push({
          week: week + 1,
          gb: Math.max(-5, Math.min(10, gb)), // Clamp between -5 and 10
        });
      }
      
      return {
        ...row,
        timeline,
        currentGB,
      };
    });
  };

  return (
    <div className="tab-panel standings-panel">
      <div className="standings-header">
        <h4 className="standings-title">
          <span className="title-icon">📈</span>
          League Standings
        </h4>
        
        <div className="filter-controls">
          <div className="filter-group">
            <label className="filter-label">Conference</label>
            <div className="toggle-group">
              <button
                className={`toggle-btn ${activeConference === 'all' ? 'active' : ''}`}
                onClick={() => {
                  setActiveConference('all');
                  setActiveDivision('all');
                }}
              >
                All
              </button>
              {conferences.map(conf => (
                <button
                  key={conf}
                  className={`toggle-btn ${activeConference === conf ? 'active' : ''}`}
                  onClick={() => setActiveConference(conf)}
                >
                  {conf}
                </button>
              ))}
            </div>
          </div>
          
          <div className="filter-group">
            <label className="filter-label">Division</label>
            <div className="toggle-group">
              <button
                className={`toggle-btn ${activeDivision === 'all' ? 'active' : ''}`}
                onClick={() => setActiveDivision('all')}
              >
                All
              </button>
              {divisions.map(div => (
                <button
                  key={div}
                  className={`toggle-btn ${activeDivision === div ? 'active' : ''}`}
                  onClick={() => setActiveDivision(div)}
                >
                  {div}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="standings-content">
        {filteredGroups.map((group, groupIdx) => {
          const timelineData = generateTimelineData(group.rows);
          const maxGB = Math.max(...timelineData.flatMap(t => t.timeline.map(w => Math.abs(w.gb))), 5);
          
          return (
            <div key={groupIdx} className="division-card">
              <div className="division-card-header">
                <span className="conference-badge">{group.conference}</span>
                <span className="division-badge">{group.division}</span>
                <span className="division-teams-count">{timelineData.length} Teams</span>
              </div>
              
              <div className="division-content">
                {/* Timeline Chart Section - 70% */}
                <div className="chart-section">
                  <div className="timeline-chart-container">
                    <div className="timeline-chart">
                      {/* Y-axis labels */}
                      <div className="y-axis">
                        <div className="y-label top">+{maxGB.toFixed(0)}</div>
                        <div className="y-label middle">0 GB</div>
                        <div className="y-label bottom">-{maxGB.toFixed(0)}</div>
                      </div>
                      
                      {/* Chart area */}
                      <div className="chart-area">
                        {/* Grid lines */}
                        <div className="grid-line" style={{ top: '0%' }} />
                        <div className="grid-line" style={{ top: '50%' }} />
                        <div className="grid-line" style={{ top: '100%' }} />
                        
                        {/* Team lines */}
                        {timelineData.map((teamData, teamIdx) => {
                          const colors = stringToColor(teamData.team?.name || '');
                          const isUser = teamData.team_id === userTeamId;
                          
                          // Calculate SVG path
                          const points = teamData.timeline.map((point, i) => {
                            const x = (i / (teamData.timeline.length - 1)) * 100;
                            const y = 50 - (point.gb / maxGB) * 50;
                            return `${x},${y}`;
                          }).join(' ');
                          
                          // Area path for fill
                          const areaPoints = teamData.timeline.map((point, i) => {
                            const x = (i / (teamData.timeline.length - 1)) * 100;
                            const y = 50 - (point.gb / maxGB) * 50;
                            return `${x},${y}`;
                          });
                          const areaPath = `M ${areaPoints[0]} L ${areaPoints.join(' L ')} L ${areaPoints[areaPoints.length - 1].split(',')[0]},100 L ${areaPoints[0].split(',')[0]},100 Z`;
                          
                          return (
                            <svg key={teamData.team_id} className="team-line-svg" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible' }}>
                              {/* Area fill */}
                              <polygon
                                points={areaPath}
                                fill={colors.primary}
                                opacity={isUser ? 0.15 : 0.05}
                              />
                              
                              {/* Line */}
                              <polyline
                                points={points}
                                fill="none"
                                stroke={colors.primary}
                                strokeWidth={isUser ? '3' : '2'}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                opacity={isUser ? 1 : 0.7}
                                className="team-line"
                              />
                              
                              {/* Data points */}
                              {teamData.timeline.map((point, i) => {
                                const x = (i / (teamData.timeline.length - 1)) * 100;
                                const y = 50 - (point.gb / maxGB) * 50;
                                return (
                                  <circle
                                    key={i}
                                    cx={`${x}%`}
                                    cy={`${y}%`}
                                    r={isUser ? '4' : '3'}
                                    fill={colors.primary}
                                    stroke="white"
                                    strokeWidth="1"
                                    className="data-point"
                                  />
                                );
                              })}
                            </svg>
                          );
                        })}
                        
                        {/* X-axis labels */}
                        <div className="x-axis">
                          {timelineData[0]?.timeline.map((point, i) => (
                            <div
                              key={i}
                              className="x-label"
                              style={{ left: `${(i / (timelineData[0].timeline.length - 1)) * 100}%` }}
                            >
                              W{point.week}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    
                    {/* Legend */}
                    <div className="chart-legend">
                      {timelineData.map((teamData) => {
                        const colors = stringToColor(teamData.team?.name || '');
                        const isUser = teamData.team_id === userTeamId;
                        const initials = teamData.team?.name?.split(' ').map(w => w[0]).join('').slice(0, 2) || '??';
                        
                        return (
                          <div
                            key={teamData.team_id}
                            className={`legend-item ${isUser ? 'user-legend' : ''}`}
                          >
                            <div
                              className="legend-color"
                              style={{ backgroundColor: colors.primary }}
                            />
                            <span className="legend-name">{initials}</span>
                            <span className="legend-gb">{teamData.currentGB.toFixed(1)} GB</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                
                {/* Team List Section - 30% */}
                <div className="teams-section">
                  {timelineData.map((teamData, i) => {
                    const isUser = teamData.team_id === userTeamId;
                    const colors = stringToColor(teamData.team?.name || '');
                    const initials = teamData.team?.name?.split(' ').map(w => w[0]).join('').slice(0, 2) || '??';
                    const pct = (teamData.wins + teamData.losses) > 0 ? ((teamData.wins / (teamData.wins + teamData.losses)) * 100) : 0;
                    
                    return (
                      <div
                        key={teamData.team_id}
                        className={`team-card ${isUser ? 'user-team' : ''}`}
                      >
                        <div className="team-card-rank">#{i + 1}</div>
                        <div
                          className="team-card-avatar"
                          style={{
                            background: colors.gradient,
                            boxShadow: isUser ? `0 0 20px ${colors.glow}` : 'none',
                          }}
                        >
                          <span className="team-card-initials">{initials}</span>
                          {isUser && <span className="team-card-crown">👑</span>}
                        </div>
                        <div className="team-card-info">
                          <div className="team-card-name">{teamData.team?.name || 'Unknown'}</div>
                          <div className="team-card-record">
                            <span className="record-wins">{teamData.wins}-{teamData.losses}</span>
                            <span className="record-separator">·</span>
                            <span className="record-pct">{pct.toFixed(1)}%</span>
                            {teamData.currentGB > 0 && (
                              <>
                                <span className="record-separator">·</span>
                                <span className="record-gb">{teamData.currentGB.toFixed(1)} GB</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StandingsTab;