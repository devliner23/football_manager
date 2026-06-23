// src/components/SelectedGame/SelectedGame.tsx
import React, { useState, useEffect } from 'react';
import { SavedGame } from '../../shared';
import { leagueAPI, Team, Player, StandingsRow, GameResult } from '../../api/leagueApi';
import GameHeader from './GameHeader';
import GameSidebar from './GameSidebar';
import OverviewTab from './tabs/OverviewTab';
import RosterTab from './tabs/RosterTab';
import StandingsTab from './tabs/StandingsTab';
import TradeTab from './tabs/TradeTab';
import FreeAgentsTab from './tabs/FreeAgentTab';
import FrontOfficeTab from './tabs/FrontOfficeTab';
import PlayerModal from './PlayerModal';
import ScheduleTab from './tabs/ScheduleTab';
import './SelectedGame.css';

interface SelectedGameProps {
  game: SavedGame;
  onBack: () => void;
  onDelete: (id: string) => void;
  onUpdate: (game: SavedGame) => void;
}

type TabType = 'overview' | 'roster' | 'standings' | 'trade' | 'freeagents' | 'frontoffice' | 'schedule';

const SelectedGame: React.FC<SelectedGameProps> = ({
  game,
  onBack,
  onDelete,
  onUpdate,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [standings, setStandings] = useState<StandingsRow[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<Record<number, GameResult[]>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  // Load all league data
  const loadLeagueData = async () => {
    setLoading(true);
    try {
      const [teamsData, playersData, standingsData] = await Promise.all([
        leagueAPI.getTeams(game.id),
        leagueAPI.getPlayers(game.id),
        leagueAPI.getStandings(game.id),
      ]);
      const scheduleData = await leagueAPI.getSchedule(game.id);
      setSchedule(scheduleData);
      setTeams(teamsData);
      setPlayers(playersData);
      setStandings(standingsData);
    } catch (error) {
      console.error('Failed to load league data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeagueData();
  }, [game.id]);

  // Helper functions
  const getTeamById = (teamId: string) => teams.find((t) => t.id === teamId);
  const getPlayersForTeam = (teamId: string) =>
    players.filter((p) => p.team_id === teamId);

  const userTeam = teams.find(
    (t) => t.team_id === game.managed_club_id || t.id === game.managed_club_id
  );
  const userTeamPlayers = userTeam ? getPlayersForTeam(userTeam.id) : [];

  const record = userTeam
    ? `${userTeam.wins ?? 0}-${userTeam.losses ?? 0}`
    : '0-0';
  const winPct =
    userTeam && (userTeam.wins ?? 0) + (userTeam.losses ?? 0) > 0
      ? (((userTeam.wins ?? 0) / ((userTeam.wins ?? 0) + (userTeam.losses ?? 0))) * 100).toFixed(1)
      : '0.0';

  // Handlers
  const handleContinue = async () => {
    setLoading(true);
    try {
      const result = await leagueAPI.simulateWeek(game.id);
      await loadLeagueData();
      setRefreshKey(prev => prev + 1);

      if (result.seasonComplete) {
        alert('🏆 Season complete!');
      } else {
        const gameCount = result.games?.length || 0;
        console.log(`Simulated ${gameCount} games for week ${result.week}`);
      }
    } catch (error) {
      console.error('Failed to simulate week:', error);
      alert('Failed to simulate games. Check console.');
    } finally {
      setLoading(false);
    }
  };

  const handleSimulate = async () => {
    if (!window.confirm('Simulate the entire season?')) return;
    setLoading(true);
    try {
      await leagueAPI.simulateSeason(game.id);
      await loadLeagueData();
    } catch (error) {
      console.error('Simulation failed:', error);
      alert('Simulation failed. Check console.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    if (window.confirm(`Delete "${game.name}"?`)) {
      onDelete(game.id);
    }
  };

  return (
    <div className="selected-game-fullscreen">
      <GameHeader
        gameName={game.name}
        record={record}
        winPct={winPct}
        onBack={onBack}
        onDelete={handleDelete}
      />

      <nav className="game-global-nav">
        {(['overview', 'roster', 'standings', 'trade', 'freeagents', 'frontoffice', 'schedule'] as TabType[]).map((tab) => (
          <button
            key={tab}
            className={`nav-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'overview' && '📊 Dashboard'}
            {tab === 'roster' && '👥 Rosters'}
            {tab === 'standings' && '📈 Standings'}
            {tab === 'trade' && '🔄 Trade Center'}
            {tab === 'freeagents' && '📋 Free Agents'}
            {tab === 'frontoffice' && '🏢 Front Office'}
            {tab === 'schedule' && '📅 Schedule'}
          </button>
        ))}
      </nav>

      <div className="game-fullscreen-content">
        <GameSidebar
          season={game.current_season}
          wins={userTeam?.wins ?? 0}
          losses={userTeam?.losses ?? 0}
          winPct={winPct}
          playerCount={userTeamPlayers.length}
          ppg="N/A"
          oppg="N/A"
          onContinue={handleContinue}
          onSimulate={handleSimulate}
          onViewStandings={() => setActiveTab('standings')}
          loading={loading}
        />

        <main className="game-main-content">
          <div className="tab-content">
            {loading && <div className="loading-spinner">Loading...</div>}

            {!loading && activeTab === 'overview' && (
              <OverviewTab
                game={game}
                userTeam={userTeam}
                userTeamPlayers={userTeamPlayers}
                players={players}
                record={record}
                winPct={winPct}
                savedGameId={game.id}
                refreshKey={refreshKey}
                onGameClick={(gameId) => setSelectedGameId(gameId)}
              />
            )}

            {!loading && activeTab === 'roster' && (
              <RosterTab
                players={userTeamPlayers}
                onViewPlayer={(player) => setSelectedPlayer(player)}
              />
            )}

            {!loading && activeTab === 'standings' && (
              <StandingsTab
                standings={standings}
                teams={teams}
                userTeamId={userTeam?.id}
              />
            )}

            {!loading && activeTab === 'schedule' && (
              <ScheduleTab schedule={schedule} teams={teams} />
            )}

            {!loading && activeTab === 'trade' && <TradeTab />}
            {!loading && activeTab === 'freeagents' && <FreeAgentsTab />}
            {!loading && activeTab === 'frontoffice' && <FrontOfficeTab />}
          </div>
        </main>
      </div>

      <PlayerModal
        player={selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
      />
    </div>
  );
};

export default SelectedGame;