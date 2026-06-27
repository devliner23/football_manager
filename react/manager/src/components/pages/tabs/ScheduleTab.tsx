import React, { useState, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { GameResult } from '../../../api/leagueApi';
import IndividualGameView from '../components/IndividualGameView';
import CalendarView from './tabComponents/CalendarView';
import GamesListView from './tabComponents/GamesListView';
import MiniCalendar from './tabComponents/MiniCalendar';
import GameSnapshot from './tabComponents/GameSnapshot';
import './styles/ScheduleTab.css';

interface ScheduleTabProps {
  schedule: Record<number, GameResult[]>;
  teams: { id: string; name: string; abbreviation: string }[];
  currentDate: string | null;
}

type Tab = 'calendar' | 'games' | 'events';

const ScheduleTab: React.FC<ScheduleTabProps> = ({ schedule, teams, currentDate }) => {
  const [activeTab, setActiveTab] = useState<Tab>('games');
  const [calendarModalDate, setCalendarModalDate] = useState<Date | null>(null);
  const [calendarModalGame, setCalendarModalGame] = useState<GameResult | null>(null);
  
  // Games tab state
  const [gamesTabSelectedDate, setGamesTabSelectedDate] = useState<Date>(() => {
    if (currentDate) {
      const d = new Date(currentDate);
      return isNaN(d.getTime()) ? new Date() : d;
    }
    return new Date();
  });
  const [gamesTabViewMode, setGamesTabViewMode] = useState<'daily' | 'weekly'>('daily');
  const [gamesTabSelectedGame, setGamesTabSelectedGame] = useState<GameResult | null>(null);

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

  // Handlers for Calendar tab modal (unchanged logic)
  const handleCalendarDateSelect = (date: Date) => {
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

  // Games tab handlers
  const handleGamesTabDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = new Date(e.target.value + 'T00:00:00');
    if (!isNaN(d.getTime())) {
      setGamesTabSelectedDate(d);
      setGamesTabSelectedGame(null); // reset selected game when date changes
    }
  };
  const handleMiniCalendarSelect = (date: Date) => {
    setGamesTabSelectedDate(date);
    setGamesTabSelectedGame(null);
  };
  const handleGameSelectForSidePanel = (game: GameResult) => {
    setGamesTabSelectedGame(game);
  };

  // Filter games for daily view
  const dailyGames = useMemo(() => {
    const key = gamesTabSelectedDate.toISOString().split('T')[0];
    return gamesByDate.get(key) || [];
  }, [gamesTabSelectedDate, gamesByDate]);

  // Modal only appears for Calendar tab
  const showCalendarModal = (activeTab === 'calendar') && (
    calendarModalDate || 
    (calendarModalGame && teamMap.get(calendarModalGame.home_team_id) && teamMap.get(calendarModalGame.away_team_id))
  );

  const modalDateGames = calendarModalDate
    ? gamesByDate.get(calendarModalDate.toISOString().split('T')[0]) || []
    : [];

  const tabs: Tab[] = ['calendar', 'games', 'events'];

  return (
    <div className="schedule-tab-container">
      {/* Glass tab bar */}
      <div className="tab-bar">
        {tabs.map(tab => (
          <button
            key={tab}
            className={`tab-item ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="tab-content">
        {activeTab === 'calendar' && (
          <div className="placeholder-full">
            <h2>Calendar</h2>
            <p>Calendar view is now part of the Games tab. Full calendar coming soon.</p>
          </div>
        )}

        {activeTab === 'games' && (
          <div className="games-two-col">
            {/* Left column (70%) */}
            <div className="games-left">
              <div className="games-controls">
                <div className="date-selector">
                  <label htmlFor="games-date">Date:</label>
                  <input
                    id="games-date"
                    type="date"
                    value={gamesTabSelectedDate.toISOString().split('T')[0]}
                    onChange={handleGamesTabDateChange}
                    className="date-input"
                  />
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
                    dailyGames.map(game => {
                      const home = teamMap.get(game.home_team_id);
                      const away = teamMap.get(game.away_team_id);
                      const isSelected = gamesTabSelectedGame?.id === game.id;
                      return (
                        <div
                          key={game.id}
                          className={`game-card-sidebar ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleGameSelectForSidePanel(game)}
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
                    })
                  )}
                </div>
              ) : (
                <GamesListView
                  schedule={schedule}
                  teams={teams}
                  currentDate={currentDate}
                  onGameSelect={handleGameSelectForSidePanel}
                  highlightDate={gamesTabSelectedDate}
                />
              )}
            </div>

            {/* Right column (30%) */}
            <div className="games-right">
              <MiniCalendar
                schedule={schedule}
                currentDate={gamesTabSelectedDate}
                onDateSelect={handleMiniCalendarSelect}
              />
              <GameSnapshot
                game={gamesTabSelectedGame}
                homeTeam={gamesTabSelectedGame ? (teamMap.get(gamesTabSelectedGame.home_team_id) ?? null) : null}
                awayTeam={gamesTabSelectedGame ? (teamMap.get(gamesTabSelectedGame.away_team_id) ?? null) : null}
              />
            </div>
          </div>
        )}

        {activeTab === 'events' && (
          <div className="placeholder-full">
            <h2>Events</h2>
            <p>Upcoming league events and announcements will be shown here.</p>
          </div>
        )}
      </div>

      {/* Calendar‑only modal portal */}
      {showCalendarModal &&
        ReactDOM.createPortal(
          <div className="modal-backdrop" onClick={closeCalendarModal}>
            <div className="day-modal" onClick={e => e.stopPropagation()}>
              {calendarModalDate ? (
                <>
                  <div className="modal-header">
                    <h3 className="modal-title">
                      {calendarModalDate.toLocaleDateString(undefined, {
                        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                      })}
                    </h3>
                    <button className="modal-close" onClick={closeCalendarModal}>✕</button>
                  </div>
                  <div className="modal-games-list">
                    {modalDateGames.map(game => {
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
                    })}
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
        )}
    </div>
  );
};

export default ScheduleTab;