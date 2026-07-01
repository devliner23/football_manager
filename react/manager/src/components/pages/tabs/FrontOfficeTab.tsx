import React, { useState, useMemo } from 'react';
import { useGameContext } from '../../../context/GameContext';
import { Team, Player, StandingsRow } from '../../../api/leagueApi';
import TradePanel from './tabComponents/TradePanel';
import FreeAgentsTab from './FreeAgentTab';
import LineupTab from './LineupTab';
import './styles/FrontOfficeTab.css';

interface FrontOfficeTabProps {
  savedGameId: string;
  teams: Team[];
  players: Player[];
  userTeam?: Team;
  standings: StandingsRow[];
  userStanding: StandingsRow | null;
  userTeamPlayers: Player[];
}

type SubView = 'hub' | 'trade' | 'freeagents' | 'lineup' | 'finances';

const FrontOfficeTab: React.FC<FrontOfficeTabProps> = ({
  savedGameId,
  teams,
  players,
  userTeam,
  standings,
  userStanding,
  userTeamPlayers,
}) => {
  const [currentView, setCurrentView] = useState<SubView>('hub');

  const {
    season = 0,
    wins = 0,
    losses = 0,
    winPct = '0.0',
    nextUserGame,
  } = useGameContext() || {};

  // Extract user team id and opponent teams
  const userTeamId = userTeam?.id ?? '';
  const opponentTeams = useMemo(
    () => (userTeam ? teams.filter((t) => t.id !== userTeam.id) : teams),
    [teams, userTeam]
  );

  // Quick stats calculations for the dashboard widgets
  const totalRosterCount = userTeamPlayers.length;
  // const currentStreak = userStanding?.streak ?? 'W2'; // Flashy mock placeholder fallback
  // const teamConferenceRank = userStanding?.rank ?? '#4'; // Flashy mock placeholder fallback

  // Sub‑view back navigation helper
  const renderBackButton = () => (
    <button className="glass-btn btn-primary-blue-glow" onClick={() => setCurrentView('hub')}>
      ← Back to Front Office Hub
    </button>
  );

  // ── Render Sub-views if active ──
  if (currentView !== 'hub') {
    return (
      <div className="front-office-container">
        {renderBackButton()}
        <div className="fo-subview-content">
          {currentView === 'trade' && (
            userTeam ? (
              <TradePanel
                savedGameId={savedGameId}
                userTeamId={userTeamId}
                teams={opponentTeams}
              />
            ) : (
              <div className="fo-placeholder-screen">
                <p>No user team assigned yet. Please set up your team first.</p>
              </div>
            )
          )}
          {currentView === 'freeagents' && (
            <FreeAgentsTab savedGameId={savedGameId} teams={teams} />
          )}
          {currentView === 'lineup' && (
            <LineupTab
              savedGameId={savedGameId}
              userTeam={userTeam}
              allPlayers={players}
            />
          )}
          {currentView === 'finances' && (
            <div className="fo-placeholder-screen">
              <h2>Finances Hub</h2>
              <p>Salary cap breakdown, contracts, and revenue tracking coming soon.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Main Hub View ──
  return (
    <div className="front-office-hub">
      {/* Header Summary Row */}
      <div className="fo-header-summary">
        <h1>{userTeam?.name ?? 'Front Office Hub'}</h1>
        <div className="fo-season-badge">Season {season}</div>
      </div>

      {/* Main 4 Action Navigation Buttons */}
      <div className="fo-big-buttons">
        <button className="fo-big-btn btn-trade" onClick={() => setCurrentView('trade')}>
          <span className="btn-icon">🏀</span>
          <span className="btn-text">Trade Center</span>
        </button>
        <button className="fo-big-btn btn-freeagents" onClick={() => setCurrentView('freeagents')}>
          <span className="btn-icon">🔍</span>
          <span className="btn-text">Free Agents</span>
        </button>
        <button className="fo-big-btn btn-lineup" onClick={() => setCurrentView('lineup')}>
          <span className="btn-icon">📋</span>
          <span className="btn-text">Squad Lineup</span>
        </button>
        <button className="fo-big-btn btn-finances" onClick={() => setCurrentView('finances')}>
          <span className="btn-icon">💰</span>
          <span className="btn-text">Finances Hub</span>
        </button>
      </div>

      {/* Flashy Live Dashboard Panels */}
      <div className="fo-dashboard-grid">
        
        {/* Panel 1: Standings & Record */}
        <div className="fo-dash-card animated-border">
          <div className="fo-card-header">
            <h4>Standings & Form</h4>
            <span className="live-indicator">LIVE</span>
          </div>
          <div className="fo-card-body">
            <div className="big-stat-row">
              <div className="stat-block">
                <span className="stat-label">Record</span>
                <span className="stat-value text-glow">{wins} - {losses}</span>
              </div>
              <div className="stat-block">
                <span className="stat-label">Rank</span>
                {/* <span className="stat-value">{teamConferenceRank}</span> */}
              </div>
            </div>
            <div className="footer-metric">
              <span>Win Percentage: <strong>{winPct}%</strong></span>
              {/* <span>Streak: <strong className={currentStreak.startsWith('W') ? 'streak-win' : 'streak-loss'}>{currentStreak}</strong></span> */}
            </div>
          </div>
        </div>

        {/* Panel 2: Team Roster & Rotation */}
        <div className="fo-dash-card">
          <div className="fo-card-header">
            <h4>Roster Depth</h4>
          </div>
          <div className="fo-card-body">
            <div className="big-stat-row">
              <div className="stat-block">
                <span className="stat-label">Active Roster</span>
                <span className="stat-value">{totalRosterCount} <small>/ 15</small></span>
              </div>
              <div className="stat-block">
                <span className="stat-label">Team Chemistry</span>
                <span className="stat-value text-accent">84%</span> {/* Placeholder */}
              </div>
            </div>
            <div className="footer-metric">
              <span>Injuries: <strong className="text-success">0 Active</strong></span>
              <span>Primary Style: <strong>Pace & Space</strong></span> {/* Placeholder */}
            </div>
          </div>
        </div>

        {/* Panel 3: Financial Health */}
        <div className="fo-dash-card">
          <div className="fo-card-header">
            <h4>Salary & Finances</h4>
          </div>
          <div className="fo-card-body">
            <div className="big-stat-row">
              <div className="stat-block">
                <span className="stat-label">Cap Space</span>
                <span className="stat-value text-money">$14.2M</span> {/* Placeholder */}
              </div>
            </div>
            <div className="footer-metric">
              <span>Total Payroll: <strong>$126.3M</strong></span> {/* Placeholder */}
              <span>Luxury Tax: <strong className="text-warning">Under Cap</strong></span> {/* Placeholder */}
            </div>
          </div>
        </div>

        {/* Panel 4: Next Matchup / Scouting */}
        <div className="fo-dash-card schedule-card">
          <div className="fo-card-header">
            <h4>Next Matchup</h4>
          </div>
          <div className="fo-card-body">
            {nextUserGame ? (
              <div className="matchup-active">
                <div className="opponent-name">
                  {/* {nextUserGame.opponent ?? nextUserGame.opponent_name ?? 'Unknown Opponent'} */}
                </div>
                {/* <div className="matchup-date">{nextUserGame.date ?? 'Tonight'}</div> */}
              </div>
            ) : (
              <div className="matchup-placeholder">
                <span className="vs-badge">VS</span>
                <p>No immediate game scheduled. Advance the calendar to find your next opponent.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default FrontOfficeTab;