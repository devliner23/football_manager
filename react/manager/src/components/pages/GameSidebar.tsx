import React, { useState, useEffect } from 'react';
import { UserGameInfo } from '../../api/leagueApi';
import { useGameContext } from '../../context/GameContext';
import { CalendarDate, DateValue } from '@internationalized/date';
import {
  DatePicker,
  DateInput,
  Popover,
  DateSegment,
  Calendar,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  CalendarCell,
  Heading,
  Button
} from 'react-aria-components';
import "./styles/GameSidebar.css";

interface GameSidebarProps {
  season: number;
  wins: number;
  losses: number;
  winPct: string;
  playerCount: number;
  ppg: string;
  oppg: string;
  onContinue: () => void;
  onSimulate: () => void;
  onViewStandings: () => void;
  loading: boolean;
  nextUserGame?: UserGameInfo | null;
  leagueGamesBeforeCount?: number;
  onSimulateToDate: (date: string) => void;
  lastSimulatedDate?: string | null;
}

const GameSidebar: React.FC<GameSidebarProps> = ({
  season,
  wins,
  losses,
  winPct,
  playerCount,
  ppg,
  oppg,
  onContinue,
  onSimulate,
  onViewStandings,
  loading,
  nextUserGame,
  leagueGamesBeforeCount = 0,
  lastSimulatedDate,
  onSimulateToDate,
}) => {
  const [simDate, setSimDate] = useState<string>("");

  // Sync with latest simulated date
  useEffect(() => {
    if (lastSimulatedDate) {
      const formatted = new Date(lastSimulatedDate).toISOString().slice(0, 10);
      setSimDate(formatted);
    } else {
      setSimDate(new Date().toISOString().slice(0, 10));
    }
  }, [lastSimulatedDate]);

  // Convert string ↔ CalendarDate for the DatePicker
  const toCalendarDate = (dateStr: string): CalendarDate | null => {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    return new CalendarDate(y, m, d);
  };

  const fromCalendarDate = (date: DateValue | null): string => {
    if (!date) return '';
    // DateValue can be CalendarDate, CalendarDateTime, or ZonedDateTime
    // We only use CalendarDate, so we can cast safely.
    const cd = date as CalendarDate;
    return `${cd.year}-${String(cd.month).padStart(2, '0')}-${String(cd.day).padStart(2, '0')}`;
  };

  const handleDateChange = (date: DateValue | null) => {
    setSimDate(fromCalendarDate(date));
  };

  return (
    <aside className="game-sidebar-container">
      <div className="game-sidebar-section">
        <h4>Season {season}</h4>
        <div className="sidebar-record">
          <span className="sidebar-wins">{wins}</span>
          <span className="sidebar-dash">-</span>
          <span className="sidebar-losses">{losses}</span>
        </div>
        <div className="sidebar-pct">Win %: {winPct}%</div>
      </div>

      <div className="game-sidebar-section">
        <h4>Quick Stats</h4>
        <div className="sidebar-stat">
          <span className="sidebar-stat-label">PPG</span>
          <span className="sidebar-stat-value">{ppg}</span>
        </div>
        <div className="sidebar-stat">
          <span className="sidebar-stat-label">OPPG</span>
          <span className="sidebar-stat-value">{oppg}</span>
        </div>
        <div className="sidebar-stat">
          <span className="sidebar-stat-label">Players</span>
          <span className="sidebar-stat-value">{playerCount}</span>
        </div>
      </div>

      <div className="game-sidebar-section">
        <h4>Simulate</h4>
        {lastSimulatedDate && (
          <p className="sidebar-date-info">
            Last simulated: {new Date(lastSimulatedDate).toLocaleDateString()}
          </p>
        )}
        <div className="sim-date-input">
          <DatePicker
            className="sim-date-picker-card"
            value={toCalendarDate(simDate)}
            onChange={handleDateChange}
            placeholderValue={new CalendarDate(2026, 1, 1)}
            isDisabled={loading}
          >
            <div className="date-picker-wrapper">
              <DateInput className="date-picker-input">
                {(segment) => <DateSegment segment={segment} />}
              </DateInput>
              <Button className="date-picker-button">📅</Button>
            </div>
              <Popover className="date-picker-popover" placement="bottom start">
                <Calendar className="date-picker-calendar">
                  <header className="calendar-header">
                    <Button slot="previous">‹</Button>
                    <Heading />
                    <Button slot="next">›</Button>
                  </header>

                  <CalendarGrid>
                    <CalendarGridHeader>
                      {(day) => <CalendarHeaderCell>{day}</CalendarHeaderCell>}
                    </CalendarGridHeader>

                    <CalendarGridBody>
                      {(date) => <CalendarCell date={date} />}
                    </CalendarGridBody>
                  </CalendarGrid>
                </Calendar>
              </Popover>
          </DatePicker>
        </div>
        <button
          className="sidebar-action-btn"
          onClick={() => onSimulateToDate(simDate)}
          disabled={loading || !simDate}
        >
          {loading ? 'Simulating…' : 'Simulate to Date'}
        </button>
      </div>
    </aside>
  );
};

export default GameSidebar;