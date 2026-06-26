import React, { useState, useMemo, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { GameResult } from '../../../api/leagueApi';
import IndividualGameView from '../components/IndividualGameView';
import './styles/ScheduleTab.css';

interface ScheduleTabProps {
  schedule: Record<number, GameResult[]>;
  teams: { id: string; name: string; abbreviation: string }[];
  currentDate: string | null; // e.g., '2026-07-01T00:00:00+00:00'
}

type ViewMode = 'calendar' | 'list';

const ScheduleTab: React.FC<ScheduleTabProps> = ({ schedule, teams, currentDate }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedGame, setSelectedGame] = useState<GameResult | null>(null);

  const teamMap = useMemo(() => {
    const map = new Map(teams.map(t => [t.id, t]));
    return map;
  }, [teams]);

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

  const hasCompletedGames = (date: Date | null): boolean => {
    if (!date) return false;
    const key = date.toISOString().split('T')[0];
    const games = gamesByDate.get(key) || [];
    return games.some(game => game.status === 'completed');
  };

  const [seasonStart, seasonEnd] = useMemo(() => {
    const dates = Array.from(gamesByDate.keys()).sort();
    if (dates.length === 0) return [null, null];
    return [dates[0], dates[dates.length - 1]];
  }, [gamesByDate]);

  const months = useMemo(() => {
    if (!seasonStart || !seasonEnd) return [];
    const start = new Date(seasonStart + 'T00:00:00');
    const end = new Date(seasonEnd + 'T00:00:00');
    const monthsArray: { name: string; weeks: Date[][] }[] = [];
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    while (current <= end) {
      const monthName = current.toLocaleString('default', { month: 'long', year: 'numeric' });
      const firstDay = new Date(current);
      const lastDay = new Date(current.getFullYear(), current.getMonth() + 1, 0);
      const weeks: Date[][] = [];
      let week: Date[] = [];
      const startDayOfWeek = firstDay.getDay();
      for (let i = 0; i < startDayOfWeek; i++) week.push(null!);
      for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
        if (week.length === 7) { weeks.push(week); week = []; }
        week.push(new Date(d));
      }
      while (week.length < 7) week.push(null!);
      if (week.length > 0) weeks.push(week);
      monthsArray.push({ name: monthName, weeks });
      current.setMonth(current.getMonth() + 1);
    }
    return monthsArray;
  }, [seasonStart, seasonEnd]);

  const getGamesForDate = (date: Date | null) => {
    if (!date) return [];
    const key = date.toISOString().split('T')[0];
    return gamesByDate.get(key) || [];
  };

  const selectedDateGames = useMemo(() => {
    return selectedDate ? getGamesForDate(selectedDate) : [];
  }, [selectedDate, gamesByDate]);

  const weeks = useMemo(() => {
    return Object.keys(schedule)
      .map(Number)
      .sort((a, b) => a - b)
      .map(week => {
        const weekGames = schedule[week];
        const byDate = new Map<string, GameResult[]>();
        weekGames.forEach(game => {
          const dateSource = game.game_date || game.played_at;
          const dateKey = dateSource
            ? new Date(dateSource).toISOString().split('T')[0]
            : 'TBD';
          if (!byDate.has(dateKey)) byDate.set(dateKey, []);
          byDate.get(dateKey)!.push(game);
        });
        const days = Array.from(byDate.entries()).map(([date, games]) => ({ date, games }));
        days.sort((a, b) => a.date.localeCompare(b.date));
        return { week, days };
      });
  }, [schedule]);

  const getWeekForDate = (dateStr: string): number | null => {
    for (const [weekNum, games] of Object.entries(schedule)) {
      for (const game of games) {
        const ds = game.game_date || game.played_at;
        if (ds) {
          const d = new Date(ds).toISOString().split('T')[0];
          if (d === dateStr) return Number(weekNum);
        }
      }
    }
    return null;
  };

  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(
    () => new Set(weeks.map(w => w.week))
  );

  const currentDateObj = useMemo(() => {
    if (currentDate) {
      const d = new Date(currentDate);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  }, [currentDate]);

  useEffect(() => {
    if (currentDate) {
      const parsed = new Date(currentDate);
      if (!isNaN(parsed.getTime())) {
        const dateStr = parsed.toISOString().split('T')[0];
        const dateObj = new Date(dateStr + 'T00:00:00');
        setSelectedDate(dateObj);

        const weekNumber = getWeekForDate(dateStr);
        if (weekNumber !== null) {
          setExpandedWeeks(prev => {
            if (prev.has(weekNumber)) return prev;
            const next = new Set(prev);
            next.add(weekNumber);
            return next;
          });
        }
      }
    }
  }, [currentDate, schedule]);

  useEffect(() => {
    if (viewMode === 'list' && currentDate) {
      const parsed = new Date(currentDate);
      if (!isNaN(parsed.getTime())) {
        const dateStr = parsed.toISOString().split('T')[0];
        const timer = setTimeout(() => {
          const target = document.querySelector(`[data-date="${dateStr}"]`);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 150);
        return () => clearTimeout(timer);
      }
    }
  }, [viewMode, currentDate, expandedWeeks]);

  useEffect(() => {
    if (viewMode === 'calendar' && currentDate && months.length > 0) {
      const targetDate = currentDateObj;
      const monthIndex = months.findIndex(month =>
        month.weeks.some(week =>
          week.some(day => day && day.toDateString() === targetDate.toDateString())
        )
      );
      if (monthIndex !== -1) {
        const monthEl = document.getElementById(`month-${monthIndex}`);
        if (monthEl) {
          monthEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }
  }, [viewMode, currentDate, months, currentDateObj]);

  const toggleWeek = (week: number) => {
    setExpandedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(week)) next.delete(week);
      else next.add(week);
      return next;
    });
  };

  const openGameModal = (game: GameResult) => {
    setSelectedDate(null);
    setSelectedGame(game);
  };

  const isGameFinished = (game: GameResult): boolean => {
    return game.status === 'completed';
  };

  if (!seasonStart) {
    return (
      <div className="schedule-tab">
        <h2>League Schedule</h2>
        <p>No games scheduled yet.</p>
      </div>
    );
  }

  const selectedGameTeams = selectedGame
    ? {
        home: teamMap.get(selectedGame.home_team_id),
        away: teamMap.get(selectedGame.away_team_id),
      }
    : null;

  // ---------- Portal modal for day details or game details ----------
  const showModal = selectedDate || (selectedGame && selectedGameTeams?.home && selectedGameTeams?.away);

  return (
    <div className="schedule-tab">
      {/* ----- View toggle ----- */}
      <div className="schedule-header">
        <h2>League Schedule</h2>
        <div className="view-toggle">
          <button
            className={viewMode === 'calendar' ? 'active' : ''}
            onClick={() => setViewMode('calendar')}
          >
            📅 Calendar
          </button>
          <button
            className={viewMode === 'list' ? 'active' : ''}
            onClick={() => setViewMode('list')}
          >
            📋 List
          </button>
        </div>
      </div>

      {/* ----- Calendar View ----- */}
      {viewMode === 'calendar' && (
        <div className="calendar-container">
          {months.map((month, idx) => (
            <div key={idx} id={`month-${idx}`} className="calendar-month">
              <h3 className="month-name">{month.name}</h3>
              <div className="weekday-header">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                  <div key={d} className="weekday">{d}</div>
                ))}
              </div>
              {month.weeks.map((week, wi) => (
                <div key={wi} className="calendar-week">
                  {week.map((day, di) => {
                    const games = getGamesForDate(day);
                    const isToday = day && currentDateObj
                      ? day.toDateString() === currentDateObj.toDateString()
                      : false;
                    const hasCompleted = hasCompletedGames(day);
                    return (
                      <div
                        key={di}
                        className={`
                          calendar-day 
                          ${day ? '' : 'empty'} 
                          ${games.length > 0 ? 'has-games' : ''} 
                          ${isToday ? 'today' : ''}
                          ${hasCompleted ? 'has-completed' : ''}
                        `}
                        onClick={day && games.length > 0 ? () => setSelectedDate(day) : undefined}
                      >
                        {day && (
                          <>
                            <span className="day-number">{day.getDate()}</span>
                            {games.length > 0 && (
                              <span className="games-badge">{games.length} {games.length === 1 ? 'game' : 'games'}</span>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ----- List View ----- */}
      {viewMode === 'list' && (
        <div className="list-weeks-container">
          {weeks.map(({ week, days }) => {
            const isExpanded = expandedWeeks.has(week);
            return (
              <div key={week} className="week-group">
                <div
                  className="week-header"
                  onClick={() => toggleWeek(week)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                >
                  <span className="week-title">Week {week}</span>
                  <span className="week-toggle-icon">{isExpanded ? '▾' : '▸'}</span>
                </div>
                {isExpanded && (
                  <div className="week-games-container">
                    {days.map(({ date, games }) => {
                      const isCurrentDay = date !== 'TBD' && currentDateObj
                        ? new Date(date).toDateString() === currentDateObj.toDateString()
                        : false;
                      const hasCompleted = games.some(g => g.status === 'completed');
                      return (
                        <div
                          key={date}
                          data-date={date}
                          className={`day-box ${isCurrentDay ? 'current-date' : ''} ${hasCompleted ? 'has-completed' : ''}`}
                        >
                          <div className="day-box-header">
                            {date === 'TBD' ? 'Date TBD' : new Date(date).toLocaleDateString(undefined, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </div>
                          <div className="day-box-content">
                            {games.map(game => {
                              const home = teamMap.get(game.home_team_id);
                              const away = teamMap.get(game.away_team_id);
                              return (
                                <div
                                  key={game.id}
                                  className="day-game-row"
                                  onClick={() => openGameModal(game)}
                                  role="button"
                                  tabIndex={0}
                                >
                                  <div className="day-game-teams">
                                    <span className="team-abbr-list home">{home?.abbreviation || 'TBD'}</span>
                                    <span className="vs">vs</span>
                                    <span className="team-abbr-list away">{away?.abbreviation || 'TBD'}</span>
                                  </div>
                                  <div className="day-game-score">
                                    {isGameFinished(game) && game.home_score != null
                                      ? `${game.home_score} - ${game.away_score}`
                                      : '—'}
                                  </div>
                                  <span className={`day-game-status status-${game.status}`}>
                                    {game.status}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ----- Modal (portal) ----- */}
      {showModal &&
        ReactDOM.createPortal(
          <div className="modal-backdrop" onClick={() => {
            setSelectedDate(null);
            setSelectedGame(null);
          }}>
            <div className="day-modal" onClick={e => e.stopPropagation()}>
              {selectedDate ? (
                <>
                  <div className="modal-header">
                    <h3 className="modal-title">
                      {selectedDate.toLocaleDateString(undefined, {
                        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                      })}
                    </h3>
                    <button className="modal-close" onClick={() => setSelectedDate(null)}>✕</button>
                  </div>
                  <div className="modal-games-list">
                    {selectedDateGames.length === 0 ? (
                      <p className="no-games">No games scheduled.</p>
                    ) : (
                      selectedDateGames.map(game => {
                        const home = teamMap.get(game.home_team_id);
                        const away = teamMap.get(game.away_team_id);
                        return (
                          <div
                            key={game.id}
                            className="modal-game-row clickable"
                            onClick={() => openGameModal(game)}
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
                                {isGameFinished(game) && game.home_score != null
                                  ? `${game.home_score} - ${game.away_score}`
                                  : '—'}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              ) : selectedGame && selectedGameTeams?.home && selectedGameTeams?.away ? (
                <IndividualGameView
                  game={selectedGame}
                  homeTeam={selectedGameTeams.home}
                  awayTeam={selectedGameTeams.away}
                  onClose={() => setSelectedGame(null)}
                />
              ) : null}
            </div>
          </div>,
          document.getElementById('modal-root') || document.body
        )
      }
    </div>
  );
};

export default ScheduleTab;