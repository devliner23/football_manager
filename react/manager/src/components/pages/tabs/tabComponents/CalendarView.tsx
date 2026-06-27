import React, { useMemo, useEffect } from 'react';
import { GameResult } from '../../../../shared';

interface CalendarViewProps {
  schedule: Record<number, GameResult[]>;
  teams: { id: string; name: string; abbreviation: string }[];
  currentDate: string | null;
  onDateSelect: (date: Date) => void;
  onGameSelect: (game: GameResult) => void;
}

const CalendarView: React.FC<CalendarViewProps> = ({
  schedule,
  currentDate,
  onDateSelect,
}) => {
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
        if (week.length === 7) {
          weeks.push(week);
          week = [];
        }
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

  const hasCompletedGames = (date: Date | null): boolean => {
    if (!date) return false;
    const games = getGamesForDate(date);
    return games.some(game => game.status === 'completed');
  };

  const currentDateObj = useMemo(() => {
    if (currentDate) {
      const d = new Date(currentDate);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  }, [currentDate]);

  useEffect(() => {
    // Auto-scroll to current month when calendar mounts
    if (currentDate && months.length > 0) {
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
  }, [currentDate, months, currentDateObj]);

  if (!seasonStart) {
    return <p>No games scheduled yet.</p>;
  }

  return (
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
                const isToday =
                  day &&
                  currentDateObj &&
                  day.toDateString() === currentDateObj.toDateString();
                const hasCompleted = hasCompletedGames(day);
                return (
                  <div
                    key={di}
                    className={`calendar-day 
                      ${day ? '' : 'empty'} 
                      ${games.length > 0 ? 'has-games' : ''} 
                      ${isToday ? 'today' : ''}
                      ${hasCompleted ? 'has-completed' : ''}`}
                    onClick={day && games.length > 0 ? () => onDateSelect(day) : undefined}
                  >
                    {day && (
                      <>
                        <span className="day-number">{day.getDate()}</span>
                        {games.length > 0 && (
                          <span className="games-badge">
                            {games.length} {games.length === 1 ? 'game' : 'games'}
                          </span>
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
  );
};

export default CalendarView;