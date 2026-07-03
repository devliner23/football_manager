import React, { useEffect, useState } from 'react';
import { leagueAPI, TeamFinanceDetail, LeagueFinanceSummary } from '../../../../api/leagueApi';
import './styles/FinancePanel.css'; 

interface FinancePanelProps {
  savedGameId: string;
  userTeamId: string;
}

const FinancePanel: React.FC<FinancePanelProps> = ({ savedGameId, userTeamId }) => {
  const [teamDetail, setTeamDetail] = useState<TeamFinanceDetail | null>(null);
  const [leagueSummary, setLeagueSummary] = useState<LeagueFinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
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

  if (loading) return <div className="finance-loading">Loading financial data…</div>;
  if (error) return <div className="finance-error">Error: {error}</div>;
  if (!teamDetail || !leagueSummary) return <div className="finance-error">No data available.</div>;

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount);

  const { finances } = teamDetail;

return (
    <div className="finance-panel-container">
      {/* User Team Section */}
      <section className="finance-panel-section">
        <h2 className="finance-panel-title">{teamDetail.team.name} – Financial Breakdown</h2>
        <div className="finance-grid">
          <div className="finance-card">
            <span className="finance-label">Total Payroll</span>
            <span className="finance-value">{formatCurrency(finances.totalPayroll)}</span>
          </div>
          <div className="finance-card">
            <span className="finance-label">Salary Cap</span>
            <span className="finance-value">{formatCurrency(finances.salaryCap)}</span>
          </div>
          <div className="finance-card">
            <span className="finance-label">Cap Space</span>
            <span className={`finance-value ${finances.capSpace < 0 ? 'negative' : 'positive'}`}>
              {formatCurrency(finances.capSpace)}
            </span>
          </div>
          <div className="finance-card">
            <span className="finance-label">Contracts</span>
            <span className="finance-value">{finances.numberOfContracts} / 15</span>
          </div>
        </div>

        {/* Highlight: Highest Paid Player */}
        <div className="finance-panel__card">
          <h3 className="finance-panel__title">Highest Paid Player</h3>
          {finances.highestPaidPlayer ? (
            <div className="highest-paid">
              <span className="highest-paid__name">
                {finances.highestPaidPlayer.name}
              </span>
              <span className="highest-paid__salary">
                {formatCurrency(finances.highestPaidPlayer.salary)}
              </span>
            </div>
          ) : (
            <p className="finance-panel__empty">No player under contract.</p>
          )}
        </div>

        {/* Expiring Contracts */}
        {finances.expiringContracts.length > 0 && (
          <div className="finance-panel__card">
            <h4 className="finance-panel__subtitle">Expiring Contracts</h4>
            <ul className="expiring-list">
              {finances.expiringContracts.map((c) => (
                <li key={c.playerId} className="expiring-list__item">
                  <span className="expiring-list__player">
                    {c.name} <span className="expiring-list__pos">({c.position})</span>
                  </span>
                  <span className="expiring-list__details">
                    {formatCurrency(c.salary)} &middot; {c.yearsRemaining}yr left
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Full Contract Table */}
        <div className="finance-panel__card finance-panel__card--full">
          <h3 className="finance-panel__title">All Contracts</h3>
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
                {teamDetail.contracts.map((c) => (
                  <tr key={c.contractId}>
                    <td>{c.playerName}</td>
                    <td>{c.position}</td>
                    <td>{c.overall}</td>
                    <td>{c.age}</td>
                    <td>{formatCurrency(c.salary)}</td>
                    <td>
                      {c.yearsRemaining}/{c.totalYears}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* League Summary */}
      <section className="finance-panel-section">
        <h2 className="finance-panel-title">League Financial Snapshot</h2>
        <div className="finance-grid">
          <div className="finance-card">
            <span className="finance-label">Total Teams</span>
            <span className="finance-value">{leagueSummary.totalTeams}</span>
          </div>
          <div className="finance-card">
            <span className="finance-label">Avg Team Payroll</span>
            <span className="finance-value">{formatCurrency(leagueSummary.averageTeamPayroll)}</span>
          </div>
          <div className="finance-card">
            <span className="finance-label">Avg Player Salary</span>
            <span className="finance-value">{formatCurrency(leagueSummary.averagePlayerSalary)}</span>
          </div>
        </div>
        <div className="top-earners">
          <h4>Top 5 Highest Paid Players</h4>
          <ol>
            {leagueSummary.top5HighestPaid.map(p => (
              <li key={p.playerName}>
                {p.playerName} ({p.team}) – {formatCurrency(p.salary)}
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
};
export default FinancePanel;