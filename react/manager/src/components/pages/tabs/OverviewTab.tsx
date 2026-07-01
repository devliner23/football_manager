import React, { useState } from 'react';
import { SavedGame, Team, Player } from '../../../shared/index';
import GameResults from '../GameResults';
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  ArrowRight, 
  User, 
  Target, 
  Play, 
  Settings, 
  ArrowRightLeft, 
  Users, 
  BarChart3,
  Award,
  Shield,
  Zap,
  Activity
} from 'lucide-react';
import TradePanel from './tabComponents/TradePanel';
import "./styles/OverviewTab.css";

interface OverviewTabProps {
  game: SavedGame;
  userTeam: Team | undefined;
  userTeamPlayers: Player[];
  players: Player[];
  record: string;
  winPct: string;
  savedGameId: string;
  refreshKey: number;
  onGameClick: (gameId: string) => void;
  allTeams: Team[];
}

const OverviewTab: React.FC<OverviewTabProps> = ({
  game,
  userTeam,
  userTeamPlayers,
  players,
  record,
  winPct,
  savedGameId,
  refreshKey,
  onGameClick,
  allTeams
}) => {
  const [showTradeModal, setShowTradeModal] = useState(false);

  const getPlayerName = (player: Player) => `${player.first_name} ${player.last_name}`;

  const leaderByStat = (stat: keyof Pick<Player, 'points' | 'rebounds' | 'assists'>) => {
    const sorted = [...userTeamPlayers].sort((a, b) => (b[stat] ?? 0) - (a[stat] ?? 0));
    return sorted.length > 0 ? getPlayerName(sorted[0]) : '-';
  };

  const leagueLeaders = (stat: keyof Pick<Player, 'points' | 'rebounds' | 'assists'>) => {
    return [...players]
      .sort((a, b) => (b[stat] ?? 0) - (a[stat] ?? 0))
      .slice(0, 5)
      .map((p) => ({ name: getPlayerName(p), value: p[stat] ?? 0 }));
  };

  const teamAverages = () => {
    if (userTeamPlayers.length === 0) return { pts: '0.0', reb: '0.0', ast: '0.0' };
    const total = userTeamPlayers.reduce(
      (acc, p) => ({
        pts: acc.pts + (p.points ?? 0),
        reb: acc.reb + (p.rebounds ?? 0),
        ast: acc.ast + (p.assists ?? 0),
      }),
      { pts: 0, reb: 0, ast: 0 }
    );
    const count = userTeamPlayers.length;
    return {
      pts: (total.pts / count).toFixed(1),
      reb: (total.reb / count).toFixed(1),
      ast: (total.ast / count).toFixed(1),
    };
  };

  if (!userTeam) {
    return (
      <div className="overview-container error-state">
        <div className="error-card">
          <p>Active franchise profile data context could not be resolved.</p>
        </div>
      </div>
    );
  }

  const averages = teamAverages();
  const [wins = '0', losses = '0'] = record.split('-');

  return (
    <div className="overview-container">
      <div className="overview-grid">
        
        {/* ==================== 80% WIDTH TOP BANNER ==================== */}
        <div className="overview-left-panel season-banner-premium">
          <div className="banner-left-brand">
            <div className="team-avatar">🏀</div>
            <div className="team-info">
              <span className="season-badge">Season {game.current_season}</span>
              <h2 className="team-name">{userTeam.name}</h2>
              <p className="team-meta">
                <Shield className="icon-small" /> Front Office Operations Hub
              </p>
            </div>
          </div>

          {/* New Added Structured Information Fields */}
          <div className="banner-center-stats">
            <div className="banner-stat-block">
              <span className="stat-block-label">Record Breakdown</span>
              <span className="stat-block-value text-glow-blue">{wins}<span className="slash">/</span>{losses}</span>
              <span className="stat-block-sub">{winPct} Win %</span>
            </div>
            
            <div className="banner-stat-block">
              <span className="stat-block-label">Roster Capacity</span>
              <span className="stat-block-value">{userTeamPlayers.length} <span className="max-cap">/ 15</span></span>
              <span className="stat-block-sub">Active Contracts</span>
            </div>

            <div className="banner-stat-block">
              <span className="stat-block-label">Franchise Status</span>
              <span className="stat-block-value status-indicator">
                <Activity className="icon-pulse-green" /> Stable
              </span>
              <span className="stat-block-sub">Luxury Tax Compliant</span>
            </div>
          </div>

          <div className="banner-right-actions">
            <div className="record-progress">
              <Target size={18} />
              <div className="record-label">
                <span>Current Standings Tracker</span>
              </div>
              <span className="record-pct">{record}</span>
            </div>

            <div className="quick-actions">
              <button 
                className="icon-btn trade-btn" 
                onClick={() => setShowTradeModal(true)}
              >
                <div className="btn-default-content">
                  <ArrowRightLeft size={16} />
                  <span>Trade Desk</span>
                </div>
                <div className="btn-hover-content" onClick={(e) => e.stopPropagation()}>
                  <div className="trade-action-icon" title="Propose Assets" onClick={() => setShowTradeModal(true)}>
                    <Zap size={14} />
                  </div>
                  <div className="trade-action-icon" title="Negotiations" onClick={() => setShowTradeModal(true)}>
                    <Users size={14} />
                  </div>
                </div>
              </button>

              <button className="icon-btn disabled" disabled>
                <Settings size={16} />
                <span>Roster Management</span>
              </button>
            </div>
          </div>
        </div>

        {/* ==================== 20% WIDTH VERTICAL KPI PANEL ==================== */}
        <div className="overview-kpi-vertical-stack">
          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-label">Team PPG</span>
              <BarChart3 className="kpi-icon" />
            </div>
            <div className="kpi-value">{averages.pts}</div>
            <div className="kpi-meta trend-up">
              <TrendingUp size={12} /> vs League Avg
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-label">Team RPG</span>
              <BarChart3 className="kpi-icon" />
            </div>
            <div className="kpi-value">{averages.reb}</div>
            <div className="kpi-meta trend-up">
              <TrendingUp size={12} /> Control
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-label">Team APG</span>
              <BarChart3 className="kpi-icon" />
            </div>
            <div className="kpi-value">{averages.ast}</div>
            <div className="kpi-meta trend-down">
              <TrendingDown size={12} /> Efficiency
            </div>
          </div>
        </div>

        {/* ==================== EVENLY SPACED GRID LOWER ROW ==================== */}
        <div className="overview-lower-flex-row">
          
          {/* 1. LEAGUE LEADERS */}
          <div className="leaders-card lower-row-panel">
            <h3 className="card-title">
              <Award size={16} className="title-icon-inline" /> League Stat Leaders
            </h3>
            <div className="leader-list">
              <div className="leader-item">
                <span className="leader-label">Points</span>
                <span className="leader-name">{leagueLeaders('points')[0]?.name || '-'}</span>
              </div>
              <div className="leader-item">
                <span className="leader-label">Rebounds</span>
                <span className="leader-name">{leagueLeaders('rebounds')[0]?.name || '-'}</span>
              </div>
              <div className="leader-item">
                <span className="leader-label">Assists</span>
                <span className="leader-name">{leagueLeaders('assists')[0]?.name || '-'}</span>
              </div>
            </div>
          </div>

          {/* 2. UPCOMING MATCHUP */}
          <div className="next-game-card lower-row-panel">
            <h3 className="card-title">
              <Calendar size={16} className="title-icon-inline" /> Upcoming Schedule Matchup
            </h3>
            <span>Test</span>
          </div>

          {/* 3. TEAM LEADERS */}
          <div className="leaders-card lower-row-panel">
            <h3 className="card-title">
              <User size={16} className="title-icon-inline" /> Franchise Roster Leaders
            </h3>
            <div className="leader-list">
              <div className="leader-item">
                <span className="leader-label">Scoring Leader</span>
                <span className="leader-name">{leaderByStat('points')}</span>
              </div>
              <div className="leader-item">
                <span className="leader-label">Paint Leader</span>
                <span className="leader-name">{leaderByStat('rebounds')}</span>
              </div>
              <div className="leader-item">
                <span className="leader-label">Playmaking Leader</span>
                <span className="leader-name">{leaderByStat('assists')}</span>
              </div>
            </div>
          </div>

        </div>

        {/* ==================== BOTTOM PANEL SIMULATOR ==================== */}
        <div className="overview-bottom-panel">
          <div className="results-wrapper-card">
            <GameResults
              key={refreshKey}
              savedGameId={savedGameId}
              onGameClick={onGameClick}
            />
          </div>
        </div>

      </div>
    </div>
  );
};

export default OverviewTab;