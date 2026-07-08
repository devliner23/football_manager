import React, { useState, useMemo, useEffect, useRef } from 'react';
import { SavedGame, Team, Player } from '../../../shared/index';
import { GameResult } from '../../../api/leagueApi';
import GameResults from '../GameResults';
import DayGamesModal from './tabComponents/DayGamesModal';
import { useGameContext } from '../../../context/GameContext';
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  User, 
  ArrowRightLeft, 
  Users, 
  BarChart3,
  Award,
  Zap,
  DollarSign,
  Trophy,
  Home,
  Plane,
  Clock,
  Flame,
  Minus,
  FastForward,
  Activity, 
  Crosshair, 
  Shield
} from 'lucide-react';
import TradePanel from './tabComponents/TradePanel';
import teamColors from '../../../data/teamColors.json';
import "./styles/OverviewTab.css";
import './styles/ScheduleTab.css'; // reuse cal-* calendar classes

// ── Team Colors Types & Helpers ──────────────────────────────────────────────

interface TeamColorData {
  primary: string;
  secondary: string;
  accent: string;
  mascot: string;
  background: string;
}

type TeamColorsMap = Record<string, TeamColorData>;

// Convert hex (#RRGGBB) to RGB components
const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
};

// Simple deterministic string hash, used only to pick a stable
// LA franchise (see below) rather than picking one at random.
const hashString = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
};

// teamColors.json is keyed by real NBA "City Name" (e.g. "Boston Celtics"),
// but the teams in this league have fictional names tied only to a city
// (e.g. "Boston Sentinels"). So we match on city, not on the full team name.
const getTeamColorsByCity = (city?: string, disambiguator?: string): TeamColorData | undefined => {
  if (!city) return undefined;
  const map = teamColors as TeamColorsMap;

  // Los Angeles is the one city with two franchises in teamColors.json
  // ("Los Angeles Lakers" and "LA Clippers"), so a plain city match is
  // ambiguous. Use a stable hash of the fictional team name to pick
  // consistently between the two rather than always defaulting to one.
  if (city === 'Los Angeles') {
    const laKeys = ['Los Angeles Lakers', 'LA Clippers'];
    const idx = disambiguator ? hashString(disambiguator) % laKeys.length : 0;
    return map[laKeys[idx]];
  }

  const entry = Object.entries(map).find(([key]) => key.startsWith(city));
  return entry?.[1];
};

// Get glass style keyed off a team's city (with an optional name to
// disambiguate LA franchises)
const getTeamGlassStyle = (city?: string, disambiguator?: string): React.CSSProperties => {
  const colors = getTeamColorsByCity(city, disambiguator);

  if (!colors) {
    // Fallback glass style for unknown teams
    return {
      background: 'rgba(255, 255, 255, 0.08)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(255, 255, 255, 0.15)',
      boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
    };
  }

  const rgb = hexToRgb(colors.primary);
  if (!rgb) {
    return {
      background: 'rgba(255, 255, 255, 0.08)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(255, 255, 255, 0.15)',
    };
  }

  const { r, g, b } = rgb;

  return {
    background: `linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.25) 0%, rgba(${r}, ${g}, ${b}, 0.08) 100%)`,
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: `1px solid rgba(${r}, ${g}, ${b}, 0.4)`,
    boxShadow: `
      0 4px 15px rgba(0, 0, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.1),
      0 0 20px rgba(${r}, ${g}, ${b}, 0.15)
    `,
    color: colors.primary,
    textShadow: `0 0 10px rgba(${r}, ${g}, ${b}, 0.5)`,
  };
};

// ── Component ────────────────────────────────────────────────────────────────

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
  schedule?: Record<number, GameResult[]>;
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
  onSimulateToDate,
  schedule
}) => {
  const [showTradeModal, setShowTradeModal] = useState(false);

  // ── Quick Continue day-list state ──
  const qcAnchorDate = useMemo(
    () => (game.current_game_date ? new Date(game.current_game_date) : new Date()),
    [game.current_game_date]
  );
  const [qcVisibleCount, setQcVisibleCount] = useState(7);
  const [qcSelectedDate, setQcSelectedDate] = useState<string | null>(
    game.current_game_date ? game.current_game_date.slice(0, 10) : null
  );
  const qcListRef = useRef<HTMLDivElement | null>(null);

  const qcFormatDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const qcAddDays = (base: Date, days: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d;
  };

  const qcIsSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const qcDays = useMemo(
    () => Array.from({ length: qcVisibleCount }, (_, i) => qcAddDays(qcAnchorDate, i)),
    [qcAnchorDate, qcVisibleCount]
  );

  const MAX_QC_DAYS = 90; // safety cap so the list can't grow forever

  const handleQcScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 32) {
      setQcVisibleCount((c) => Math.min(c + 7, MAX_QC_DAYS));
    }
  };

  const handleQuickContinueTo = () => {
    if (qcSelectedDate) onSimulateToDate(qcSelectedDate);
  };

  const [dayModalDate, setDayModalDate] = useState<Date | null>(null);

  const gamesByDate = useMemo(() => {
    const map = new Map<string, GameResult[]>();
    if (!schedule) return map;
    Object.values(schedule).forEach((weekGames) => {
      weekGames.forEach((g) => {
        const src = g.game_date || g.played_at;
        if (!src) return;
        const key = new Date(src).toISOString().split('T')[0];
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(g);
      });
    });
    return map;
  }, [schedule]);


  // Pull everything SelectedGame actually provides via GameProvider,
  // not just nextUserGame/leagueGamesBeforeCount.
  const {
    nextUserGame,
    leagueGamesBeforeCount = 0,
    season,
    lastSimulatedDate,
    playerCount,
    ppg,
    oppg,
    loading: simLoading,
    onContinue,
    onViewStandings,
  } = useGameContext() || {};

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
    onSimulateToDate(nextUserGame.game_date.slice(0, 10));
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

  const displaySeason = season ?? game.current_season ?? 1;
  const displayLastSimmed = lastSimulatedDate ?? game.current_game_date ?? null;

  return (
    <div className="overview-container">
      <div className="overview-grid">
        {/* ==================== 50% WIDTH BANNER ==================== */}
        <div className="overview-top-split">
          <header className="banner-overview">
            {/* Brand identity */}
            <div className="banner__brand">
              <figure
                className="banner__avatar"
                aria-hidden="true"
                style={getTeamGlassStyle(userTeam.name)}
              >
                🏀
              </figure>
              <div className="banner__identity">
                <p className="banner__meta">{userTeam.city}</p>
                <h2 className="banner__team-name">{userTeam.name}</h2>
              </div>
              <div className="banner__record-pill">
                <span className="record-pill__wins">{wins}</span>
                <span className="record-pill__dash">–</span>
                <span className="record-pill__losses">{losses}</span>
              </div>
            </div>
            {/* League info chips */}
            <div className="banner__info-row">
              <div className="league-chip">
                <span className="league-chip__label">Date</span>
                <span className="league-chip__value">
                  {game.current_game_date
                    ? new Date(game.current_game_date).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
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
                <span className="league-chip__label">Roster</span>
                <span className="league-chip__value">
                  {userTeamPlayers.length}<span className="league-chip__max"> / 15</span>
                </span>
              </div>
            </div>
            {/* Win rate bar */}
            <div className="banner__winrate">
              <div className="winrate__header">
                <span className="winrate__label">Season Win Rate</span>
                <span className="winrate__pct">{winPct}%</span>
              </div>
              <div className="winrate__track">
                <div
                  className="winrate__fill"
                  style={{ width: '62%' }}
                />
                <span
                  className="winrate__marker"
                  style={{ left: '50%' }}
                />
              </div>
              <span className="winrate__note">League average: 50.0%</span>
            </div>
            {/* Quick actions */}
            <div className="banner__actions-row">
              <button
                className="btn btn--trade btn--trade-wide"
                onClick={() => setShowTradeModal(true)}
              >
                <span className="btn__content btn__content--default">
                  <ArrowRightLeft size={18} />
                  Quick Actions
                </span>
                <span className="btn__content btn__content--hover">
                  <span className="trade-sub-action" title="Propose Assets" onClick={(e) => { e.stopPropagation(); setShowTradeModal(true); }}>
                    <Zap size={22} />
                  </span>
                  <span className="trade-sub-action" title="Negotiations" onClick={(e) => { e.stopPropagation(); setShowTradeModal(true); }}>
                    <Users size={22} />
                  </span>
                  <span className="trade-sub-action" title="Calendar" onClick={(e) => { e.stopPropagation(); setShowTradeModal(true); }}>
                    <Calendar size={22} />
                  </span>
                  <span className="trade-sub-action" title="Standings" onClick={(e) => { e.stopPropagation(); setShowTradeModal(true); }}>
                    <TrendingUp size={22} />
                  </span>
                </span>
              </button>
            </div>
          </header>
          {/* ==================== 50% WIDTH KPI ANALYTICS ==================== */}
          <div className="overview-kpi-panel">
            <div className="kpi-panel__header">
              <div className="kpi-panel__title-group">

                <span className="kpi-panel__subtitle">Per-Game Season Averages</span>
              </div>
              <div className="kpi-panel__badge">
                <Activity size={12} />
                Live
              </div>
            </div>
            {/* ── Offensive Stats ── */}
            <div className="kpi-group">
              <div className="kpi-group__label">
                <Crosshair size={11} />
                Offense
              </div>
              <div className="kpi-group__grid">
                <div className="kpi-stat">
                  <div className="kpi-stat__top">
                    <span className="kpi-stat__name">PPG</span>
                    <span className="kpi-stat__rank rank--elite">#3</span>
                  </div>
                  <span className="kpi-stat__value">{averages.pts}</span>
                  <div className="kpi-stat__bar">
                    <div className="kpi-stat__bar-fill bar--elite" style={{ width: '85%' }} />
                  </div>
                  <span className="kpi-stat__compare trend-up">
                    <TrendingUp size={10} /> +4.2 vs Lg
                  </span>
                </div>
                <div className="kpi-stat">
                  <div className="kpi-stat__top">
                    <span className="kpi-stat__name">APG</span>
                    <span className="kpi-stat__rank rank--good">#5</span>
                  </div>
                  <span className="kpi-stat__value">{averages.ast}</span>
                  <div className="kpi-stat__bar">
                    <div className="kpi-stat__bar-fill bar--good" style={{ width: '74%' }} />
                  </div>
                  <span className="kpi-stat__compare trend-up">
                    <TrendingUp size={10} /> +2.1 vs Lg
                  </span>
                </div>
                <div className="kpi-stat">
                  <div className="kpi-stat__top">
                    <span className="kpi-stat__name">FG%</span>
                    <span className="kpi-stat__rank rank--neutral">#12</span>
                  </div>
                  <span className="kpi-stat__value">.472</span>
                    <div className="kpi-stat__bar">
                    <div className="kpi-stat__bar-fill bar--neutral" style={{ width: '56%' }} />
                  </div>
                  <span className="kpi-stat__compare trend-neutral">
                    <Minus size={10} /> +0.8% vs Lg
                  </span>
                </div>
                <div className="kpi-stat">
                  <div className="kpi-stat__top">
                    <span className="kpi-stat__name">3P%</span>
                    <span className="kpi-stat__rank rank--bad">#22</span>
                  </div>
                  <span className="kpi-stat__value">.348</span>
                    <div className="kpi-stat__bar">
                    <div className="kpi-stat__bar-fill bar--danger" style={{ width: '35%' }} />
                  </div>
                  <span className="kpi-stat__compare trend-down">
                    <TrendingDown size={10} /> -1.4% vs Lg
                  </span>
                </div>
              </div>
            </div>
            {/* ── Defensive Stats ── */}
            <div className="kpi-group">
              <div className="kpi-group__label">
                <Shield size={11} />
                Defense
              </div>
              <div className="kpi-group__grid">
                <div className="kpi-stat">
                  <div className="kpi-stat__top">
                    <span className="kpi-stat__name">RPG</span>
                    <span className="kpi-stat__rank rank--good">#4</span>
                  </div>
                  <span className="kpi-stat__value">{averages.reb}</span>
                  <div className="kpi-stat__bar">
                    <div className="kpi-stat__bar-fill bar--good" style={{ width: '78%' }} />
                  </div>
                  <span className="kpi-stat__compare trend-up">
                    <TrendingUp size={10} /> +3.5 vs Lg
                  </span>
                </div>
                <div className="kpi-stat">
                  <div className="kpi-stat__top">
                    <span className="kpi-stat__name">STL</span>
                    <span className="kpi-stat__rank rank--neutral">#14</span>
                  </div>
                  <span className="kpi-stat__value">7.8</span>
                  <div className="kpi-stat__bar">
                    <div className="kpi-stat__bar-fill bar--neutral" style={{ width: '50%' }} />
                  </div>
                  <span className="kpi-stat__compare trend-neutral">
                    <Minus size={10} /> +0.3 vs Lg
                  </span>
                </div>
                <div className="kpi-stat">
                  <div className="kpi-stat__top">
                    <span className="kpi-stat__name">BLK</span>
                    <span className="kpi-stat__rank rank--good">#7</span>
                  </div>
                  <span className="kpi-stat__value">5.1</span>
                  <div className="kpi-stat__bar">
                    <div className="kpi-stat__bar-fill bar--good" style={{ width: '68%' }} />
                  </div>
                  <span className="kpi-stat__compare trend-up">
                    <TrendingUp size={10} /> +0.8 vs Lg
                  </span>
                </div>
                <div className="kpi-stat">
                  <div className="kpi-stat__top">
                    <span className="kpi-stat__name">TOV</span>
                    <span className="kpi-stat__rank rank--bad">#25</span>
                  </div>
                  <span className="kpi-stat__value">14.3</span>
                  <div className="kpi-stat__bar">
                    <div className="kpi-stat__bar-fill bar--danger" style={{ width: '28%' }} />
                  </div>
                  <span className="kpi-stat__compare trend-down">
                    <TrendingDown size={10} /> +1.2 vs Lg
                  </span>
                </div>
              </div>
            </div>
            {/* ── Advanced Metrics Footer ── */}
            <div className="kpi-advanced-row">
              <div className="kpi-advanced-card kpi-advanced-card--offense">
                <span className="kpi-advanced-card__label">Off Rtg</span>
                <div className="kpi-advanced-card__body">
                  <span className="kpi-advanced-card__value">112.4</span>
                  <span className="kpi-advanced-card__rank">#6</span>
                </div>
                <span className="kpi-advanced-card__trend trend-up">
                  <TrendingUp size={10} /> +3.1
                </span>
              </div>
              <div className="kpi-advanced-card kpi-advanced-card--net">
                <span className="kpi-advanced-card__label">Net Rtg</span>
                <div className="kpi-advanced-card__body">
                  <span className="kpi-advanced-card__value">+5.3</span>
                  <span className="kpi-advanced-card__rank">#4</span>
                </div>
                <span className="kpi-advanced-card__trend trend-up">
                  <TrendingUp size={10} /> +2.7
                </span>
              </div>
              <div className="kpi-advanced-card kpi-advanced-card--defense">
                <span className="kpi-advanced-card__label">Def Rtg</span>
                <div className="kpi-advanced-card__body">
                  <span className="kpi-advanced-card__value">107.1</span>
                  <span className="kpi-advanced-card__rank">#8</span>
                </div>
                <span className="kpi-advanced-card__trend trend-up">
                  <TrendingUp size={10} /> -1.4
                </span>
              </div>
              <div className="kpi-advanced-card kpi-advanced-card--pace">
                <span className="kpi-advanced-card__label">Pace</span>
                <div className="kpi-advanced-card__body">
                  <span className="kpi-advanced-card__value">98.7</span>
                  <span className="kpi-advanced-card__rank">#11</span>
                </div>
                <span className="kpi-advanced-card__trend trend-neutral">
                  <Minus size={10} /> +0.2
                </span>
              </div>
            </div>
          </div>
        </div>
      
        {/* ==================== SIMULATION SPOTLIGHT + QUICK CONTINUE ==================== */}
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
                      {/* ✅ USER TEAM AVATAR — colored by city */}
                      <div className="sim-team-panel sim-team-panel--self">
                        <div 
                          className="sim-team-avatar sim-team-avatar--self"
                          style={getTeamGlassStyle(self?.city || userTeam.city, self?.name || userTeam.name)}
                        >
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

                      {/* ✅ OPPONENT TEAM AVATAR — colored by city */}
                      <div className="sim-team-panel sim-team-panel--opp">
                        <div 
                          className="sim-team-avatar sim-team-avatar--opp"
                          style={getTeamGlassStyle(opponent?.city, opponent?.name)}
                        >
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

          <div className="sim-spotlight-placeholder quick-continue-card">
            <div className="qc-card">
              <div className="qc-list-header">
                <Calendar size={14} strokeWidth={2} />
                <span>Quick Continue</span>
              </div>

              <div className="qc-day-list" ref={qcListRef} onScroll={handleQcScroll}>
                {qcDays.map((d) => {
                  const dateKey = qcFormatDate(d);
                  const isSelected = dateKey === qcSelectedDate;
                  const isToday = qcIsSameDay(d, qcAnchorDate);

                  return (
                    <div
                      key={dateKey}
                      className={`qc-day-row ${isSelected ? 'selected' : ''} ${isToday ? 'is-today' : ''}`}
                      onClick={() => {setQcSelectedDate(dateKey); setDayModalDate(d);}}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="qc-day-row-left">
                        {isToday ? (
                          <div>
                            <span className="qc-day-weekday-active">
                              {d.toLocaleDateString(undefined, { weekday: 'short' })}
                            </span>
                            <span className="qc-day-num-active">{d.getDate()}</span>
                            <span className="qc-day-month-active">
                              {d.toLocaleDateString(undefined, { month: 'short' })}
                            </span>
                          </div>
                      ) : (
                        <div>
                          <span className="qc-day-weekday">
                            {d.toLocaleDateString(undefined, { weekday: 'short' })}
                          </span>
                          <span className="qc-day-num">{d.getDate()}</span>
                          <span className="qc-day-month">
                            {d.toLocaleDateString(undefined, { month: 'short' })}
                          </span>
                        </div>
                  )}

                      </div>
                      
                    </div>
                  );
                })}
              </div>

              {}

              <button
                className="glass-btn btn-primary-blue-glow large-btn quick-continue-btn"
                onClick={handleQuickContinueTo}
                disabled={!qcSelectedDate}
              >
                <FastForward size={16} />
                {qcSelectedDate
                  ? `Continue To ${new Date(qcSelectedDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                  : 'Select a date'}
              </button>
            </div>
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


      <DayGamesModal
        date={dayModalDate}
        games={dayModalDate ? gamesByDate.get(dayModalDate.toISOString().split('T')[0]) || [] : []}
        teams={allTeams}
        onClose={() => setDayModalDate(null)}
      />
    </div>
  );
};

export default OverviewTab;