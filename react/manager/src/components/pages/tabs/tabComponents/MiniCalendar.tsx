import React, { useMemo } from 'react';
import { GameResult } from '../../../../shared';

interface MiniCalendarProps {
  schedule: Record<number, GameResult[]>;
  currentDate: Date;
  onDateSelect: (date: Date) => void;
}

const MiniCalendar: React.FC<MiniCalendarProps> = ({ schedule, currentDate, onDateSelect }) => {
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

  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  const monthName = monthStart.toLocaleString('default', { month: 'long', year: 'numeric' });

  const weeks: (Date | null)[][] = [];
  let week: (Date | null)[] = [];
  // Pad start
  for (let i = 0; i < monthStart.getDay(); i++) week.push(null);
  for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
    week.push(new Date(d));
  }
  while (week.length < 7) week.push(null);
  if (week.some(d => d !== null)) weeks.push(week);

  const getGamesCount = (date: Date | null) => {
    if (!date) return 0;
    const key = date.toISOString().split('T')[0];
    return (gamesByDate.get(key) || []).length;
  };

  const isToday = (date: Date | null) =>
    date && date.toDateString() === currentDate.toDateString();

  return (
    <div className="mini-calendar">
      <h4 className="mini-cal-title">{monthName}</h4>
      <div className="mini-weekday-header">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
          <div key={d} className="mini-weekday">{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="mini-week">
          {week.map((day, di) => {
            const count = getGamesCount(day);
            return (
              <div
                key={di}
                className={`mini-day ${day ? '' : 'empty'} ${count > 0 ? 'has-games' : ''} ${isToday(day) ? 'today' : ''}`}
                onClick={day && count > 0 ? () => onDateSelect(day) : undefined}
              >
                {day && (
                  <>
                    <span className="mini-day-num">{day.getDate()}</span>
                    {count > 0 && <span className="mini-dot">{count}</span>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default MiniCalendar;