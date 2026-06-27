import React, { useState, useMemo, useEffect } from 'react';
import { GameResult } from '../../../../shared';

interface GamesListViewProps {
  schedule: Record<number, GameResult[]>;
  teams: { id: string; name: string; abbreviation: string }[];
  currentDate: string | null;
  onGameSelect: (game: GameResult) => void;
  highlightDate?: Date; // optional: used to auto‑expand week
}

const GamesListView: React.FC<GamesListViewProps> = ({
  schedule,
  teams,
  currentDate,
  onGameSelect,
  highlightDate
}) => {
  const teamMap = useMemo(() => {
    const map = new Map(teams.map(t => [t.id, t]));
    return map;
  }, [teams]);

  useEffect(() => {
    if (highlightDate) {
        const dateStr = highlightDate.toISOString().split('T')[0];
        const weekNum = getWeekForDate(dateStr);
        if (weekNum !== null) {
        setExpandedWeeks(prev => {
            if (prev.has(weekNum)) return prev;
            const next = new Set(prev);
            next.add(weekNum);
            return next;
        });
        }
    }
  }, [highlightDate, schedule]);

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
    if (currentDate) {
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
  }, [currentDate, expandedWeeks]);

  const toggleWeek = (week: number) => {
    setExpandedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(week)) next.delete(week);
      else next.add(week);
      return next;
    });
  };

  const isGameFinished = (game: GameResult): boolean => game.status === 'completed';

  if (weeks.length === 0) {
    return <p>No games scheduled yet.</p>;
  }

  return (
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
                  const isCurrentDay =
                    date !== 'TBD' && currentDateObj
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
                        {date === 'TBD'
                          ? 'Date TBD'
                          : new Date(date).toLocaleDateString(undefined, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
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
                              onClick={() => onGameSelect(game)}
                              role="button"
                              tabIndex={0}
                            >
                              <div className="day-game-teams">
                                <span className="team-abbr-list home">
                                  {home?.abbreviation || 'TBD'}
                                </span>
                                <span className="vs">vs</span>
                                <span className="team-abbr-list away">
                                  {away?.abbreviation || 'TBD'}
                                </span>
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
  );
};

export default GamesListView;