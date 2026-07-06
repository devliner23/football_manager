import React, { useEffect, useState } from 'react';
import { leagueAPI, TeamFinanceDetail, LeagueFinanceSummary } from '../../../../api/leagueApi';
import './styles/FinancePanel.css';

interface FinancePanelProps {
  savedGameId: string;
  userTeamId: string;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);

const formatCurrencyShort = (amount: number) => {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return formatCurrency(amount);
};

const FinancePanel: React.FC<FinancePanelProps> = ({ savedGameId, userTeamId }) => {
  const [teamDetail, setTeamDetail] = useState<TeamFinanceDetail | null>(null);
  const [leagueSummary, setLeagueSummary] = useState<LeagueFinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contractSort, setContractSort] = useState<'salary' | 'overall' | 'age' | 'years'>('salary');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [detail, summary] = await Promise.all([
          leagueAPI.getTeamFinanceDetail(savedGameId, userTeamId),
          leagueAPI.getLeagueFinanceSummary(savedGameId),
        ]);
        setTeamDetail(detail);
        setLeagueSummary(summary);
      } catch (err: any) {
        setError(err.message || 'Failed to load financial data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [savedGameId, userTeamId]);

  if (loading) {
    return (
      <div className="finance-panel-container">
        <div className="finance-state finance-state--loading">
          <div className="finance-state__ring" />
          <p>Loading financial data…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="finance-panel-container">
        <div className="finance-state finance-state--error">
          <span className="finance-state__icon">⚠</span>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!teamDetail || !leagueSummary) {
    return (
      <div className="finance-panel-container">
        <div className="finance-state">
          <p>No financial data available.</p>
        </div>
      </div>
    );
  }

  const { finances } = teamDetail;
  const capUsedPct = Math.min(100, Math.max(0, (finances.totalPayroll / finances.salaryCap) * 100));
  const isOverCap = finances.capSpace < 0;

  const sortedContracts = [...teamDetail.contracts].sort((a, b) => {
    switch (contractSort) {
      case 'overall':
        return b.overall - a.overall;
      case 'age':
        return a.age - b.age;
      case 'years':
        return b.yearsRemaining - a.yearsRemaining;
      default:
        return b.salary - a.salary;
    }
  });

  const leagueAvgPayroll = leagueSummary.averageTeamPayroll;
  const payrollVsLeagueDelta = finances.totalPayroll - leagueAvgPayroll;

  return (
    <div className="finance-panel-container">
      {/* ---------- Header / Cap Overview ---------- */}
      <section className="finance-hero glass-panel animated-border-glow-finance">
        <div className="finance-hero__top">
          <div>
            <span className="finance-hero__eyebrow">Front Office</span>
            <h2 className="finance-hero__title">{teamDetail.team.name}</h2>
          </div>
          <div className={`cap-pill ${isOverCap ? 'cap-pill--danger' : 'cap-pill--ok'}`}>
            {isOverCap ? 'Over the Cap' : 'Under the Cap'}
          </div>
        </div>

        <div className="cap-gauge">
          <div className="cap-gauge__track">
            <div
              className={`cap-gauge__fill ${isOverCap ? 'cap-gauge__fill--over' : ''}`}
              style={{ width: `${capUsedPct}%` }}
            />
          </div>
          <div className="cap-gauge__labels">
            <span>{formatCurrency(finances.totalPayroll)} committed</span>
            <span>{formatCurrency(finances.salaryCap)} cap</span>
          </div>
        </div>

        <div className="finance-hero__stats">
          <div className="hero-stat">
            <span className="hero-stat__label">Cap Space</span>
            <span className={`hero-stat__value ${isOverCap ? 'value-negative' : 'value-positive'}`}>
              {formatCurrency(finances.capSpace)}
            </span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat__label">Contracts</span>
            <span className="hero-stat__value">{finances.numberOfContracts}<span className="hero-stat__unit"> / 15</span></span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat__label">vs. League Avg Payroll</span>
            <span className={`hero-stat__value ${payrollVsLeagueDelta > 0 ? 'value-negative' : 'value-positive'}`}>
              {payrollVsLeagueDelta > 0 ? '+' : ''}{formatCurrencyShort(payrollVsLeagueDelta)}
            </span>
          </div>
        </div>
      </section>

      <div className="finance-layout">
        {/* ---------- Main column ---------- */}
        <div className="finance-main">
          <div className="finance-twin-grid">
            <div className="glass-panel finance-card-block">
              <h3 className="finance-card-block__title">
                <span className="panel-badge neon-amber">Top Earner</span>
              </h3>
              {finances.highestPaidPlayer ? (
                <div className="highest-paid">
                  <span className="highest-paid__name">{finances.highestPaidPlayer.name}</span>
                  <span className="highest-paid__salary">{formatCurrency(finances.highestPaidPlayer.salary)}</span>
                </div>
              ) : (
                <p className="finance-empty">No player under contract.</p>
              )}
            </div>

            <div className="glass-panel finance-card-block">
              <h3 className="finance-card-block__title">
                <span className="panel-badge neon-blue-badge">Expiring Soon</span>
              </h3>
              {finances.expiringContracts.length > 0 ? (
                <ul className="expiring-list">
                  {finances.expiringContracts.map((c) => (
                    <li key={c.playerId} className="expiring-list__item">
                      <span className="expiring-list__player">
                        {c.name} <span className="expiring-list__pos">{c.position}</span>
                      </span>
                      <span className="expiring-list__details">
                        {formatCurrency(c.salary)} · {c.yearsRemaining}yr left
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="finance-empty">No contracts expiring soon.</p>
              )}
            </div>
          </div>

          <div className="glass-panel finance-table-block">
            <div className="finance-table-block__header">
              <h3 className="finance-card-block__title">All Contracts</h3>
              <div className="sort-controls">
                <span className="sort-controls__label">Sort by</span>
                {(['salary', 'overall', 'age', 'years'] as const).map((key) => (
                  <button
                    key={key}
                    className={`sort-chip ${contractSort === key ? 'sort-chip--active' : ''}`}
                    onClick={() => setContractSort(key)}
                  >
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="contract-table-wrapper">
              <table className="contract-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Pos</th>
                    <th>OVR</th>
                    <th>Age</th>
                    <th>Salary</th>
                    <th>Years</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedContracts.map((c) => (
                    <tr key={c.contractId}>
                      <td className="contract-table__player">{c.playerName}</td>
                      <td><span className="pos-chip">{c.position}</span></td>
                      <td className="contract-table__ovr">{c.overall}</td>
                      <td>{c.age}</td>
                      <td className="contract-table__salary">{formatCurrency(c.salary)}</td>
                      <td>
                        <span className={c.yearsRemaining <= 1 ? 'value-negative' : ''}>
                          {c.yearsRemaining}
                        </span>
                        <span className="finance-muted">/{c.totalYears}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ---------- Sidebar: League Snapshot ---------- */}
        <aside className="finance-sidebar">
          <div className="glass-panel finance-sidebar__block">
            <span className="panel-badge neon-blue-badge">League Snapshot</span>
            <div className="league-stat-list">
              <div className="league-stat-row">
                <span className="league-stat-row__label">Total Teams</span>
                <span className="league-stat-row__value">{leagueSummary.totalTeams}</span>
              </div>
              <div className="league-stat-row">
                <span className="league-stat-row__label">Avg Team Payroll</span>
                <span className="league-stat-row__value">{formatCurrency(leagueSummary.averageTeamPayroll)}</span>
              </div>
              <div className="league-stat-row">
                <span className="league-stat-row__label">Avg Player Salary</span>
                <span className="league-stat-row__value">{formatCurrency(leagueSummary.averagePlayerSalary)}</span>
              </div>
            </div>
          </div>

          <div className="glass-panel finance-sidebar__block">
            <span className="panel-badge neon-amber">Top 5 Highest Paid</span>
            <ol className="top-earners-list">
              {leagueSummary.top5HighestPaid.map((p, idx) => (
                <li key={p.playerName} className="top-earners-list__item">
                  <span className="top-earners-list__rank">{idx + 1}</span>
                  <div className="top-earners-list__info">
                    <span className="top-earners-list__name">{p.playerName}</span>
                    <span className="top-earners-list__team">{p.team}</span>
                  </div>
                  <span className="top-earners-list__salary">{formatCurrencyShort(p.salary)}</span>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default FinancePanel;