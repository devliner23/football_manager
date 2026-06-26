import React, { useState, useMemo } from 'react';
import { GameResult } from '../../../api/leagueApi';
import IndividualGameView from '../components/IndividualGameView';
import './styles/ScheduleTab.css';

interface ScheduleTabProps {
  schedule: Record<number, GameResult[]>;
  teams: { id: string; name: string; abbreviation: string }[];
}

type ViewMode = 'calendar' | 'list';

const ScheduleTab: React.FC<ScheduleTabProps> = ({ schedule, teams }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedGame, setSelectedGame] = useState<GameResult | null>(null); // ← new state

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

  const allGamesFlat = useMemo(() => {
    const games: GameResult[] = [];
    Object.keys(schedule)
      .sort((a, b) => Number(a) - Number(b))
      .forEach(week => {
        schedule[Number(week)].forEach(g => games.push(g));
      });
    return games;
  }, [schedule]);

  // Handlers
  const openGameModal = (game: GameResult) => {
    setSelectedDate(null); // close day modal if open
    setSelectedGame(game);
  };

  if (!seasonStart) {
    return (
      <div className="schedule-tab">
        <h2>League Schedule</h2>
        <p>No games scheduled yet.</p>
      </div>
    );
  }

  // Get team info for IndividualGameView
  const selectedGameTeams = selectedGame
    ? {
        home: teamMap.get(selectedGame.home_team_id),
        away: teamMap.get(selectedGame.away_team_id),
      }
    : null;

  return (
    <div className="schedule-tab">
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

      {/* ---------- Calendar View ---------- */}
      {viewMode === 'calendar' && (
        <>
          <div className="calendar-container">
            {months.map((month, idx) => (
              <div key={idx} className="calendar-month">
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
                      const isToday = day && new Date().toDateString() === day.toDateString();
                      return (
                        <div
                          key={di}
                          className={`calendar-day ${day ? '' : 'empty'} ${games.length > 0 ? 'has-games' : ''} ${isToday ? 'today' : ''}`}
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

          {/* Day Details Modal (calendar click) */}
          {selectedDate && (
            <div className="modal-backdrop" onClick={() => setSelectedDate(null)}>
              <div className="day-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3 className="modal-title">
                    {selectedDate.toLocaleDateString(undefined, {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
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
                          onClick={() => openGameModal(game)} // ← opens IndividualGameView
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
                              {game.status === 'final' && game.home_score != null
                                ? `${game.home_score} - ${game.away_score}`
                                : '—'}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ---------- List View ---------- */}
      {viewMode === 'list' && (
        <div className="list-container">
          <div className="list-header">
            <span>Date</span>
            <span>Week</span>
            <span>Matchup</span>
            <span>Score</span>
            <span>Status</span>
          </div>
          {allGamesFlat.map(game => {
            const home = teamMap.get(game.home_team_id);
            const away = teamMap.get(game.away_team_id);
            const dateSource = game.game_date || game.played_at;
            const date = dateSource ? new Date(dateSource).toLocaleDateString() : '—';
            return (
              <div
                key={game.id}
                className="list-row"
                onClick={() => openGameModal(game)} // ← opens IndividualGameView
                role="button"
                tabIndex={0}
              >
                <span className="list-date">{date}</span>
                <span className="list-week">Week {game.week}</span>
                <span className="list-matchup">
                  <span className="team-abbr home">{home?.abbreviation || 'TBD'}</span>
                  <span className="vs">vs</span>
                  <span className="team-abbr away">{away?.abbreviation || 'TBD'}</span>
                </span>
                <span className="list-score">
                  {game.status === 'final' && game.home_score != null
                    ? `${game.home_score} - ${game.away_score}`
                    : '—'}
                </span>
                <span className={`list-status status-${game.status}`}>{game.status}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Individual Game Modal (reusable) */}
      {selectedGame && selectedGameTeams?.home && selectedGameTeams?.away && (
        <IndividualGameView
          game={selectedGame}
          homeTeam={selectedGameTeams.home}
          awayTeam={selectedGameTeams.away}
          onClose={() => setSelectedGame(null)}
        />
      )}
    </div>
  );
};

export default ScheduleTab;