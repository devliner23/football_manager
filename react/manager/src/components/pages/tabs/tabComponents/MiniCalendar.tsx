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
    date && date.toDateString() === new Date().toDateString();

  const isSelected = (date: Date | null) =>
    date && date.toDateString() === currentDate.toDateString();

  return (
    <div className="mini-calendar">
      <div className="mini-cal-header">
        <h4 className="mini-cal-title">{monthName}</h4>
        <span className="mini-cal-badge">Schedule</span>
      </div>
      <div className="mini-weekday-row">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <div key={d} className="mini-weekday">{d}</div>
        ))}
      </div>
      <div className="mini-cal-grid">
        {weeks.map((week, wi) => (
          <div key={wi} className="mini-week">
            {week.map((day, di) => {
              const count = getGamesCount(day);
              const today = isToday(day);
              const selected = isSelected(day);
              return (
                <div
                  key={di}
                  className={`mini-day ${!day ? 'mini-day--empty' : ''} ${count > 0 ? 'mini-day--has-games' : ''} ${today ? 'mini-day--today' : ''} ${selected ? 'mini-day--selected' : ''}`}
                  onClick={day && count > 0 ? () => onDateSelect(day) : undefined}
                >
                  {day && (
                    <>
                      <span className="mini-day__num">{day.getDate()}</span>
                      {count > 0 && (
                        <span className="mini-day__dots">
                          {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                            <span key={i} className="mini-dot" />
                          ))}
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
    </div>
  );
};

export default MiniCalendar;