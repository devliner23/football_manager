import React, { useState, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { GameResult } from '../../../api/leagueApi';
import IndividualGameView from '../components/IndividualGameView';
import GamesListView from './tabComponents/GamesListView';
import MiniCalendar from './tabComponents/MiniCalendar';
import GameSnapshot from './tabComponents/GameSnapshot';
import './styles/ScheduleTab.css';

interface ScheduleTabProps {
  schedule: Record<number, GameResult[]>;
  teams: { id: string; name: string; abbreviation: string }[];
  currentDate: string | null;
  currentTeam: string | null;   // managed team ID
}

type Tab = 'team-schedule' | 'league-schedule' | 'calendar';

// ── Per-team record derived from completed games ────────────────────────────
interface TeamRecord {
  wins: number;
  losses: number;
  streak: number;
  streakType: 'W' | 'L' | null;
  last5: ('W' | 'L')[];
  pointsFor: number;
  pointsAgainst: number;
  gamesPlayed: number;
}

const ScheduleTab: React.FC<ScheduleTabProps> = ({ schedule, teams, currentDate, currentTeam }) => {
  const [activeTab, setActiveTab] = useState<Tab>('team-schedule');

  // ── Modal for calendar tab ──
  const [calendarModalDate, setCalendarModalDate] = useState<Date | null>(null);
  const [calendarModalGame, setCalendarModalGame] = useState<GameResult | null>(null);

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

  // ── Flat, date-sorted list of every game in the schedule ──
  const allGamesSorted = useMemo(() => {
    const flat: GameResult[] = [];
    Object.values(schedule).forEach(weekGames => flat.push(...weekGames));
    flat.sort(
      (a, b) => new Date(a.game_date || a.played_at || 0).getTime() - new Date(b.game_date || b.played_at || 0).getTime()
    );
    return flat;
  }, [schedule]);

  // ── Season-wide snapshot (progress, scoring, counts) ──
  const seasonSummary = useMemo(() => {
    let total = 0;
    let completed = 0;
    let totalPoints = 0;
    let highestCombined = 0;
    let highestCombinedGame: GameResult | null = null;

    allGamesSorted.forEach(game => {
      total++;
      if (game.status === 'completed' && game.home_score != null && game.away_score != null) {
        completed++;
        const combined = game.home_score + game.away_score;
        totalPoints += combined;
        if (combined > highestCombined) {
          highestCombined = combined;
          highestCombinedGame = game;
        }
      }
    });

    const upcoming = total - completed;
    const pctComplete = total > 0 ? (completed / total) * 100 : 0;
    const avgCombinedPoints = completed > 0 ? totalPoints / completed : 0;

    return { total, completed, upcoming, pctComplete, avgCombinedPoints, highestCombinedGame, highestCombined };
  }, [allGamesSorted]);

  // ── Win/loss records + streaks for every team, derived from completed games ──
  const teamRecords = useMemo(() => {
    const records: Record<string, TeamRecord> = {};
    const ensure = (id: string) => {
      if (!records[id]) {
        records[id] = { wins: 0, losses: 0, streak: 0, streakType: null, last5: [], pointsFor: 0, pointsAgainst: 0, gamesPlayed: 0 };
      }
      return records[id];
    };

    allGamesSorted.forEach(game => {
      if (game.status !== 'completed' || game.home_score == null || game.away_score == null) return;
      const homeWon = game.home_score > game.away_score;

      [
        { id: game.home_team_id, won: homeWon, pf: game.home_score, pa: game.away_score },
        { id: game.away_team_id, won: !homeWon, pf: game.away_score, pa: game.home_score },
      ].forEach(({ id, won, pf, pa }) => {
        const r = ensure(id);
        r.gamesPlayed++;
        r.pointsFor += pf;
        r.pointsAgainst += pa;
        won ? r.wins++ : r.losses++;

        const resultChar: 'W' | 'L' = won ? 'W' : 'L';
        r.last5.push(resultChar);
        if (r.last5.length > 5) r.last5.shift();

        if (r.streakType === resultChar) r.streak++;
        else { r.streakType = resultChar; r.streak = 1; }
      });
    });

    return records;
  }, [allGamesSorted]);

  // ── Games grouped by date (YYYY‑MM‑DD) ──
  const gamesByDate = useMemo(() => {
    const map = new Map<string, GameResult[]>();
    allGamesSorted.forEach(game => {
      const dateSource = game.game_date || game.played_at;
      if (!dateSource) return;
      const date = new Date(dateSource).toISOString().split('T')[0];
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(game);
    });
    return map;
  }, [allGamesSorted]);

  // ── All games for the managed team (sorted by date) ──
  const teamGames = useMemo(() => {
    if (!currentTeam) return [];
    return allGamesSorted.filter(
      game => game.home_team_id === currentTeam || game.away_team_id === currentTeam
    );
  }, [allGamesSorted, currentTeam]);

  const userRecord = currentTeam ? teamRecords[currentTeam] : undefined;
  const nextTeamGame = useMemo(
    () => teamGames.find(g => g.status !== 'completed') || null,
    [teamGames]
  );
  const lastTeamGame = useMemo(
    () => [...teamGames].reverse().find(g => g.status === 'completed') || null,
    [teamGames]
  );

  // ── Days on the calendar / league-schedule dates that involve the user's team ──
  const userGameDates = useMemo(() => {
    const set = new Set<string>();
    teamGames.forEach(game => {
      const dateSource = game.game_date || game.played_at;
      if (!dateSource) return;
      set.add(new Date(dateSource).toISOString().split('T')[0]);
    });
    return set;
  }, [teamGames]);

  // ── Daily games for the league‑schedule date ──
  const dailyGames = useMemo(() => {
    const key = gamesTabSelectedDate.toISOString().split('T')[0];
    return gamesByDate.get(key) || [];
  }, [gamesTabSelectedDate, gamesByDate]);

  // ── Snapshot stats for the currently viewed league-schedule day ──
  const dailySnapshot = useMemo(() => {
    const completedToday = dailyGames.filter(g => g.status === 'completed' && g.home_score != null);
    const totalPoints = completedToday.reduce((sum, g) => sum + (g.home_score || 0) + (g.away_score || 0), 0);
    const avgPoints = completedToday.length > 0 ? totalPoints / completedToday.length : 0;
    const featured =
      dailyGames.find(g => g.home_team_id === currentTeam || g.away_team_id === currentTeam) || null;
    return { total: dailyGames.length, completed: completedToday.length, avgPoints, featured };
  }, [dailyGames, currentTeam]);

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

  const gameCountForDay = (day: number | null): number => {
    if (day === null) return 0;
    const key = getDateString(day);
    return gamesByDate.get(key)?.length || 0;
  };

  const isUserGameDay = (day: number | null): boolean => {
    if (day === null) return false;
    return userGameDates.has(getDateString(day));
  };

  const handleCalendarDayClick = (day: number | null) => {
    if (day === null) return;
    const date = new Date(calendarYear, calendarMonthIndex, day);
    setCalendarModalDate(date);
    setCalendarModalGame(null);
  };

  const handleCalendarGameSelect = (game: GameResult) => {
    setCalendarModalGame(game);
    setCalendarModalDate(null);
  };

  const closeCalendarModal = () => {
    setCalendarModalDate(null);
    setCalendarModalGame(null);
  };

  // ── Mini calendar date select for League Schedule ──
  const handleMiniCalendarSelect = (date: Date) => {
    setGamesTabSelectedDate(date);
    setManualDateText(date.toISOString().split('T')[0]);
    setLeagueSelectedGame(null);
  };

  // ── Small helpers ──
  const formatShortDate = (game: GameResult | null) => {
    if (!game) return null;
    const src = game.game_date || game.played_at;
    if (!src) return null;
    return new Date(src).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const opponentFor = (game: GameResult, teamId: string | null) => {
    if (!teamId) return null;
    const oppId = game.home_team_id === teamId ? game.away_team_id : game.home_team_id;
    return teamMap.get(oppId) || null;
  };

  const isHomeGame = (game: GameResult, teamId: string | null) => teamId != null && game.home_team_id === teamId;

  // ── Render helpers ──
  const renderGameCard = (game: GameResult, isSelected: boolean, onClick: () => void) => {
    const home = teamMap.get(game.home_team_id);
    const away = teamMap.get(game.away_team_id);
    const finished = game.status === 'completed' && game.home_score != null && game.away_score != null;
    const homeWon = finished && game.home_score! > game.away_score!;
    const involvesUser = currentTeam != null && (game.home_team_id === currentTeam || game.away_team_id === currentTeam);

    return (
      <div
        key={game.id}
        className={`game-card-sidebar ${isSelected ? 'selected' : ''} ${finished ? (homeWon ? 'result-home-win' : 'result-away-win') : ''} ${involvesUser ? 'involves-user' : ''}`}
        onClick={onClick}
        role="button"
        tabIndex={0}
      >
        <div className="game-card-content">
          <div className="game-teams">
            <span className={`team home ${finished && homeWon ? 'winner-team' : ''}`}>
              {home?.abbreviation || 'TBD'}
              {teamRecords[game.home_team_id] && (
                <span className="team-inline-record">
                  {teamRecords[game.home_team_id].wins}-{teamRecords[game.home_team_id].losses}
                </span>
              )}
            </span>
            <span className="vs">vs</span>
            <span className={`team away ${finished && !homeWon ? 'winner-team' : ''}`}>
              {away?.abbreviation || 'TBD'}
              {teamRecords[game.away_team_id] && (
                <span className="team-inline-record">
                  {teamRecords[game.away_team_id].wins}-{teamRecords[game.away_team_id].losses}
                </span>
              )}
            </span>
          </div>
          <div className="game-score">
            {finished ? `${game.home_score} - ${game.away_score}` : '—'}
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
          <>
            {!currentTeam && (
              <div className="games-left">
                <p className="no-games">No team selected.</p>
              </div>
            )}

            {currentTeam && (
              <div className="team-hero-row">
                <div className="hero-card hero-record-card">
                  <span className="hero-card-label">Record</span>
                  <span className="hero-card-value">
                    {userRecord ? `${userRecord.wins}-${userRecord.losses}` : '0-0'}
                  </span>
                  <span className="hero-card-sub">
                    {userRecord && userRecord.gamesPlayed > 0
                      ? `${((userRecord.wins / userRecord.gamesPlayed) * 100).toFixed(1)}% win rate`
                      : 'No games played yet'}
                  </span>
                  {userRecord && userRecord.streakType && (
                    <span className={`streak-badge streak-${userRecord.streakType === 'W' ? 'win' : 'loss'}`}>
                      {userRecord.streakType}{userRecord.streak} streak
                    </span>
                  )}
                  {userRecord && userRecord.last5.length > 0 && (
                    <div className="last5-row">
                      {userRecord.last5.map((r, i) => (
                        <span key={i} className={`last5-pip ${r === 'W' ? 'pip-win' : 'pip-loss'}`}>{r}</span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="hero-card hero-next-card">
                  <span className="hero-card-label">Next Game</span>
                  {nextTeamGame ? (
                    <>
                      <span className="hero-card-value hero-card-value--matchup">
                        {isHomeGame(nextTeamGame, currentTeam) ? 'vs' : '@'}{' '}
                        {opponentFor(nextTeamGame, currentTeam)?.abbreviation || 'TBD'}
                      </span>
                      <span className="hero-card-sub">{formatShortDate(nextTeamGame) || 'Date TBD'}</span>
                      <span className="hero-card-tag">{isHomeGame(nextTeamGame, currentTeam) ? 'Home' : 'Away'}</span>
                    </>
                  ) : (
                    <span className="hero-card-sub">No games remaining</span>
                  )}
                </div>

                <div className="hero-card hero-last-card">
                  <span className="hero-card-label">Last Result</span>
                  {lastTeamGame ? (
                    <>
                      <span
                        className={`hero-card-value hero-card-value--matchup ${
                          (isHomeGame(lastTeamGame, currentTeam)
                            ? (lastTeamGame.home_score || 0) > (lastTeamGame.away_score || 0)
                            : (lastTeamGame.away_score || 0) > (lastTeamGame.home_score || 0))
                            ? 'text-win'
                            : 'text-loss'
                        }`}
                      >
                        {isHomeGame(lastTeamGame, currentTeam)
                          ? (lastTeamGame.home_score || 0) > (lastTeamGame.away_score || 0) ? 'W' : 'L'
                          : (lastTeamGame.away_score || 0) > (lastTeamGame.home_score || 0) ? 'W' : 'L'}{' '}
                        {isHomeGame(lastTeamGame, currentTeam) ? 'vs' : '@'}{' '}
                        {opponentFor(lastTeamGame, currentTeam)?.abbreviation || 'TBD'}
                      </span>
                      <span className="hero-card-sub">
                        {lastTeamGame.home_score} - {lastTeamGame.away_score} · {formatShortDate(lastTeamGame)}
                      </span>
                    </>
                  ) : (
                    <span className="hero-card-sub">No games completed yet</span>
                  )}
                </div>
              </div>
            )}

            {currentTeam && (
              <div className="games-two-col">
                <div className="games-left">
                  <div className="team-schedule-header">
                    <h3>Full Schedule</h3>
                    <span className="section-count-badge">{teamGames.length} games</span>
                  </div>
                  {teamGames.length === 0 && (
                    <p className="no-games">No games found for this team.</p>
                  )}
                  {teamGames.length > 0 && (
                    <div className="daily-games-list">
                      {teamGames.map(game => renderGameCard(
                        game,
                        teamSelectedGame?.id === game.id,
                        () => setTeamSelectedGame(game)
                      ))}
                    </div>
                  )}
                </div>
                <div className="games-right">
                  <GameSnapshot
                    game={teamSelectedGame}
                    homeTeam={teamSelectedGame ? (teamMap.get(teamSelectedGame.home_team_id) ?? null) : null}
                    awayTeam={teamSelectedGame ? (teamMap.get(teamSelectedGame.away_team_id) ?? null) : null}
                  />
                </div>
              </div>
            )}
          </>
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

              {gamesTabViewMode === 'daily' && (
                <div className="day-snapshot-bar">
                  <div className="day-snapshot-stat">
                    <span className="day-snapshot-value">{dailySnapshot.total}</span>
                    <span className="day-snapshot-label">Games</span>
                  </div>
                  <div className="day-snapshot-stat">
                    <span className="day-snapshot-value">{dailySnapshot.completed}</span>
                    <span className="day-snapshot-label">Completed</span>
                  </div>
                  <div className="day-snapshot-stat">
                    <span className="day-snapshot-value">
                      {dailySnapshot.avgPoints > 0 ? dailySnapshot.avgPoints.toFixed(1) : '—'}
                    </span>
                    <span className="day-snapshot-label">Avg Total</span>
                  </div>
                  {dailySnapshot.featured && (
                    <div className="day-snapshot-featured">
                      <span className="day-snapshot-label">Your Team Plays</span>
                      <span className="day-snapshot-value day-snapshot-value--small">
                        {teamMap.get(dailySnapshot.featured.home_team_id)?.abbreviation || 'TBD'} vs{' '}
                        {teamMap.get(dailySnapshot.featured.away_team_id)?.abbreviation || 'TBD'}
                      </span>
                    </div>
                  )}
                </div>
              )}

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
          <div className="calendar-full-view">
            <div className="calendar-nav">
              <button onClick={() => setCalendarMonth(new Date(calendarYear, calendarMonthIndex - 1, 1))}>
                ◀
              </button>
              <span className="calendar-month-label">
                {calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
              </span>
              <button onClick={() => setCalendarMonth(new Date(calendarYear, calendarMonthIndex + 1, 1))}>
                ▶
              </button>
            </div>
            <div className="calendar-legend">
              <span className="legend-item"><span className="legend-dot dot-games" /> Games scheduled</span>
              <span className="legend-item"><span className="legend-dot dot-user" /> Your team plays</span>
            </div>
            <div className="calendar-grid">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="calendar-day-header">{day}</div>
              ))}
              {calendarDays.map((day, idx) => {
                const count = gameCountForDay(day);
                const userDay = isUserGameDay(day);
                return (
                  <div
                    key={idx}
                    className={`calendar-day ${day === null ? 'empty' : ''} ${count > 0 ? 'has-games' : ''} ${userDay ? 'user-game-day' : ''}`}
                    onClick={() => handleCalendarDayClick(day)}
                  >
                    {day && (
                      <>
                        <span className="day-number">{day}</span>
                        {count > 0 && <span className="day-dot">{count}</span>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Calendar modal (works for both calendar tab and future uses) ── */}
      {(calendarModalDate || calendarModalGame) && (
        ReactDOM.createPortal(
          <div className="modal-backdrop" onClick={closeCalendarModal}>
            <div className="day-modal" onClick={e => e.stopPropagation()}>
              {calendarModalDate ? (
                <>
                  <div className="modal-header">
                    <h3 className="modal-title">
                      {calendarModalDate.toLocaleDateString(undefined, {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </h3>
                    <button className="modal-close" onClick={closeCalendarModal}>✕</button>
                  </div>
                  <div className="modal-games-list">
                    {(() => {
                      const dateKey = calendarModalDate.toISOString().split('T')[0];
                      const gamesOnDate = gamesByDate.get(dateKey) || [];
                      return gamesOnDate.map(game => {
                        const home = teamMap.get(game.home_team_id);
                        const away = teamMap.get(game.away_team_id);
                        return (
                          <div
                            key={game.id}
                            className="modal-game-row clickable"
                            onClick={() => handleCalendarGameSelect(game)}
                            role="button"
                            tabIndex={0}
                          >
                            <div className="modal-game-teams">
                              <div className="modal-team home">
                                <span className="team-abbr-full">{home?.abbreviation || 'TBD'}</span>
                                <span className="team-name">{home?.name || ''}</span>
                              </div>
                              <div className="modal-vs">VS</div>
                              <div className="modal-team away">
                                <span className="team-abbr-full">{away?.abbreviation || 'TBD'}</span>
                                <span className="team-name">{away?.name || ''}</span>
                              </div>
                            </div>
                            <div className="modal-game-info">
                              <div className="modal-score-big">
                                {game.status === 'completed' && game.home_score != null
                                  ? `${game.home_score} - ${game.away_score}`
                                  : '—'}
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </>
              ) : calendarModalGame && teamMap.get(calendarModalGame.home_team_id) && teamMap.get(calendarModalGame.away_team_id) ? (
                <IndividualGameView
                  game={calendarModalGame}
                  homeTeam={teamMap.get(calendarModalGame.home_team_id)!}
                  awayTeam={teamMap.get(calendarModalGame.away_team_id)!}
                  onClose={closeCalendarModal}
                />
              ) : null}
            </div>
          </div>,
          document.getElementById('modal-root') || document.body
        )
      )}
    </div>
  );
};

export default ScheduleTab;