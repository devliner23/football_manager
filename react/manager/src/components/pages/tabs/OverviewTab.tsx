import React, { useState, useMemo } from 'react';
import { SavedGame, Team, Player } from '../../../shared/index';
import GameResults from '../GameResults';
import { useGameContext } from '../../../context/GameContext';
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
  Activity,
  Trophy,
  Home,
  Plane,
  Clock,
  Flame,
  FastForward
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
  onSimulateToDate: (date: string) => void;
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
  allTeams,
  onSimulateToDate
}) => {
  const [showTradeModal, setShowTradeModal] = useState(false);

  const { nextUserGame, leagueGamesBeforeCount = 0 } = useGameContext() || {};

  const teamMap = useMemo(() => {
    const m = new Map<string, Team>();
    allTeams.forEach((t) => m.set(t.id, t));
    return m;
  }, [allTeams]);

  const LEADER_STATS: {
    key: 'points' | 'rebounds' | 'assists';
    label: string;
    abbrev: string;
  }[] = [
    { key: 'points', label: 'Points', abbrev: 'PPG' },
    { key: 'rebounds', label: 'Rebounds', abbrev: 'RPG' },
    { key: 'assists', label: 'Assists', abbrev: 'APG' },
  ];

  const leagueBoard = (stat: 'points' | 'rebounds' | 'assists') =>
    [...players]
      .sort((a, b) => (b[stat] ?? 0) - (a[stat] ?? 0))
      .slice(0, 3)
      .map((p) => ({
        name: getPlayerName(p),
        team: teamMap.get(p.team_id)?.abbreviation ?? '—',
        value: p[stat] ?? 0,
      }));

  const franchiseBoard = (stat: 'points' | 'rebounds' | 'assists') =>
    [...userTeamPlayers]
      .sort((a, b) => (b[stat] ?? 0) - (a[stat] ?? 0))
      .slice(0, 3)
      .map((p) => ({
        name: getPlayerName(p),
        pos: p.position,
        value: p[stat] ?? 0,
      }));

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

  const daysUntil = useMemo(() => {
    if (!nextUserGame?.game_date) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const gameDay = new Date(nextUserGame.game_date);
    gameDay.setHours(0, 0, 0, 0);
    return Math.round((gameDay.getTime() - today.getTime()) / 86400000);
  }, [nextUserGame]);

  const handleSimulateToNextGame = () => {
    if (!nextUserGame?.game_date || !onSimulateToDate) return;
    const formatted = new Date(nextUserGame.game_date).toISOString().slice(0, 10);
    onSimulateToDate(formatted); // single date string → backend simulate route
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
        
        <header className="banner">
          {/* Left: Team identity */}
          <div className="banner__brand">
            <figure className="banner__avatar" aria-hidden="true">
              🏀
            </figure>
            <div className="banner__identity">
              <p className="banner__meta">
                {userTeam.city}
              </p>
              <h2 className="banner__team-name">{userTeam.name}</h2>
            </div>
          </div>

          {/* Divider */}
          <div className="banner__divider" aria-hidden="true" />

          {/* Center-left: League snapshot chips */}
          <section className="banner__league-info">
            <div className="league-chip">
              <span className="league-chip__label">League Date</span>
              <span className="league-chip__value">
                {game.current_game_date
                  ? new Date(game.current_game_date).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'Preseason'}
              </span>
            </div>
            <div className="league-chip">
              <span className="league-chip__label">Conference</span>
              <span className="league-chip__value">{userTeam.conference ?? '—'}</span>
            </div>
            <div className="league-chip">
              <span className="league-chip__label">Division</span>
              <span className="league-chip__value">{userTeam.division ?? '—'}</span>
            </div>
            <div className="league-chip">
              <span className="league-chip__label">League Size</span>
              <span className="league-chip__value">{allTeams.length || 30} Teams</span>
            </div>
            <div className="league-chip league-chip--accent">
              <span className="league-chip__label">Save File</span>
              <span className="league-chip__value">{game.name}</span>
            </div>
          </section>

          {/* Center: Key statistics */}
          <section className="banner__stats">
            <div className="stats-block">
              <span className="stats-block__label">Record Breakdown</span>
              <span className="stats-block__value stats-block__value--glow">
                {wins}<span className="stats-block__slash">/</span>{losses}
              </span>
              <span className="stats-block__sub">{winPct} Win %</span>
            </div>

            <div className="stats-block">
              <span className="stats-block__label">Roster Capacity</span>
              <span className="stats-block__value">
                {userTeamPlayers.length} <span className="stats-block__max">/ 15</span>
              </span>
              <span className="stats-block__sub">Active Contracts</span>
            </div>

            <div className="stats-block">
              <span className="stats-block__label">Franchise Status</span>
              <span className="stats-block__value stats-block__value--status">
                <Activity className="icon icon--pulse" />
                Stable
              </span>
              <span className="stats-block__sub">Luxury Tax Compliant</span>
            </div>
          </section>

          {/* Right: Actions & standings tracker */}
          <aside className="banner__actions">


            <div className="actions-group">
              <button
                className="btn btn--trade"
                onClick={() => setShowTradeModal(true)}
              >
                <span className="btn__content btn__content--default">
                  <ArrowRightLeft size={16} />
                  Quick Actions
                </span>
                <span className="btn__content btn__content--hover">
                  <span
                    className="trade-sub-action"
                    title="Propose Assets"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowTradeModal(true);
                    }}
                  >
                    <Zap size={18} />
                  </span>
                  <span
                    className="trade-sub-action"
                    title="Negotiations"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowTradeModal(true);
                    }}
                  >
                    <Users size={18} />
                  </span>
                  <span
                    className="trade-sub-action"
                    title="Negotiations"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowTradeModal(true);
                    }}
                  >
                    <Calendar size={18} />
                  </span>
                  <span
                    className="trade-sub-action"
                    title="Negotiations"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowTradeModal(true);
                    }}
                  >
                    <TrendingUp size={18} />
                  </span>
                </span>
              </button>
            </div>
          </aside>
        </header>
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

        {/* ==================== SIMULATION SPOTLIGHT + PLACEHOLDER ==================== */}
        <div className="overview-highlight-row">

          <div className="sim-spotlight-card">
            <div className="sim-spotlight-header">
              <h3 className="card-title">
                <Calendar size={16} className="title-icon-inline" />&nbsp; Next Matchup
              </h3>
              {nextUserGame && daysUntil !== null && (
                <span className="sim-countdown-pill">
                  {daysUntil <= 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `In ${daysUntil} days`}
                </span>
              )}
            </div>

            {nextUserGame ? (
              (() => {
                const isHome = nextUserGame.isHome;
                const opponent = isHome ? nextUserGame.away_team : nextUserGame.home_team;
                const self = isHome ? nextUserGame.home_team : nextUserGame.away_team;
                const oppRecord = null;
                const sameConference = null;

                return (
                  <div className="sim-broadcast">
                    <div className="sim-broadcast__scoreboard">
                      <div className="sim-team-panel sim-team-panel--self">
                        <div className="sim-team-avatar sim-team-avatar--self">
                          {self?.abbreviation || userTeam.abbreviation}
                        </div>
                        <span className="sim-team-name">{self?.name || userTeam.name}</span>
                        <span className="sim-team-record">{wins}-{losses}</span>
                      </div>

                      <div className="sim-center-col">
                        <span className={`matchup-loc-tag ${isHome ? 'home' : 'away'}`}>
                          {isHome ? <Home size={12} /> : <Plane size={12} />}
                          {isHome ? 'HOME' : 'AWAY'}
                        </span>
                        <span className="sim-vs-text">VS</span>
                        <span className="matchup-vs-sub">
                          {leagueGamesBeforeCount > 0 ? `${leagueGamesBeforeCount} league games first` : 'Next up'}
                        </span>
                      </div>

                      <div className="sim-team-panel sim-team-panel--opp">
                        <div className="sim-team-avatar sim-team-avatar--opp">
                          {opponent?.abbreviation || '???'}
                        </div>
                        <span className="sim-team-name">{opponent?.name || 'TBD'}</span>
                        {oppRecord && <span className="sim-team-record">{oppRecord}</span>}
                      </div>
                    </div>

                    <div className="sim-broadcast__ticker">
                      <span className="matchup-meta-item">
                        <Clock size={13} />
                        {nextUserGame.game_date
                          ? new Date(nextUserGame.game_date).toLocaleDateString(undefined, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                            })
                          : 'Date TBD'}
                      </span>
                      <span className="matchup-meta-item">
                        <Trophy size={13} />
                        {opponent ? (sameConference ? 'Conference Matchup' : 'Interconference') : 'Matchup TBD'}
                      </span>
                      <span className="matchup-meta-item">
                        <Flame size={13} />
                        Simulation Ready
                      </span>
                    </div>

                    <div className="banner__actions">
                      <button
                        className="btn btn--trade"
                        onClick={handleSimulateToNextGame}
                      >
                        <span className="btn__content btn__content--default">
                          <FastForward size={16} />
                          Simulate Next User Game
                        </span>
                        <span className="btn__content btn__content--hover">
                          <span>Simulating to: {new Date(nextUserGame.game_date).toLocaleDateString(undefined, {
                                      weekday: 'short',
                                      month: 'short',
                                      day: 'numeric',
                                    })}</span>
                        </span>
                      </button>
                    </div>

                  </div>
                );
              })()
            ) : (
              <div className="empty-state">Season complete — no games remaining.</div>
            )}
          </div>

          {/* PLACEHOLDER */}
          <div className="sim-spotlight-placeholder">
            <span className="sim-spotlight-placeholder__label">Coming Soon</span>
          </div>

        </div>

        {/* ==================== LEADERBOARDS ROW ==================== */}
        <div className="overview-lower-flex-row">

          {/* 1. LEAGUE LEADERS */}
          <div className="leaders-card lower-row-panel">
            <h3 className="card-title">
              <Award size={16} className="title-icon-inline" /> League Stat Leaders
            </h3>
            <div className="leaderboard-stack">
              {LEADER_STATS.map(({ key, label, abbrev }) => {
                const board = leagueBoard(key);
                const max = board[0]?.value || 1;
                return (
                  <div className="leaderboard-group" key={key}>
                    <div className="leaderboard-group-header">
                      <span>{label}</span>
                      <span className="leaderboard-unit">{abbrev}</span>
                    </div>
                    {board.length === 0 ? (
                      <div className="leaderboard-empty">No data yet</div>
                    ) : (
                      board.map((row, idx) => (
                        <div className="leaderboard-row" key={`${key}-${idx}`}>
                          <span className={`leaderboard-rank rank-${idx + 1}`}>{idx + 1}</span>
                          <div className="leaderboard-info">
                            <div className="leaderboard-name-row">
                              <span className="leaderboard-name">{row.name}</span>
                              <span className="leaderboard-team">{row.team}</span>
                            </div>
                            <div className="leaderboard-bar-track">
                              <div
                                className="leaderboard-bar-fill"
                                style={{ width: `${Math.max(6, (row.value / max) * 100)}%` }}
                              />
                            </div>
                          </div>
                          <span className="leaderboard-value">{row.value.toFixed(1)}</span>
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. TEAM LEADERS */}
          <div className="leaders-card lower-row-panel">
            <h3 className="card-title">
              <User size={16} className="title-icon-inline" /> Franchise Roster Leaders
            </h3>
            <div className="leaderboard-stack">
              {LEADER_STATS.map(({ key, label, abbrev }) => {
                const board = franchiseBoard(key);
                const max = board[0]?.value || 1;
                return (
                  <div className="leaderboard-group" key={key}>
                    <div className="leaderboard-group-header">
                      <span>{label}</span>
                      <span className="leaderboard-unit">{abbrev}</span>
                    </div>
                    {board.length === 0 ? (
                      <div className="leaderboard-empty">No roster data</div>
                    ) : (
                      board.map((row, idx) => (
                        <div className="leaderboard-row" key={`${key}-${idx}`}>
                          <span className={`leaderboard-rank rank-${idx + 1}`}>{idx + 1}</span>
                          <div className="leaderboard-info">
                            <div className="leaderboard-name-row">
                              <span className="leaderboard-name">{row.name}</span>
                              <span className="leaderboard-team">{row.pos}</span>
                            </div>
                            <div className="leaderboard-bar-track">
                              <div
                                className="leaderboard-bar-fill leaderboard-bar-fill--team"
                                style={{ width: `${Math.max(6, (row.value / max) * 100)}%` }}
                              />
                            </div>
                          </div>
                          <span className="leaderboard-value">{row.value.toFixed(1)}</span>
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
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