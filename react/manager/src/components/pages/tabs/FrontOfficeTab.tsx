import React, { useState, useMemo } from 'react';
import { useGameContext } from '../../../context/GameContext';
import { Team, Player, StandingsRow } from '../../../api/leagueApi';
import TradePanel from './tabComponents/TradePanel';          // <-- your new trade component
import FreeAgentsTab from './FreeAgentTab';
import LineupTab from './LineupTab';
import './styles/FrontOfficeTab.css';

interface FrontOfficeTabProps {
  savedGameId: string;
  teams: Team[];
  players: Player[];          // passed but not used directly; sub‑components may need them
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
  const [modalContent, setModalContent] = useState<React.ReactNode>(null);

  const {
    season = 0,
    wins = 0,
    losses = 0,
    winPct = '0.0',
    nextUserGame,
  } = useGameContext() || {};

  const openModal = (content: React.ReactNode) => setModalContent(content);
  const closeModal = () => setModalContent(null);

  // Extract user team id and opponent teams (all except user team)
  const userTeamId = userTeam?.id ?? '';
  const opponentTeams = useMemo(
    () => (userTeam ? teams.filter((t) => t.id !== userTeam.id) : teams),
    [teams, userTeam]
  );

  // ── Sub‑view render helpers ──
  const renderBackButton = () => (
    <button className="fo-back-btn" onClick={() => setCurrentView('hub')}>
      ← Back to Front Office
    </button>
  );

  // If a sub‑view is active, render it instead of the hub
  if (currentView !== 'hub') {
    return (
      <div className="front-office-hub">
        {renderBackButton()}
        {currentView === 'trade' && (
          userTeam ? (
            <TradePanel
              savedGameId={savedGameId}
              userTeamId={userTeamId}
              teams={opponentTeams}
            />
          ) : (
            <div className="fo-placeholder">
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
          <div className="fo-placeholder">
            <h2>Finances</h2>
            <p>Salary cap, revenue, and expenses will appear here.</p>
          </div>
        )}
      </div>
    );
  }

  // ── Hub view (default) ──
  const highlightCards = [
    {
      id: 'record',
      image: '🏀',
      title: 'Season Record',
      description: `${wins} - ${losses} (${winPct}%)`,
      actionLabel: 'Standings',
      detailContent: (
        <div>
          <h3>Full Standings</h3>
          <p>{wins}-{losses} (win % {winPct}) – Season {season}</p>
        </div>
      ),
    },
    // {
    //   id: 'nextgame',
    //   image: '📅',
    //   title: 'Next Game',
    //   description: nextUserGame
    //     ? `${nextUserGame.opponent ?? nextUserGame.opponent_name ?? 'Unknown'} (${nextUserGame.date ?? 'TBA'})`
    //     : 'No upcoming game',
    //   actionLabel: 'View Schedule',
    //   detailContent: (
    //     <div>
    //       <h3>Upcoming Matchup</h3>
    //       <p>{nextUserGame
    //         ? `${nextUserGame.opponent ?? nextUserGame.opponent_name} on ${nextUserGame.date}`
    //         : 'No game scheduled'}
    //       </p>
    //     </div>
    //   ),
    // },
    {
      id: 'roster',
      image: '👥',
      title: 'Team Depth',
      description: `${userTeamPlayers.length} players on roster`,
      actionLabel: 'Roster',
      detailContent: (
        <div>
          <h3>Roster Highlights</h3>
          <p>You have {userTeamPlayers.length} active players.</p>
        </div>
      ),
    },
    {
      id: 'lineupcard',
      image: '📋',
      title: 'Lineup',
      description: userStanding
        ? 'Current streak: --'   // you can later feed real streak data
        : 'Set your starting five',
      actionLabel: 'Open Lineup',
      detailContent: (
        <div>
          <h3>Lineup Editor</h3>
          <p>Adjust your starters and bench rotations.</p>
        </div>
      ),
    },
  ];

  return (
    <div className="front-office-hub">
      {/* ── Large navigation buttons ── */}
      <div className="fo-big-buttons">
        <button className="fo-big-btn" onClick={() => setCurrentView('trade')}>
          🏀 Trade Center
        </button>
        <button className="fo-big-btn" onClick={() => setCurrentView('freeagents')}>
          🔍 Free Agents
        </button>
        <button className="fo-big-btn" onClick={() => setCurrentView('lineup')}>
          📋 Squad Lineup
        </button>
        <button className="fo-big-btn" onClick={() => setCurrentView('finances')}>
          💰 Finances
        </button>
      </div>

      {/* ── Highlight cards grid ── */}
      <div className="fo-cards-grid">
        {highlightCards.map((card) => (
          <div key={card.id} className="fo-card">
            <div className="fo-card-avatar">{card.image}</div>
            <h3 className="fo-card-title">{card.title}</h3>
            <p className="fo-card-desc">{card.description}</p>
            <button className="fo-card-button" onClick={() => openModal(card.detailContent)}>
              {card.actionLabel}
            </button>
          </div>
        ))}
      </div>

      {/* ── Modal ── */}
      {modalContent && (
        <div className="fo-modal-overlay" onClick={closeModal}>
          <div className="fo-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="fo-modal-close" onClick={closeModal}>✕</button>
            {modalContent}
          </div>
        </div>
      )}
    </div>
  );
};

export default FrontOfficeTab;