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
          <div className="games-two-col">
            <div className="games-left">
              <div className="team-schedule-header">
                <h3>Your Team's Schedule</h3>
                {!currentTeam && <p className="no-games">No team selected.</p>}
              </div>
              {currentTeam && teamGames.length === 0 && (
                <p className="no-games">No games found for this team.</p>
              )}
              {currentTeam && teamGames.length > 0 && (
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
            <div className="calendar-grid">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="calendar-day-header">{day}</div>
              ))}
              {calendarDays.map((day, idx) => {
                const count = gameCountForDay(day);
                return (
                  <div
                    key={idx}
                    className={`calendar-day ${day === null ? 'empty' : ''} ${count > 0 ? 'has-games' : ''}`}
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