import React, { useState, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { GameResult } from '../../../api/leagueApi';
import IndividualGameView from './tabComponents/IndividualGameViewFinal';
import GamesListView from './tabComponents/GamesListView';
import MiniCalendar from './tabComponents/MiniCalendar';
import GameSnapshot from './tabComponents/GameSnapshot';
import DayGamesModal from './tabComponents/DayGamesModal';
import {
  Trophy,
  Flame,
  Home,
  Plane,
  CalendarDays,
  TrendingUp,
  Activity,
  ChevronRight,
  Clock,
  MapPin,
  CalendarRange,
  CircleDot,
} from 'lucide-react';
import './styles/ScheduleTab.css';

interface ScheduleTabProps {
  schedule: Record<number, GameResult[]>;
  teams: { id: string; name: string; abbreviation: string }[];
  currentDate: string | null;
  currentTeam: string | null;
}

type Tab = 'team-schedule' | 'league-schedule' | 'calendar';

const ScheduleTab: React.FC<ScheduleTabProps> = ({ schedule, teams, currentDate, currentTeam }) => {
  const [activeTab, setActiveTab] = useState<Tab>('team-schedule');

  // ── Modal for calendar tab ──
  const [calendarModalDate, setCalendarModalDate] = useState<Date | null>(null);

  // ── League Schedule sub‑state ──
  const [gamesTabSelectedDate, setGamesTabSelectedDate] = useState<Date>(() => {
    if (currentDate) {
      const d = new Date(currentDate);
      return isNaN(d.getTime()) ? new Date() : d;
    }
    return new Date();
  });
  const [gamesTabViewMode, setGamesTabViewMode] = useState<'daily' | 'weekly'>('daily');
  const [leagueSelectedGame, setLeagueSelectedGame] = useState<GameResult | null>(null);

  // Manual date entry for League Schedule
  const [manualDateText, setManualDateText] = useState<string>(() =>
    gamesTabSelectedDate.toISOString().split('T')[0]
  );

  // ── Team Schedule sub‑state ──
  const [teamSelectedGame, setTeamSelectedGame] = useState<GameResult | null>(null);

  // ── Calendar month navigation ──
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    if (currentDate) return new Date(currentDate);
    return new Date();
  });

  // ── Team map ──
  const teamMap = useMemo(() => {
    const map = new Map(teams.map(t => [t.id, t]));
    return map;
  }, [teams]);

  // ── Games grouped by date (YYYY‑MM‑DD) ──
  const gamesByDate = useMemo(() => {
    const map = new Map<string, GameResult[]>();
    Object.values(schedule).forEach(weekGames => {
      weekGames.forEach(game => {
        const dateSource = game.game_date || game.played_at;
        if (!dateSource) return;
        const date = new Date(dateSource).toISOString().split('T')[0];
        if (!map.has(date)) map.set(date, []);
        map.get(date)!.push(game);
      });
    });
    return map;
  }, [schedule]);

  // ── All games for the managed team (sorted by date) ──
  const teamGames = useMemo(() => {
    if (!currentTeam) return [];
    const allGames: GameResult[] = [];
    Object.values(schedule).forEach(weekGames => {
      weekGames.forEach(game => {
        if (game.home_team_id === currentTeam || game.away_team_id === currentTeam) {
          allGames.push(game);
        }
      });
    });
    allGames.sort(
      (a, b) => new Date(a.game_date || a.played_at || 0).getTime() - new Date(b.game_date || b.played_at || 0).getTime()
    );
    return allGames;
  }, [schedule, currentTeam]);

  // ── Daily games for the league‑schedule date ──
  const dailyGames = useMemo(() => {
    const key = gamesTabSelectedDate.toISOString().split('T')[0];
    return gamesByDate.get(key) || [];
  }, [gamesTabSelectedDate, gamesByDate]);

  // ── Team Schedule: derived summary stats ──
  const teamSummary = useMemo(() => {
    const played = teamGames.filter(g => g.status === 'completed' && g.home_score != null);
    const upcoming = teamGames.filter(g => g.status !== 'completed');

    let wins = 0, losses = 0;
    let homeWins = 0, homeLosses = 0, awayWins = 0, awayLosses = 0;
    let pointsFor = 0, pointsAgainst = 0;
    const results: ('W' | 'L')[] = [];

    played.forEach(game => {
      const isHome = game.home_team_id === currentTeam;
      const teamScore = isHome ? game.home_score : game.away_score;
      const oppScore = isHome ? game.away_score : game.home_score;
      const won = teamScore > oppScore;

      pointsFor += teamScore ?? 0;
      pointsAgainst += oppScore ?? 0;

      if (won) {
        wins++;
        if (isHome) homeWins++; else awayWins++;
      } else {
        losses++;
        if (isHome) homeLosses++; else awayLosses++;
      }
      results.push(won ? 'W' : 'L');
    });

    // Current streak (from most recent game backwards)
    let streakType: 'W' | 'L' | null = null;
    let streakCount = 0;
    for (let i = results.length - 1; i >= 0; i--) {
      if (streakType === null) {
        streakType = results[i];
        streakCount = 1;
      } else if (results[i] === streakType) {
        streakCount++;
      } else {
        break;
      }
    }

    const gamesPlayed = played.length;
    const winPct = gamesPlayed > 0 ? wins / gamesPlayed : 0;
    const ppg = gamesPlayed > 0 ? pointsFor / gamesPlayed : 0;
    const oppg = gamesPlayed > 0 ? pointsAgainst / gamesPlayed : 0;

    // Last 5 results, chronological
    const last5 = results.slice(-5);

    const nextGame = upcoming.length > 0 ? upcoming[0] : null;
    const lastGame = played.length > 0 ? played[played.length - 1] : null;

    return {
      wins,
      losses,
      winPct,
      homeRecord: `${homeWins}-${homeLosses}`,
      awayRecord: `${awayWins}-${awayLosses}`,
      ppg,
      oppg,
      diff: ppg - oppg,
      streakType,
      streakCount,
      last5,
      gamesPlayed,
      gamesRemaining: upcoming.length,
      nextGame,
      lastGame,
    };
  }, [teamGames, currentTeam]);

  // ── League Schedule date navigation ──
  const goToPreviousDay = () => {
    const prev = new Date(gamesTabSelectedDate);
    prev.setDate(prev.getDate() - 1);
    setGamesTabSelectedDate(prev);
    setManualDateText(prev.toISOString().split('T')[0]);
    setLeagueSelectedGame(null);
  };

  const goToNextDay = () => {
    const next = new Date(gamesTabSelectedDate);
    next.setDate(next.getDate() + 1);
    setGamesTabSelectedDate(next);
    setManualDateText(next.toISOString().split('T')[0]);
    setLeagueSelectedGame(null);
  };

  const handleManualDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setManualDateText(value);
    // Validate and apply on blur or Enter (we'll use onKeyDown)
  };

  const applyManualDate = () => {
    const d = new Date(manualDateText + 'T00:00:00');
    if (!isNaN(d.getTime())) {
      setGamesTabSelectedDate(d);
      setLeagueSelectedGame(null);
    } else {
      // Reset to current selected date if invalid
      setManualDateText(gamesTabSelectedDate.toISOString().split('T')[0]);
    }
  };

  const handleManualDateKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      applyManualDate();
      (e.target as HTMLInputElement).blur();
    }
  };

  // ── Calendar helpers (unchanged) ──
  const calendarYear = calendarMonth.getFullYear();
  const calendarMonthIndex = calendarMonth.getMonth();
  const daysInMonth = new Date(calendarYear, calendarMonthIndex + 1, 0).getDate();
  const firstDayOfWeek = new Date(calendarYear, calendarMonthIndex, 1).getDay();
  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);
  while (calendarDays.length < 42) calendarDays.push(null);

  const getDateString = (day: number) =>
    `${calendarYear}-${String(calendarMonthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const calendarMonthSummary = useMemo(() => {
    let totalGames = 0;
    let completedGames = 0;
    let userGames = 0;
    let daysWithGames = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const key = getDateString(d);
      const games = gamesByDate.get(key) || [];
      if (games.length > 0) daysWithGames++;
      totalGames += games.length;
      games.forEach(g => {
        if (g.status === 'completed') completedGames++;
        if (currentTeam && (g.home_team_id === currentTeam || g.away_team_id === currentTeam)) {
          userGames++;
        }
      });
    }

    return { totalGames, completedGames, userGames, daysWithGames };
  }, [gamesByDate, daysInMonth, calendarYear, calendarMonthIndex, currentTeam]);

  const gameCountForDay = (day: number | null): number => {
    if (day === null) return 0;
    const key = getDateString(day);
    return gamesByDate.get(key)?.length || 0;
  };

  const handleCalendarDayClick = (day: number | null) => {
    if (day === null) return;
    const date = new Date(calendarYear, calendarMonthIndex, day);
    setCalendarModalDate(date);
  };

  const closeCalendarModal = () => {
    setCalendarModalDate(null);
  };

  // ── Mini calendar date select for League Schedule ──
  const handleMiniCalendarSelect = (date: Date) => {
    setGamesTabSelectedDate(date);
    setManualDateText(date.toISOString().split('T')[0]);
    setLeagueSelectedGame(null);
  };

  // ── Render helpers ──
  const renderGameCard = (game: GameResult, isSelected: boolean, onClick: () => void) => {
    const home = teamMap.get(game.home_team_id);
    const away = teamMap.get(game.away_team_id);
    return (
      <div
        key={game.id}
        className={`game-card-sidebar ${isSelected ? 'selected' : ''}`}
        onClick={onClick}
        role="button"
        tabIndex={0}
      >
        <div className="game-card-content">
          <div className="game-teams">
            <span className="team home">{home?.abbreviation || 'TBD'}</span>
            <span className="vs">vs</span>
            <span className="team away">{away?.abbreviation || 'TBD'}</span>
          </div>
          <div className="game-score">
            {game.status === 'completed' && game.home_score != null
              ? `${game.home_score} - ${game.away_score}`
              : '—'}
          </div>
          <span className={`game-status status-${game.status}`}>{game.status}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="schedule-tab-container">
      {/* Tab bar */}
      <div className="tab-bar">
        {(['team-schedule', 'league-schedule', 'calendar'] as Tab[]).map(tab => (
          <button
            key={tab}
            className={`tab-item ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'team-schedule' ? 'Team Schedule' : tab === 'league-schedule' ? 'League Schedule' : 'Calendar'}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {/* ─── Team Schedule ─── */}
        {activeTab === 'team-schedule' && (
          <div className="team-sched-wrap">
            {!currentTeam && (
              <div className="team-sched-empty-state">
                <CalendarDays size={32} strokeWidth={1.5} />
                <p>No team selected.</p>
              </div>
            )}

            {currentTeam && (
              <>
                {/* ── Summary strip ── */}
                <div className="team-sched-summary">
                  <div className="tss-card tss-record">
                    <div className="tss-card-label">
                      <Trophy size={13} strokeWidth={2} />
                      <span>Record</span>
                    </div>
                    <div className="tss-record-value">
                      {teamSummary.wins}<span className="tss-dash">–</span>{teamSummary.losses}
                    </div>
                    <div className="tss-card-sub">
                      {(teamSummary.winPct * 100).toFixed(1)}% win rate
                    </div>
                  </div>

                  <div className="tss-card">
                    <div className="tss-card-label">
                      <Flame size={13} strokeWidth={2} />
                      <span>Streak</span>
                    </div>
                    <div
                      className={`tss-streak-value ${
                        teamSummary.streakType === 'W'
                          ? 'streak-win'
                          : teamSummary.streakType === 'L'
                          ? 'streak-loss'
                          : ''
                      }`}
                    >
                      {teamSummary.streakType
                        ? `${teamSummary.streakType}${teamSummary.streakCount}`
                        : '—'}
                    </div>
                    <div className="tss-form-dots">
                      {teamSummary.last5.length === 0 ? (
                        <span className="tss-card-sub">No games played</span>
                      ) : (
                        teamSummary.last5.map((r, i) => (
                          <span key={i} className={`form-dot ${r === 'W' ? 'form-w' : 'form-l'}`}>
                            {r}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="tss-card">
                    <div className="tss-card-label">
                      <Home size={13} strokeWidth={2} />
                      <span>Home / Away</span>
                    </div>
                    <div className="tss-split-row">
                      <span className="tss-split-item">
                        <Home size={12} strokeWidth={2} /> {teamSummary.homeRecord}
                      </span>
                      <span className="tss-split-item">
                        <Plane size={12} strokeWidth={2} /> {teamSummary.awayRecord}
                      </span>
                    </div>
                    <div className="tss-card-sub">{teamSummary.gamesPlayed} games played</div>
                  </div>

                  <div className="tss-card">
                    <div className="tss-card-label">
                      <TrendingUp size={13} strokeWidth={2} />
                      <span>Scoring</span>
                    </div>
                    <div className="tss-scoring-row">
                      <div className="tss-scoring-item">
                        <span className="tss-scoring-value">
                          {teamSummary.gamesPlayed > 0 ? teamSummary.ppg.toFixed(1) : '—'}
                        </span>
                        <span className="tss-scoring-label">PPG</span>
                      </div>
                      <div className="tss-scoring-item">
                        <span className="tss-scoring-value">
                          {teamSummary.gamesPlayed > 0 ? teamSummary.oppg.toFixed(1) : '—'}
                        </span>
                        <span className="tss-scoring-label">OPP</span>
                      </div>
                      <div className="tss-scoring-item">
                        <span
                          className={`tss-scoring-value ${
                            teamSummary.diff > 0 ? 'diff-pos' : teamSummary.diff < 0 ? 'diff-neg' : ''
                          }`}
                        >
                          {teamSummary.gamesPlayed > 0
                            ? (teamSummary.diff > 0 ? '+' : '') + teamSummary.diff.toFixed(1)
                            : '—'}
                        </span>
                        <span className="tss-scoring-label">DIFF</span>
                      </div>
                    </div>
                  </div>

                  <div className="tss-card tss-next-game">
                    <div className="tss-card-label">
                      <Clock size={13} strokeWidth={2} />
                      <span>Next Game</span>
                    </div>
                    {teamSummary.nextGame ? (
                      (() => {
                        const g = teamSummary.nextGame!;
                        const isHome = g.home_team_id === currentTeam;
                        const opp = teamMap.get(isHome ? g.away_team_id : g.home_team_id);
                        const dateSrc = g.game_date || g.played_at;
                        return (
                          <>
                            <div className="tss-next-opp">
                              {isHome ? 'vs' : '@'} {opp?.abbreviation || 'TBD'}
                            </div>
                            <div className="tss-card-sub">
                              {dateSrc
                                ? new Date(dateSrc).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                  })
                                : 'Date TBD'}
                              {' · '}
                              {isHome ? 'Home' : 'Away'}
                            </div>
                          </>
                        );
                      })()
                    ) : (
                      <div className="tss-card-sub">Season complete</div>
                    )}
                  </div>
                </div>

                {/* ── Two-column body: game list + snapshot/insights ── */}
                <div className="team-sched-body">
                  <div className="team-sched-list-panel">
                    <div className="team-sched-list-header">
                      <h3>
                        <CalendarDays size={17} strokeWidth={2} />
                        Full Schedule
                      </h3>
                      <span className="team-sched-count">
                        {teamGames.length} games · {teamSummary.gamesRemaining} remaining
                      </span>
                    </div>

                    {teamGames.length === 0 ? (
                      <div className="team-sched-empty-state">
                        <CalendarDays size={28} strokeWidth={1.5} />
                        <p>No games found for this team.</p>
                      </div>
                    ) : (
                      <div className="team-sched-rows">
                        {teamGames.map(game => {
                          const isHome = game.home_team_id === currentTeam;
                          const opp = teamMap.get(isHome ? game.away_team_id : game.home_team_id);
                          const dateSrc = game.game_date || game.played_at;
                          const finished = game.status === 'completed' && game.home_score != null;
                          const teamScore = isHome ? game.home_score : game.away_score;
                          const oppScore = isHome ? game.away_score : game.home_score;
                          const won = finished && teamScore != null && oppScore != null && teamScore > oppScore;
                          const isSelected = teamSelectedGame?.id === game.id;

                          return (
                            <div
                              key={game.id}
                              className={`ts-row ${isSelected ? 'selected' : ''} ${finished ? (won ? 'ts-row--win' : 'ts-row--loss') : ''}`}
                              onClick={() => setTeamSelectedGame(game)}
                              role="button"
                              tabIndex={0}
                            >
                              <div className="ts-row-date">
                                <span className="ts-row-date-main">
                                  {dateSrc
                                    ? new Date(dateSrc).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                                    : 'TBD'}
                                </span>
                                <span className="ts-row-date-sub">
                                  {dateSrc ? new Date(dateSrc).toLocaleDateString(undefined, { weekday: 'short' }) : ''}
                                </span>
                              </div>

                              <div className="ts-row-loc">
                                {isHome ? (
                                  <span className="ts-loc-badge home"><Home size={11} strokeWidth={2.5} /> HOME</span>
                                ) : (
                                  <span className="ts-loc-badge away"><Plane size={11} strokeWidth={2.5} /> AWAY</span>
                                )}
                              </div>

                              <div className="ts-row-opp">
                                <span className="ts-opp-vs">{isHome ? 'vs' : '@'}</span>
                                <span className="ts-opp-name">{opp?.name || opp?.abbreviation || 'TBD'}</span>
                              </div>

                              <div className="ts-row-result">
                                {finished ? (
                                  <>
                                    <span className={`ts-result-badge ${won ? 'w' : 'l'}`}>{won ? 'W' : 'L'}</span>
                                    <span className="ts-result-score">{teamScore}–{oppScore}</span>
                                  </>
                                ) : (
                                  <span className="ts-result-pending"></span>
                                )}
                              </div>

                              <ChevronRight size={16} strokeWidth={2} className="ts-row-chevron" />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="team-sched-side-panel">
                    <GameSnapshot
                      game={teamSelectedGame}
                      homeTeam={teamSelectedGame ? (teamMap.get(teamSelectedGame.home_team_id) ?? null) : null}
                      awayTeam={teamSelectedGame ? (teamMap.get(teamSelectedGame.away_team_id) ?? null) : null}
                    />

                    {/* ── Placeholder insight boxes ── */}
                    <div className="ts-placeholder-card">
                      <div className="ts-placeholder-header">
                        <Activity size={14} strokeWidth={2} />
                        <span>Leading Scorer</span>
                      </div>
                      <div className="ts-placeholder-body">
                        <div className="ts-placeholder-line" style={{ width: '70%' }} />
                        <div className="ts-placeholder-line" style={{ width: '45%' }} />
                      </div>
                      <span className="ts-placeholder-tag">Coming soon</span>
                    </div>

                    <div className="ts-placeholder-card">
                      <div className="ts-placeholder-header">
                        <MapPin size={14} strokeWidth={2} />
                        <span>Venue &amp; Attendance</span>
                      </div>
                      <div className="ts-placeholder-body">
                        <div className="ts-placeholder-line" style={{ width: '85%' }} />
                        <div className="ts-placeholder-line" style={{ width: '55%' }} />
                      </div>
                      <span className="ts-placeholder-tag">Coming soon</span>
                    </div>

                    <div className="ts-placeholder-card">
                      <div className="ts-placeholder-header">
                        <TrendingUp size={14} strokeWidth={2} />
                        <span>Betting / Projection</span>
                      </div>
                      <div className="ts-placeholder-body">
                        <div className="ts-placeholder-line" style={{ width: '60%' }} />
                        <div className="ts-placeholder-line" style={{ width: '40%' }} />
                      </div>
                      <span className="ts-placeholder-tag">Coming soon</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ─── League Schedule ─── */}
        {activeTab === 'league-schedule' && (
          <div className="games-two-col">
            <div className="games-left">
              <div className="games-controls">
                {/* Date navigation: arrows + manual input */}
                <div className="date-navigator">
                  <button className="date-nav-btn" onClick={goToPreviousDay} title="Previous day">
                    ◀
                  </button>
                  <input
                    className="date-input manual"
                    type="text"
                    value={manualDateText}
                    onChange={handleManualDateChange}
                    onBlur={applyManualDate}
                    onKeyDown={handleManualDateKeyDown}
                    placeholder="YYYY-MM-DD"
                  />
                  <button className="date-nav-btn" onClick={goToNextDay} title="Next day">
                    ▶
                  </button>
                </div>

                <div className="view-toggle-inline">
                  <button
                    className={gamesTabViewMode === 'daily' ? 'active' : ''}
                    onClick={() => setGamesTabViewMode('daily')}
                  >
                    Day
                  </button>
                  <button
                    className={gamesTabViewMode === 'weekly' ? 'active' : ''}
                    onClick={() => setGamesTabViewMode('weekly')}
                  >
                    Week
                  </button>
                </div>
              </div>

              {gamesTabViewMode === 'daily' ? (
                <div className="daily-games-list">
                  {dailyGames.length === 0 ? (
                    <p className="no-games">No games on this date.</p>
                  ) : (
                    dailyGames.map(game => renderGameCard(
                      game,
                      leagueSelectedGame?.id === game.id,
                      () => setLeagueSelectedGame(game)
                    ))
                  )}
                </div>
              ) : (
                <GamesListView
                  schedule={schedule}
                  teams={teams}
                  currentDate={currentDate}
                  onGameSelect={setLeagueSelectedGame}
                  highlightDate={gamesTabSelectedDate}
                />
              )}
            </div>

            <div className="games-right">
              <MiniCalendar
                schedule={schedule}
                currentDate={gamesTabSelectedDate}
                onDateSelect={handleMiniCalendarSelect}
              />
              <GameSnapshot
                game={leagueSelectedGame}
                homeTeam={leagueSelectedGame ? (teamMap.get(leagueSelectedGame.home_team_id) ?? null) : null}
                awayTeam={leagueSelectedGame ? (teamMap.get(leagueSelectedGame.away_team_id) ?? null) : null}
              />
            </div>
          </div>
        )}

        {/* ─── Calendar ─── */}
        {activeTab === 'calendar' && (
          <div className="cal-wrap">
            {/* ── Summary strip (mirrors Team Schedule) ── */}
            <div className="cal-summary">
              <div className="tss-card">
                <div className="tss-card-label">
                  <CalendarRange size={13} strokeWidth={2} />
                  <span>Games This Month</span>
                </div>
                <div className="tss-record-value">{calendarMonthSummary.totalGames}</div>
                <div className="tss-card-sub">
                  {calendarMonthSummary.daysWithGames} active day
                  {calendarMonthSummary.daysWithGames === 1 ? '' : 's'}
                </div>
              </div>

              <div className="tss-card">
                <div className="tss-card-label">
                  <Trophy size={13} strokeWidth={2} />
                  <span>Completed</span>
                </div>
                <div className="tss-record-value">{calendarMonthSummary.completedGames}</div>
                <div className="tss-card-sub">
                  {calendarMonthSummary.totalGames - calendarMonthSummary.completedGames} remaining
                </div>
              </div>

              <div className="tss-card tss-next-game">
                <div className="tss-card-label">
                  <Home size={13} strokeWidth={2} />
                  <span>Your Team</span>
                </div>
                <div className="tss-record-value">{calendarMonthSummary.userGames}</div>
                <div className="tss-card-sub">games on the schedule</div>
              </div>
            </div>

            {/* ── Calendar card ── */}
            <div className="cal-card">
              <div className="cal-nav">
                <button
                  className="cal-nav-btn"
                  onClick={() => setCalendarMonth(new Date(calendarYear, calendarMonthIndex - 1, 1))}
                  title="Previous month"
                >
                  ◀
                </button>
                <span className="cal-month-label">
                  {calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </span>
                <button
                  className="cal-nav-btn"
                  onClick={() => setCalendarMonth(new Date(calendarYear, calendarMonthIndex + 1, 1))}
                  title="Next month"
                >
                  ▶
                </button>
              </div>

              <div className="cal-grid">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="cal-day-header">{day}</div>
                ))}
                {calendarDays.map((day, idx) => {
                  const key = day !== null ? getDateString(day) : null;
                  const games = key ? (gamesByDate.get(key) || []) : [];
                  const count = games.length;
                  const isUserDay = currentTeam
                    ? games.some(g => g.home_team_id === currentTeam || g.away_team_id === currentTeam)
                    : false;
                  const today = currentDate ? new Date(currentDate) : new Date();
                  const isToday =
                    day !== null &&
                    calendarYear === today.getFullYear() &&
                    calendarMonthIndex === today.getMonth() &&
                    day === today.getDate();

                  return (
                    <div
                      key={idx}
                      className={`cal-day ${day === null ? 'empty' : ''} ${count > 0 ? 'has-games' : ''} ${isUserDay ? 'user-day' : ''} ${isToday ? 'is-today' : ''}`}
                      onClick={() => handleCalendarDayClick(day)}
                      role={day !== null ? 'button' : undefined}
                      tabIndex={day !== null ? 0 : undefined}
                    >
                      {day && (
                        <>
                          <div className="cal-day-top">
                            <span className="cal-day-number">{day}</span>
                            {isToday && <span className="cal-today-pill">Today</span>}
                          </div>

                          {count > 0 && (
                            <div className="cal-day-games">
                              {games.slice(0, 2).map(g => {
                                const home = teamMap.get(g.home_team_id);
                                const away = teamMap.get(g.away_team_id);
                                const involvesUser =
                                  currentTeam &&
                                  (g.home_team_id === currentTeam || g.away_team_id === currentTeam);
                                return (
                                  <div
                                    key={g.id}
                                    className={`cal-game-chip ${involvesUser ? 'chip-user' : ''} ${g.status === 'completed' ? 'chip-final' : ''}`}
                                  >
                                    <span className="chip-teams">
                                      {away?.abbreviation || '???'}
                                      <span className="chip-at">@</span>
                                      {home?.abbreviation || '???'}
                                    </span>
                                    {g.status === 'completed' && g.home_score != null && (
                                      <span className="chip-score">
                                        {g.away_score}-{g.home_score}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                              {count > 2 && (
                                <span className="cal-day-more">
                                  <CircleDot size={9} strokeWidth={3} />
                                  +{count - 2} more
                                </span>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ── Legend ── */}
              <div className="cal-legend">
                <span className="cal-legend-item">
                  <span className="cal-legend-swatch swatch-user" /> Your team
                </span>
                <span className="cal-legend-item">
                  <span className="cal-legend-swatch swatch-final" /> Final
                </span>
                <span className="cal-legend-item">
                  <span className="cal-legend-swatch swatch-scheduled" /> Scheduled
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <DayGamesModal
        date={calendarModalDate}
        games={
          calendarModalDate
            ? gamesByDate.get(calendarModalDate.toISOString().split('T')[0]) || []
            : []
        }
        teams={teams}
        onClose={closeCalendarModal}
      />
    </div>
  );
};

export default ScheduleTab;