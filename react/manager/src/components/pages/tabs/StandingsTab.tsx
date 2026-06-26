// src/components/SelectedGame/tabs/StandingsTab.tsx
import React, { useState, useMemo } from 'react';
import { Team, StandingsRow } from '../../../api/leagueApi';
import './styles/StandingsTab.css';

interface StandingsTabProps {
  standings: StandingsRow[];
  teams: Team[];
  userTeamId?: string;
}

type ChartView = 'bars' | 'table' | 'differential';

const CHART_VIEWS: { key: ChartView; label: string; icon: string }[] = [
  { key: 'bars',         label: 'Rankings',     icon: '▬' },
  { key: 'table',        label: 'Table',         icon: '☰' },
  { key: 'differential', label: 'Differential',  icon: '◎' },
];

// ── Stable team color from name hash ──────────────────────────────────────────
function teamColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  return {
    main:   `hsl(${h}, 65%, 58%)`,
    dim:    `hsl(${h}, 55%, 38%)`,
    glass:  `hsla(${h}, 65%, 58%, 0.18)`,
    border: `hsla(${h}, 65%, 58%, 0.35)`,
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
            {/* Rank */}
            <span className="bar-rank">#{i + 1}</span>

            {/* Abbrev */}
            <span className="bar-abbrev">{abbrev}</span>

            {/* Win/Loss stacked bar */}
            <div className="bar-track">
              <div
                className="bar-fill bar-fill--win"
                style={{ width: `${barW}%`, background: c.main }}
              />
              <div
                className="bar-fill bar-fill--loss"
                style={{ width: `${lBarW}%`, background: c.dim, opacity: 0.35 }}
              />
            </div>

            {/* Stats */}
            <span className="bar-record">
              <strong>{row.wins}</strong>–<span className="bar-losses">{row.losses}</span>
            </span>
            <span className="bar-pct">{(row.winPct * 100).toFixed(1)}%</span>
            <span className="bar-gb">
              {row.gamesBack === 0 ? <span className="bar-leader">—</span> : `${row.gamesBack.toFixed(1)} GB`}
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
    <div className="table-view">
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
                  <span className="td-dot" style={{ background: c.main }} />
                  <span className="td-abbrev">{abbrev}</span>
                  <span className="td-name">{name}</span>
                  {row.isUser && <span className="td-you">you</span>}
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

// ── 3. Differential Scatter ──────────────────────────────────────────────────
function DifferentialView({ rows }: { rows: EnrichedRow[] }) {
  const playedRows = rows.filter(r => r.wins + r.losses > 0);

  if (playedRows.length === 0) {
    return (
      <div className="diff-empty">
        No games played yet. Simulate some games to see the differential chart.
      </div>
    );
  }

  const ppgs  = playedRows.map(r => r.ppg);
  const oppgs = playedRows.map(r => r.oppg);
  const minX  = Math.floor(Math.min(...oppgs) - 2);
  const maxX  = Math.ceil(Math.max(...oppgs)  + 2);
  const minY  = Math.floor(Math.min(...ppgs)  - 2);
  const maxY  = Math.ceil(Math.max(...ppgs)   + 2);

  const toSvgX = (v: number) => ((v - minX) / (maxX - minX)) * 100;
  const toSvgY = (v: number) => 100 - ((v - minY) / (maxY - minY)) * 100;

  // Diagonal line where ppg === oppg  →  "break-even"
  const diagX1 = toSvgX(minX); const diagY1 = toSvgY(minX);
  const diagX2 = toSvgX(maxX); const diagY2 = toSvgY(maxX);

  return (
    <div className="diff-view">
      <div className="diff-axis-label diff-axis-label--y">Points Scored (PPG)</div>

      <div className="diff-chart-wrap">
        <div className="diff-y-ticks">
          {[maxY, (maxY + minY) / 2, minY].map(v => (
            <span key={v}>{v.toFixed(0)}</span>
          ))}
        </div>

        <svg
          className="diff-svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {/* Grid */}
          {[25, 50, 75].map(p => (
            <React.Fragment key={p}>
              <line x1={p} y1="0" x2={p} y2="100" stroke="rgba(255,255,255,0.04)" strokeWidth="0.4" />
              <line x1="0" y1={p} x2="100" y2={p} stroke="rgba(255,255,255,0.04)" strokeWidth="0.4" />
            </React.Fragment>
          ))}

          {/* Break-even diagonal */}
          <line
            x1={diagX1} y1={diagY1}
            x2={diagX2} y2={diagY2}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="0.5"
            strokeDasharray="2 2"
          />

          {/* Quadrant tint: above diagonal = positive diff */}
          <defs>
            <linearGradient id="posGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(74,222,128,0.06)" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
            <linearGradient id="negGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="rgba(248,113,113,0.06)" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="100" height="100" fill="url(#posGrad)" />
          <rect x="0" y="0" width="100" height="100" fill="url(#negGrad)" />

          {/* Bubbles */}
          {playedRows.map(row => {
            const cx = toSvgX(row.oppg);
            const cy = toSvgY(row.ppg);
            const c  = teamColor(row.team?.name ?? row.team_id);
            const abbr = row.team?.abbreviation ?? '???';
            const r  = row.isUser ? 4.5 : 3.2;

            return (
              <g key={row.team_id} className="bubble-group">
                {/* Glow ring */}
                {row.isUser && (
                  <circle cx={cx} cy={cy} r={r + 2} fill="none"
                    stroke={c.main} strokeWidth="0.6" opacity="0.5" />
                )}
                <circle cx={cx} cy={cy} r={r} fill={c.glass} stroke={c.main} strokeWidth="0.5" />
                <text
                  x={cx} y={cy + 0.9}
                  textAnchor="middle"
                  fontSize="2.2"
                  fontWeight="700"
                  fill={c.main}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {abbr}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="diff-x-ticks">
          {[minX, (minX + maxX) / 2, maxX].map(v => (
            <span key={v}>{v.toFixed(0)}</span>
          ))}
        </div>
      </div>

      <div className="diff-axis-label diff-axis-label--x">Points Allowed (OPPG)</div>

      {/* Quadrant labels */}
      <div className="diff-quadrants">
        <div className="diff-quad diff-quad--good">↑ High Offense / Low Defense (Best)</div>
        <div className="diff-quad diff-quad--bad">↓ Low Offense / High Defense (Worst)</div>
      </div>

      {/* Legend strip */}
      <div className="diff-legend">
        {playedRows.map(row => {
          const c = teamColor(row.team?.name ?? row.team_id);
          return (
            <div
              key={row.team_id}
              className={`diff-legend-item ${row.isUser ? 'diff-legend-item--user' : ''}`}
            >
              <span className="diff-legend-dot" style={{ background: c.main }} />
              <span className="diff-legend-abbr" style={{ color: c.main }}>
                {row.team?.abbreviation ?? '???'}
              </span>
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

  // ── Enriched rows with derived stats ──────────────────────────────────────
  const enrichedAll = useMemo(() => enrich(standings, teams, userTeamId), [standings, teams, userTeamId]);

  // ── Group by conference + division ────────────────────────────────────────
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
    const src = activeConference === 'all'
      ? groups
      : groups.filter(g => g.conference === activeConference);
      return Array.from(new Set(src.map(g => g.division))).sort();
    }, [groups, activeConference]);

  const filteredGroups = useMemo(() => {
    return groups.filter(g => {
      if (activeConference !== 'all' && g.conference !== activeConference) return false;
      if (activeDivision   !== 'all' && g.division   !== activeDivision)   return false;
      return true;
    });
  }, [groups, activeConference, activeDivision]);

  // When filtering to a single division, flatten rows for "all teams" chart
  const flatRows = useMemo(
    () => filteredGroups.flatMap(g => g.rows).sort((a, b) => b.winPct - a.winPct || b.wins - a.wins),
    [filteredGroups]
  );

  const showFlat = activeConference !== 'all' || activeDivision !== 'all';

  return (
    <div className="standings-panel">

      {/* ── Header ── */}
      <div className="standings-header">
        <h4 className="standings-title">
          <span className="title-icon">📈</span>
          League Standings
        </h4>

        <div className="standings-controls">
          {/* Chart-view switcher */}
          <div className="view-switcher">
            {CHART_VIEWS.map(v => (
              <button
                key={v.key}
                className={`view-btn ${chartView === v.key ? 'view-btn--active' : ''}`}
                onClick={() => setChartView(v.key)}
              >
                <span className="view-btn-icon">{v.icon}</span>
                {v.label}
              </button>
            ))}
          </div>

          {/* Conference / Division filters */}
          <div className="filter-controls">
            <div className="filter-group">
              <span className="filter-label">Conference</span>
              <div className="toggle-group">
                <button
                  className={`toggle-btn ${activeConference === 'all' ? 'active' : ''}`}
                  onClick={() => { setActiveConference('all'); setActiveDivision('all'); }}
                >All</button>
                {conferences.map(c => (
                  <button
                    key={c}
                    className={`toggle-btn ${activeConference === c ? 'active' : ''}`}
                    onClick={() => setActiveConference(c)}
                  >{c}</button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <span className="filter-label">Division</span>
              <div className="toggle-group">
                <button
                  className={`toggle-btn ${activeDivision === 'all' ? 'active' : ''}`}
                  onClick={() => setActiveDivision('all')}
                >All</button>
                {divisions.map(d => (
                  <button
                    key={d}
                    className={`toggle-btn ${activeDivision === d ? 'active' : ''}`}
                    onClick={() => setActiveDivision(d)}
                  >{d}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="standings-content">
        {showFlat ? (
          /* Single flat section when filtered */
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
          /* Per-division cards */
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