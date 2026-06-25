// src/components/SelectedGame/SelectedGame.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { SavedGame } from '../../shared';
import { leagueAPI, Team, Player, StandingsRow, GameResult, UserGameInfo } from '../../api/leagueApi';
import { gameAPI } from '../../api/client';
import GameHeader from './GameHeader';
import GameSidebar from './GameSidebar';
import TeamControlsPanel from './TeamControlsPanel';
import OverviewTab from './tabs/OverviewTab';
import RosterTab from './tabs/RosterTab';
import StandingsTab from './tabs/StandingsTab';
import TradeTab from './tabs/TradeTab';
import FreeAgentsTab from './tabs/FreeAgentTab';
import FrontOfficeTab from './tabs/FrontOfficeTab';
import PlayerModal from './PlayerModal';
import ScheduleTab from './tabs/ScheduleTab';
import './SelectedGame.css';

import { RingLoader } from "react-spinners";

import {
  LayoutDashboard,
  Users,
  TrendingUp,
  Repeat,
  UserPlus,
  Building2,
  Calendar
} from 'lucide-react';


interface SelectedGameProps {
  game: SavedGame;
  onBack: () => void;
  onDelete: (id: string) => void;
  onUpdate: (game: SavedGame) => void;
}

type TabType = 'overview' | 'roster' | 'standings' | 'trade' | 'freeagents' | 'frontoffice' | 'schedule';

const tabConfig = {
  overview: {
    label: 'Overview',
    icon: <LayoutDashboard size={18} strokeWidth={2} />,
  },
  roster: {
    label: 'Roster',
    icon: <Users size={18} strokeWidth={2} />,
  },
  standings: {
    label: 'Standings',
    icon: <TrendingUp size={18} strokeWidth={2} />,
  },
  trade: {
    label: 'Trade',
    icon: <Repeat size={18} strokeWidth={2} />,
  },
  freeagents: {
    label: 'Free Agents',
    icon: <UserPlus size={18} strokeWidth={2} />,
  },
  frontoffice: {
    label: 'Front Office',
    icon: <Building2 size={18} strokeWidth={2} />,
  },
  schedule: {
    label: 'Schedule',
    icon: <Calendar size={18} strokeWidth={2} />,
  },
};

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
  const [simProgress, setSimProgress] = useState<string | null>(null);
  const [lastSimulatedDate, setLastSimulatedDate] = useState<string | null>(
    game.game_state?.last_simulated_at ?? null
    );
  const [currentSeason, setCurrentSeason] = useState(game.current_season);

  const currentDate = lastSimulatedDate

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

  const refreshAllData = useCallback(async () => {
    try {
        const [
        teamsData,
        playersData,
        standingsData,
        scheduleData,
        nextGameData,
        fullGameData       // <-- add this
        ] = await Promise.all([
        leagueAPI.getTeams(game.id),
        leagueAPI.getPlayers(game.id),
        leagueAPI.getStandings(game.id),
        leagueAPI.getSchedule(game.id),
        leagueAPI.getNextUserGame(game.id),
        gameAPI.getGame(game.id)   // <-- correct API call
        ]);

        if (teamsData) setTeams(teamsData);
        if (playersData) setPlayers(playersData);
        if (standingsData) setStandings(standingsData);
        if (scheduleData) setSchedule(scheduleData);

        // Update next user game logic
        if (nextGameData?.seasonComplete) {
        setNextUserGame(null);
        setLeagueGamesBeforeCount(0);
        } else if (nextGameData?.nextUserGame) {
        setNextUserGame(nextGameData.nextUserGame);
        setLeagueGamesBeforeCount(nextGameData.leagueGamesBeforeCount ?? 0);
        }

        console.log(fullGameData)
        // **Update the last simulated date from the fresh game object**
        if (fullGameData?.data?.game_state?.last_simulated_at) {
            setLastSimulatedDate(fullGameData.data.game_state.last_simulated_to);
            setCurrentSeason(fullGameData.data.current_season);
        } else {
            console.log("BIG ERROR, NOT WORKING")
        }
    } catch (err) {
        console.error('refreshAllData failed:', err);
    }
  }, [game.id]);

  useEffect(() => {
    setLoading(true);
    refreshAllData().finally(() => setLoading(false));
  }, [game.id, refreshAllData]);

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
      await leagueAPI.simulateToNextGame(game.id);
    } catch (err) {
      console.error('simulateToNextGame error:', err);
    } finally {
      // Always refresh — the DB was written even if the response errored
      await refreshAllData();
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
      let complete       = false;
      let totalSimulated = 0;
 
      while (!complete) {
        const result = await leagueAPI.simulateToDate(game.id, targetDate);
 
        totalSimulated += result.gamesSimulated ?? 0;
        complete        = result.complete ?? true;
 
 
        // Brief pause between chunks so we don't saturate the DB connection
        if (!complete) await new Promise(r => setTimeout(r, 200));
      }
    } catch (err) {
      // Log but do not alert — the DB may be partially (or fully) written.
      // refreshAllData() below will pull whatever the DB currently holds.
      console.error('Simulation chunk error:', err);
    } finally {
      // This block always runs: clears the spinner AND fetches fresh data.
      await refreshAllData();
      setLoading(false);
      setSimProgress(null);
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
        {(Object.keys(tabConfig) as TabType[]).map((tab) => (
            <button
            key={tab}
            className={`nav-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
            >
            {tabConfig[tab].icon}
            <span>{tabConfig[tab].label}</span>
            </button>
        ))}
      </nav>

      
      <div className="game-fullscreen-content">
        <div className="game-left-column">
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
            lastSimulatedDate={currentDate}
            />
            <TeamControlsPanel />
        </div>

        <main className="game-main-content">
          <div className="tab-content">
            {loading && (
            <div style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
            }}>
                <RingLoader color="#36d7b7" size={120} />
            </div>
            )}
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