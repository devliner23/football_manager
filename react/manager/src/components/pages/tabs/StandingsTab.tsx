import React, { useState, useMemo } from 'react';
import { Team, StandingsRow } from '../../../api/leagueApi';
import {
  Trophy,
  BarChart3,
  Table2,
  Crosshair,
  Filter,
} from 'lucide-react';
import { ScatterChart } from '@mui/x-charts/ScatterChart';
import './styles/StandingsTab.css';

interface StandingsTabProps {
  standings: StandingsRow[];
  teams: Team[];
  userTeamId?: string;
}

type ChartView = 'bars' | 'table' | 'differential';

const CHART_VIEWS: { key: ChartView; label: string }[] = [
  { key: 'bars',         label: 'Rankings' },
  { key: 'table',        label: 'Table' },
  { key: 'differential', label: 'Differential' },
];

// ── Stable team color from name hash ──────────────────────────────────────────
function teamColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  return {
    main:   `hsl(${h}, 50%, 65%)`,
    dim:    `hsl(${h}, 30%, 40%)`,
    glass:  `hsla(${h}, 50%, 65%, 0.15)`,
    border: `hsla(${h}, 50%, 65%, 0.30)`,
  };
}

// ── Enriched row ──────────────────────────────────────────────────────────────
interface EnrichedRow extends StandingsRow {
  team?: Team;
  winPct: number;
  gamesBack: number;
  ppg: number;
  oppg: number;
  diff: number;
  isUser: boolean;
}

function enrich(
  rows: StandingsRow[],
  teams: Team[],
  userTeamId?: string
): EnrichedRow[] {
  const teamMap = new Map(teams.map(t => [t.id, t]));
  const sorted  = [...rows].sort((a, b) => {
    const pa = a.wins / Math.max(1, a.wins + a.losses);
    const pb = b.wins / Math.max(1, b.wins + b.losses);
    return pb - pa || b.wins - a.wins;
  });

  const leader = sorted[0];
  const leaderWins   = leader?.wins   ?? 0;
  const leaderLosses = leader?.losses ?? 0;

  return sorted.map(row => {
    const gp      = row.wins + row.losses;
    const winPct  = gp > 0 ? row.wins / gp : 0;
    const gamesBack = leader
      ? ((leaderWins - row.wins) + (row.losses - leaderLosses)) / 2
      : 0;
    const ppg  = gp > 0 ? (row.points_for  ?? 0) / gp : 0;
    const oppg = gp > 0 ? (row.points_against ?? 0) / gp : 0;

    return {
      ...row,
      team:      teamMap.get(row.team_id),
      winPct,
      gamesBack: Math.max(0, gamesBack),
      ppg,
      oppg,
      diff:      ppg - oppg,
      isUser:    row.team_id === userTeamId,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  SUB-VIEWS
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. Bars View ─────────────────────────────────────────────────────────────
function BarsView({ rows }: { rows: EnrichedRow[] }) {
  const maxWins = Math.max(...rows.map(r => r.wins), 1);

  return (
    <div className="bars-view">
      {rows.map((row, i) => {
        const c      = teamColor(row.team?.name ?? row.team_id);
        const abbrev = row.team?.abbreviation ?? row.team?.name?.slice(0, 3).toUpperCase() ?? '???';
        const barW   = (row.wins / maxWins) * 100;
        const lBarW  = (row.losses / maxWins) * 100;

        return (
          <div
            key={row.team_id}
            className={`bar-row ${row.isUser ? 'bar-row--user' : ''}`}
            style={{ '--team-color': c.main, '--team-glass': c.glass, '--team-border': c.border } as React.CSSProperties}
          >
            <span className="bar-rank">#{i + 1}</span>
            <span className="bar-abbrev">{abbrev}</span>

            <div className="bar-track">
              <div
                className="bar-fill bar-fill--win"
                style={{ width: `${barW}%`, background: c.main, boxShadow: `0 0 8px ${c.glass}` }}
              />
              <div
                className="bar-fill bar-fill--loss"
                style={{ width: `${lBarW}%`, background: c.dim }}
              />
            </div>

            <span className="bar-record">
              <strong>{row.wins}</strong>–<span className="bar-losses">{row.losses}</span>
            </span>
            <span className="bar-pct">{(row.winPct * 100).toFixed(1)}%</span>
            <span className="bar-gb">
              {row.gamesBack === 0 ? <span className="bar-leader">—</span> : `${row.gamesBack.toFixed(1)}`}
            </span>

            {row.isUser && <span className="bar-you">YOU</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── 2. Table View ─────────────────────────────────────────────────────────────
function TableView({ rows }: { rows: EnrichedRow[] }) {
  return (
    <div className="table-view-wrap">
      <table className="standings-table">
        <thead>
          <tr>
            <th>#</th>
            <th className="col-team">Team</th>
            <th>W</th>
            <th>L</th>
            <th>PCT</th>
            <th>GB</th>
            <th>Home</th>
            <th>Away</th>
            <th>PPG</th>
            <th>OPPG</th>
            <th>DIFF</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const c      = teamColor(row.team?.name ?? row.team_id);
            const name   = row.team?.name ?? 'Unknown';
            const abbrev = row.team?.abbreviation ?? name.slice(0, 3).toUpperCase();
            const diff   = row.diff;

            return (
              <tr
                key={row.team_id}
                className={`table-row ${row.isUser ? 'table-row--user' : ''}`}
                style={{ '--team-color': c.main } as React.CSSProperties}
              >
                <td className="td-rank">{i + 1}</td>
                <td className="td-team">
                  <span className="td-dot" style={{ background: c.main, boxShadow: `0 0 6px ${c.glass}` }} />
                  <span className="td-abbrev">{abbrev}</span>
                  <span className="td-name">{name}</span>
                  {row.isUser && <span className="td-you">YOU</span>}
                </td>
                <td className="td-num td-w">{row.wins}</td>
                <td className="td-num td-l">{row.losses}</td>
                <td className="td-num td-pct">{(row.winPct * 100).toFixed(1)}%</td>
                <td className="td-num">
                  {row.gamesBack === 0 ? <span className="td-leader">—</span> : row.gamesBack.toFixed(1)}
                </td>
                <td className="td-num td-split">
                  {row.home_wins ?? 0}–{row.home_losses ?? 0}
                </td>
                <td className="td-num td-split">
                  {row.away_wins ?? 0}–{row.away_losses ?? 0}
                </td>
                <td className="td-num">{row.ppg > 0 ? row.ppg.toFixed(1) : '—'}</td>
                <td className="td-num">{row.oppg > 0 ? row.oppg.toFixed(1) : '—'}</td>
                <td className={`td-num td-diff ${diff > 0 ? 'td-diff--pos' : diff < 0 ? 'td-diff--neg' : ''}`}>
                  {row.ppg > 0 ? (diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── 3. Differential Scatter (Modern MUI X Glass Implementation) ──────────
function DifferentialView({ rows }: { rows: EnrichedRow[] }) {
  const playedRows = rows.filter(r => r.wins + r.losses > 0);

  if (playedRows.length === 0) {
    return (
      <div className="diff-empty-state">
        <Crosshair size={32} strokeWidth={1.5} />
        <p>No games played yet. Simulate games to see the differential chart.</p>
      </div>
    );
  }

  // Format data for MUI X
  const data = playedRows.map(row => {
    const c = teamColor(row.team?.name ?? row.team_id);
    return {
      x: parseFloat(row.oppg.toFixed(1)),
      y: parseFloat(row.ppg.toFixed(1)),
      id: row.team_id,
      name: row.team?.abbreviation ?? '???',
      fullName: row.team?.name ?? 'Unknown',
      diff: row.diff,
      color: c,
      isUser: row.isUser,
    };
  });

  // Calculate domain bounds
  const minX = Math.floor(Math.min(...data.map(d => d.x)) - 2);
  const maxX = Math.ceil(Math.max(...data.map(d => d.x)) + 2);
  const minY = Math.floor(Math.min(...data.map(d => d.y)) - 2);
  const maxY = Math.ceil(Math.max(...data.map(d => d.y)) + 2);

  // Custom Glass Tooltip for MUI X
  const CustomGlassTooltip = (props: any) => {
    const pointData = props.context?.data?.[0];
    if (!pointData?.series?.data) return null;

    // Find the exact object from our array based on hover coordinates
    const hoveredItem = pointData.series.data.find(
      (d: any) => d.x === pointData.xAxis.value && d.y === pointData.yAxis.value
    );

    if (!hoveredItem) return null;

    const diffStr = hoveredItem.diff >= 0 ? `+${hoveredItem.diff.toFixed(1)}` : hoveredItem.diff.toFixed(1);

    return (
      <div style={{
        background: 'linear-gradient(135deg, rgba(20, 20, 30, 0.95), rgba(10, 10, 20, 0.98))',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid ${hoveredItem.color.main}50`,
        borderRadius: '12px',
        padding: '12px 16px',
        boxShadow: `0 10px 40px rgba(0,0,0,0.7), 0 0 20px ${hoveredItem.color.glass}`,
      }}>
        <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', fontWeight: 700, color: hoveredItem.color.main, letterSpacing: '0.5px' }}>
          {hoveredItem.fullName}
        </p>
        <div style={{ display: 'flex', gap: '16px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>
          <span>PPG: <strong style={{ color: '#fff' }}>{hoveredItem.y}</strong></span>
          <span>OPPG: <strong style={{ color: '#fff' }}>{hoveredItem.x}</strong></span>
          <span>DIFF: <strong style={{ color: hoveredItem.diff >= 0 ? '#4ade80' : '#f87171' }}>{diffStr}</strong></span>
        </div>
      </div>
    );
  };

  // Custom Dot Component to render our Glass Circles & Abbreviations
  const CustomScatterDot = (props: any) => {
    const { x, y, dataIndex, series } = props;
    const d = series?.data?.[dataIndex];
    if (!d) return null;
    const c = d.color;

    if (d.isUser) {
      return (
        <g>
          <circle cx={x} cy={y} r={12} fill="none" stroke={c.main} strokeWidth={1.5} opacity={0}>
            <animate attributeName="r" values="8;14;8" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx={x} cy={y} r={8} fill="none" stroke={c.main} strokeWidth={1} opacity={0.4} />
          <circle cx={x} cy={y} r={5} fill={c.glass} stroke={c.main} strokeWidth={2} />
          <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle" fill={c.main} fontSize="8" fontWeight="800" style={{ pointerEvents: 'none' }}>{d.name}</text>
        </g>
      );
    }

    return (
      <g>
        <circle cx={x} cy={y} r={6} fill={c.glass} stroke={c.main} strokeWidth={1.5} style={{ filter: `drop-shadow(0 0 4px ${c.glass})` }} />
        <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle" fill={c.main} fontSize="7" fontWeight="700" style={{ pointerEvents: 'none' }}>{d.name}</text>
      </g>
    );
  };

  // Custom SVG Injection for the 45-Degree Reference Line using MUI's internal D3 scales
  const DiagonalReferenceLine = (props: any) => {
    const { xAxis, yAxis } = props;
    if (!xAxis?.[0]?.scale || !yAxis?.[0]?.scale) return null;

    const xScale = xAxis[0].scale;
    const yScale = yAxis[0].scale;
    
    const startVal = Math.max(minX, minY);
    const endVal = Math.min(maxX, maxY);

    if (endVal <= startVal) return null;

    return (
      <line
        x1={xScale(startVal)}
        y1={yScale(startVal)}
        x2={xScale(endVal)}
        y2={yScale(endVal)}
        stroke="rgba(255, 255, 255, 0.15)"
        strokeDasharray="5 5"
        strokeWidth={2}
      />
    );
  };

  return (
    <div className="diff-view">
      <div className="diff-axis-label diff-axis-label--y">Points Scored (PPG)</div>

      <div className="diff-chart-wrap" style={{ 
        position: 'relative', 
        width: '100%', 
        height: '450px',
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: '12px',
        padding: '10px',
        boxSizing: 'border-box',
        backdropFilter: 'blur(10px)'
      }}>
        {/* Quadrant Labels */}
        <div style={{ position: 'absolute', top: 24, left: 24, fontSize: '0.65rem', color: 'rgba(74, 222, 128, 0.4)', fontWeight: 600, pointerEvents: 'none', zIndex: 10 }}>
          GOOD OFFENSE
        </div>
        <div style={{ position: 'absolute', bottom: 34, right: 24, fontSize: '0.65rem', color: 'rgba(248, 113, 113, 0.4)', fontWeight: 600, pointerEvents: 'none', zIndex: 10 }}>
          BAD DEFENSE
        </div>

        <ScatterChart
          margin={{ top: 20, right: 30, bottom: 40, left: 40 }}
          sx={{
            '.MuiChartsAxis-line': { stroke: 'rgba(255, 255, 255, 0.15)' },
            '.MuiChartsAxis-tick': { stroke: 'rgba(255, 255, 255, 0.15)' },
            '.MuiChartsAxis-tickLabel': { fill: 'rgba(255, 255, 255, 0.4)', fontSize: '11px' },
            '.MuiChartsGrid-line': { stroke: 'rgba(255, 255, 255, 0.04)', strokeDasharray: '3 3' },
          }}
          xAxis={[{
            min: minX,
            max: maxX,
            label: 'Points Allowed (OPPG)',
            labelStyle: { fill: 'rgba(255, 255, 255, 0.5)', fontSize: '12px', fontWeight: 600 },
          }]}
          yAxis={[{
            min: minY,
            max: maxY,
            label: 'Points Scored (PPG)',
            labelStyle: { fill: 'rgba(255, 255, 255, 0.5)', fontSize: '12px', fontWeight: 600 },
          }]}
          series={[{
            data: data,
            markerSize: 8,
            // Hide default MUI X dot borders by making them transparent
            color: 'transparent', 
          }]}
          slots={{
            tooltip: CustomGlassTooltip,
          }}
        />
      </div>

      <div className="diff-axis-label diff-axis-label--x">Points Allowed (OPPG)</div>

      {/* Legend */}
      <div className="diff-legend">
        {playedRows.map(row => {
          const c = teamColor(row.team?.name ?? row.team_id);
          return (
            <div key={row.team_id} className={`diff-legend-item ${row.isUser ? 'diff-legend-item--user' : ''}`}>
              <span className="diff-legend-dot" style={{ background: c.main, boxShadow: `0 0 6px ${c.glass}` }} />
              <span className="diff-legend-abbr" style={{ color: c.main }}>{row.team?.abbreviation ?? '???'}</span>
              <span className={`diff-legend-diff ${row.diff >= 0 ? 'pos' : 'neg'}`}>
                {row.ppg > 0 ? (row.diff >= 0 ? `+${row.diff.toFixed(1)}` : row.diff.toFixed(1)) : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const StandingsTab: React.FC<StandingsTabProps> = ({ standings, teams, userTeamId }) => {
  const [activeConference, setActiveConference] = useState<string>('all');
  const [activeDivision,   setActiveDivision]   = useState<string>('all');
  const [chartView,        setChartView]         = useState<ChartView>('bars');

  const enrichedAll = useMemo(() => enrich(standings, teams, userTeamId), [standings, teams, userTeamId]);

  const groups = useMemo(() => {
    const map = new Map<string, EnrichedRow[]>();
    enrichedAll.forEach(row => {
      const conf = row.team?.conference ?? 'Unknown';
      const div  = row.team?.division   ?? 'Unknown';
      const key  = `${conf}||${div}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    });
    return Array.from(map.entries())
      .map(([key, rows]) => {
        const [conference, division] = key.split('||');
        return { conference, division, rows };
      })
      .sort((a, b) => a.conference.localeCompare(b.conference) || a.division.localeCompare(b.division));
  }, [enrichedAll]);

  const conferences = useMemo(() => Array.from(new Set(groups.map(g => g.conference))).sort(), [groups]);

  const divisions = useMemo(() => {
    const src = activeConference === 'all' ? groups : groups.filter(g => g.conference === activeConference);
    return Array.from(new Set(src.map(g => g.division))).sort();
  }, [groups, activeConference]);

  const filteredGroups = useMemo(() => {
    return groups.filter(g => {
      if (activeConference !== 'all' && g.conference !== activeConference) return false;
      if (activeDivision   !== 'all' && g.division   !== activeDivision)   return false;
      return true;
    });
  }, [groups, activeConference, activeDivision]);

  const flatRows = useMemo(
    () => filteredGroups.flatMap(g => g.rows).sort((a, b) => b.winPct - a.winPct || b.wins - a.wins),
    [filteredGroups]
  );

  const showFlat = activeConference !== 'all' || activeDivision !== 'all';

  return (
    <div className="standings-panel">
      {/* ── Header ── */}
      <div className="standings-header">
        <div className="standings-title-group">
          <Trophy size={20} strokeWidth={2} className="standings-title-icon" />
          <div>
            <h4 className="standings-title">League Standings</h4>
            <span className="standings-subtitle">{enrichedAll.length} Teams</span>
          </div>
        </div>

        <div className="standings-controls">
          <div className="view-switcher">
            {CHART_VIEWS.map(v => (
              <button
                key={v.key}
                className={`view-btn ${chartView === v.key ? 'view-btn--active' : ''}`}
                onClick={() => setChartView(v.key)}
              >
                {v.key === 'bars' && <BarChart3 size={14} />}
                {v.key === 'table' && <Table2 size={14} />}
                {v.key === 'differential' && <Crosshair size={14} />}
                {v.label}
              </button>
            ))}
          </div>

          <div className="filter-controls">
            <div className="filter-group">
              <span className="filter-label">
                <Filter size={11} strokeWidth={2} />
                Conference
              </span>
              <div className="toggle-group">
                <button className={`toggle-btn ${activeConference === 'all' ? 'active' : ''}`} onClick={() => { setActiveConference('all'); setActiveDivision('all'); }}>All</button>
                {conferences.map(c => (
                  <button key={c} className={`toggle-btn ${activeConference === c ? 'active' : ''}`} onClick={() => setActiveConference(c)}>{c}</button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <span className="filter-label">
                <Filter size={11} strokeWidth={2} />
                Division
              </span>
              <div className="toggle-group">
                <button className={`toggle-btn ${activeDivision === 'all' ? 'active' : ''}`} onClick={() => setActiveDivision('all')}>All</button>
                {divisions.map(d => (
                  <button key={d} className={`toggle-btn ${activeDivision === d ? 'active' : ''}`} onClick={() => setActiveDivision(d)}>{d}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="standings-content">
        {showFlat ? (
          <div className="division-card">
            <div className="division-card-header">
              {activeConference !== 'all' && <span className="conference-badge">{activeConference}</span>}
              {activeDivision   !== 'all' && <span className="division-badge">{activeDivision}</span>}
              <span className="division-teams-count">{flatRows.length} Teams</span>
            </div>
            {chartView === 'bars'         && <BarsView         rows={flatRows} />}
            {chartView === 'table'        && <TableView        rows={flatRows} />}
            {chartView === 'differential' && <DifferentialView rows={flatRows} />}
          </div>
        ) : (
          filteredGroups.map((group, idx) => (
            <div key={idx} className="division-card">
              <div className="division-card-header">
                <span className="conference-badge">{group.conference}</span>
                <span className="division-badge">{group.division}</span>
                <span className="division-teams-count">{group.rows.length} Teams</span>
              </div>
              {chartView === 'bars'         && <BarsView         rows={group.rows} />}
              {chartView === 'table'        && <TableView        rows={group.rows} />}
              {chartView === 'differential' && <DifferentialView rows={group.rows} />}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default StandingsTab;