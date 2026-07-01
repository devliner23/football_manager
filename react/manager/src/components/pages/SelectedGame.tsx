// src/components/SelectedGame/SelectedGame.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { SavedGame } from '../../shared';
import { leagueAPI, Team, Player, StandingsRow, GameResult, UserGameInfo } from '../../api/leagueApi';
import { gameAPI } from '../../api/client';
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
import LineupTab from './tabs/LineupTab';
import './SelectedGame.css';


import { GameProvider } from '../../context/GameContext';

import { RingLoader } from "react-spinners";

import {
  LayoutDashboard,
  Users,
  TrendingUp,
  Repeat,
  UserPlus,
  Building2,
  Calendar,
  Clipboard
} from 'lucide-react';
import GameResults from './GameResults';


interface SelectedGameProps {
  game: SavedGame;
  onBack: () => void;
  onDelete: (id: string) => void;
  onUpdate: (game: SavedGame) => void;
}

type TabType = 'overview' | 'leagueRoster' | 'standings' | 'frontoffice' | 'schedule';

const tabConfig = {
  overview: {
    label: 'Overview',
    icon: <LayoutDashboard size={18} strokeWidth={2} />,
  },
  leagueRoster: {
    label: 'League Rosters',
    icon: <Users size={18} strokeWidth={2} />,
  },
  standings: {
    label: 'Standings',
    icon: <TrendingUp size={18} strokeWidth={2} />,
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
    game.current_game_date ?? null
  );
  const [currentSeason, setCurrentSeason] = useState(game.current_season);

  // managed_club_id is NULL at game-creation time (the game row is inserted before
  // initializeLeague runs and sets the real UUID).  We store it in local state so
  // that refreshAllData() can overwrite it with the value that is now in the DB.
  const [managedClubId, setManagedClubId] = useState<string | null>(
    game.managed_club_id ?? null
  );

  const currentDate = lastSimulatedDate;

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
        fullGameData,
      ] = await Promise.all([
        leagueAPI.getTeams(game.id),
        leagueAPI.getPlayers(game.id),
        leagueAPI.getStandings(game.id),
        leagueAPI.getSchedule(game.id),
        leagueAPI.getNextUserGame(game.id),
        gameAPI.getGame(game.id),
      ]);

      if (teamsData)    setTeams(teamsData);
      if (playersData)  setPlayers(playersData);
      if (standingsData) setStandings(standingsData);
      if (scheduleData) setSchedule(scheduleData);

      // Update next user game
      if (nextGameData?.seasonComplete) {
        setNextUserGame(null);
        setLeagueGamesBeforeCount(0);
      } else if (nextGameData?.nextUserGame) {
        setNextUserGame(nextGameData.nextUserGame);
        setLeagueGamesBeforeCount(nextGameData.leagueGamesBeforeCount ?? 0);
      }

      // Pull fresh scalar fields from the saved_game row.
      // managed_club_id is set by initializeLeague AFTER game creation, so the
      // prop we received may still be null — always prefer the DB value here.
      const freshGame = fullGameData?.data;
      if (freshGame) {
        if (freshGame.managed_club_id) {
          setManagedClubId(freshGame.managed_club_id);
        }
        if (freshGame.current_game_date) {
          setLastSimulatedDate(freshGame.current_game_date);
        }
        setCurrentSeason(freshGame.current_season ?? currentSeason);
      }
    } catch (err) {
      console.error('refreshAllData failed:', err);
    }
  }, [game.id]);

  useEffect(() => {
    setLoading(true);
    refreshAllData().finally(() => setLoading(false));
    console.log(GameResults);
  }, [game.id, refreshAllData]);

  // ── Derived data ────────────────────────────────────────────────────────────

  const getTeamById = (teamId: string) => teams.find((t) => t.id === teamId);
  const getPlayersForTeam = (teamId: string) =>
    players.filter((p) => p.team_id === teamId);

  // Find the managed team using the refreshed UUID, not game.managed_club_id
  const userTeam = useMemo(() => {
    if (!teams.length || !managedClubId) return undefined;
    const found = teams.find(t => t.id === managedClubId);
    if (!found) {
      console.warn(
        `⚠️ User team not found. managedClubId: ${managedClubId}. Available IDs:`,
        teams.map(t => t.id)
      );
    }
    return found;
  }, [teams, managedClubId]);

  // Derive wins/losses from standings (team_season_stats) rather than the
  // teams table, which does not carry those columns.
  const userStanding = useMemo(
    () => standings.find(s => s.team_id === managedClubId) ?? null,
    [standings, managedClubId]
  );

  const userTeamPlayers = userTeam ? getPlayersForTeam(userTeam.id) : [];

  const record = userStanding
    ? `${userStanding.wins ?? 0}-${userStanding.losses ?? 0}`
    : '0-0';

  const winPct = (() => {
    if (!userStanding) return '0.0';
    const total = (userStanding.wins ?? 0) + (userStanding.losses ?? 0);
    if (total === 0) return '0.0';
    return (((userStanding.wins ?? 0) / total) * 100).toFixed(1);
  })();

  // Handlers
  const handleContinue = async () => {
    setLoading(true);
    try {
      await leagueAPI.simulateToNextGame(game.id);
    } catch (err) {
      console.error('simulateToNextGame error:', err);
    } finally {
      await refreshAllData();
      setRefreshKey(k => k + 1);
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
      setRefreshKey(k => k + 1);
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

        if (!complete) await new Promise(r => setTimeout(r, 200));
      }
    } catch (err) {
      console.error('Simulation chunk error:', err);
    } finally {
      await refreshAllData();
      setRefreshKey(k => k + 1);
      setLoading(false);
      setSimProgress(null);
    }
  };

  return (
    <div className="selected-game-dashboard">
        <GameProvider value={{
        season: currentSeason,
        wins: userStanding?.wins ?? 0,
        losses: userStanding?.losses ?? 0,
        winPct,
        playerCount: userTeamPlayers.length,
        ppg: 'N/A',
        oppg: 'N/A',
        nextUserGame,
        leagueGamesBeforeCount,
        lastSimulatedDate: currentDate,
        loading,
        onContinue: handleContinue,
        onSimulate: handleSimulate,
        onSimulateToDate: handleSimulateToDate,
        onViewStandings: () => setActiveTab('standings'),
        }}>
        {/* ── LEFT SIDEBAR (tab navigation) ── */}
        <aside className="game-sidebar">
        {/* Logo / Game name */}
        <div className="game-sidebar-logo">
            <span className="game-logo-text">Hardwood GM</span>
        </div>

        {/* Tab navigation */}
        <nav className="game-nav-menu">
            {(Object.keys(tabConfig) as TabType[]).map((tab) => (
            <button
                key={tab}
                className={`game-nav-item ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
            >
                {tabConfig[tab].icon}
                <span>{tabConfig[tab].label}</span>
            </button>
            ))}
        </nav>

        {/* Optional: a small season progress indicator (kept simple) */}
        <div className="game-sidebar-footer">
            { <GameSidebar
                season={currentSeason}
                wins={userStanding?.wins ?? 0}
                losses={userStanding?.losses ?? 0}
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
            /> }
        </div>
        </aside>

        {/* ── RIGHT MAIN CONTENT ── */}
        <main className="game-main-content">
        {/* Header row */}
        <div className="game-header-row">
            <button className="game-back-btn" onClick={onBack}>
            ← Back
            </button>
            <h1 className="game-header-title">{game.name}</h1>
            <div className="game-header-actions">
            <button className="game-delete-btn" onClick={handleDelete}>
                Delete
            </button>
            </div>
        </div>

        {/* Loading overlay (kept from original) */}
        {loading && (
            <div className="game-loading-overlay">
            <RingLoader color="#36d7b7" size={120} />
            </div>
        )}

        {/* Two‑column content area */}
        <div className="game-content-columns">
            {/* Left column – active tab content */}
            <div className="game-content-left">
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
                allTeams={teams}
                />
            )}
            {!loading && activeTab === 'leagueRoster' && (
                <RosterTab
                teams={teams}
                allPlayers={players}
                userTeamId={userTeam?.id}
                onViewPlayer={(player) => setSelectedPlayer(player)}
                standings={standings}
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
                <ScheduleTab
                schedule={schedule}
                teams={teams}
                currentDate={currentDate}
                currentTeam={managedClubId}
                />
            )}         
            {!loading && activeTab === 'frontoffice' && (
              <FrontOfficeTab
                savedGameId={game.id}
                teams={teams}
                players={players}
                userTeam={userTeam}
                standings={standings}
                userStanding={userStanding}
                userTeamPlayers={userTeamPlayers}
              />
            )}
            </div>
            {/* Right column – game sidebar & controls */}
            <div className="game-content-right">
            {/* <GameSidebar
                season={currentSeason}
                wins={userStanding?.wins ?? 0}
                losses={userStanding?.losses ?? 0}
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
            /> */}
            </div>
        </div>
        </main>

        {/* Player modal stays at the root level */}
        <PlayerModal
        player={selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
        />
        </GameProvider>
    </div>
  );
};

export default SelectedGame;