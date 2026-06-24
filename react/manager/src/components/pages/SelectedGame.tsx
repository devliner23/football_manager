// src/components/SelectedGame/SelectedGame.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { SavedGame } from '../../shared';
import { leagueAPI, Team, Player, StandingsRow, GameResult, UserGameInfo } from '../../api/leagueApi';
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
  const [nextUserGame, setNextUserGame] = useState<UserGameInfo | null>(null);
  const [leagueGamesBeforeCount, setLeagueGamesBeforeCount] = useState(0);
  const [lastSimulatedDate, setLastSimulatedDate] = useState<string | null>(null);


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

    const loadNextUserGame = async () => {
    try {
      const result = await leagueAPI.getNextUserGame(game.id);
      if (result.seasonComplete || !result.nextUserGame) {
        setNextUserGame(null);
        setLeagueGamesBeforeCount(0);
      } else {
        setNextUserGame(result.nextUserGame);
        setLeagueGamesBeforeCount(result.leagueGamesBeforeCount);
      }
    } catch (error) {
      console.error('Failed to load next user game:', error);
    }
  };

  useEffect(() => {
    loadLeagueData();
    loadNextUserGame();
  }, [game.id]);

  // Helper functions
  const getTeamById = (teamId: string) => teams.find((t) => t.id === teamId);
  const getPlayersForTeam = (teamId: string) =>
    players.filter((p) => p.team_id === teamId);

// Inside SelectedGame component...

const userTeam = useMemo(() => {
  if (!teams.length || !game.managed_club_id) return undefined;
  const found = teams.find(t => t.id === game.managed_club_id);
  if (!found) {
    console.warn(
      `⚠️ User team not found. managed_club_id: ${game.managed_club_id}. Available team IDs:`,
      teams.map(t => t.id)
    );
  }
  return found;
}, [teams, game.managed_club_id]);
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
      const result = await leagueAPI.simulateToNextGame(game.id);
 
      // Refresh league table data and next-game banner in parallel
      await Promise.all([loadLeagueData(), loadNextUserGame()]);
      setRefreshKey(prev => prev + 1);
 
      if (result.seasonComplete) {
        alert('🏆 Season complete! No more games scheduled.');
      } else if (result.gamesSimulated === 0) {
        alert('⏭️ Your next game is up next — no league games before it.');
      } else {
        alert(
          `✅ Simulated ${result.gamesSimulated} league game${result.gamesSimulated !== 1 ? 's' : ''}.\n` +
          `Your next game is ready.`
        );
      }
    } catch (error) {
      console.error('Failed to simulate to next game:', error);
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

  const handleSimulateToDate = async (targetDate: string) => {
    setLoading(true);
    try {
        const result = await leagueAPI.simulateToDate(game.id, targetDate);
        setLastSimulatedDate(targetDate); // or store from response if needed
        await loadLeagueData();
        await loadNextUserGame(); // still useful to update the “next game” banner
        if (result.seasonComplete) {
        alert('🏆 Season complete!');
        } else {
        alert(`✅ Simulated ${result.gamesSimulated} game(s) up to ${new Date(targetDate).toLocaleDateString()}.`);
        }
    } catch (error) {
        console.error('Date simulation failed:', error);
        alert('Failed to simulate. Check console.');
    } finally {
        setLoading(false);
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
          nextUserGame={nextUserGame}
          leagueGamesBeforeCount={leagueGamesBeforeCount}
          onSimulateToDate={handleSimulateToDate}
          lastSimulatedDate={lastSimulatedDate}
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
                teams={teams}               // all teams
                allPlayers={players}        // all players
                userTeamId={userTeam?.id}   // optional – to highlight user’s team
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