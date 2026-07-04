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

// Build a local YYYY-MM-DD string with no Date()/timezone round-trip.
const todayAsString = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Format a YYYY-MM-DD string for display without ever going through UTC.
const formatDisplayDate = (dateStr: string): string => {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString();
};

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

  // Sync with latest simulated date.
  // IMPORTANT: parse the date string directly instead of going through
  // `new Date(...).toISOString()`, which reinterprets a date-only string
  // as UTC midnight and can shift it by a day relative to the locale-based
  // "Last simulated" label below — that mismatch was the root cause of the
  // sidebar text and the DatePicker disagreeing.
  useEffect(() => {
    if (lastSimulatedDate) {
      setSimDate(lastSimulatedDate.slice(0, 10));
    } else {
      setSimDate(todayAsString());
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
    const cd = date as CalendarDate;
    return `${cd.year}-${String(cd.month).padStart(2, '0')}-${String(cd.day).padStart(2, '0')}`;
  };

  const handleDateChange = (date: DateValue | null) => {
    setSimDate(fromCalendarDate(date));
  };

  return (
    <aside className="glass-sidebar">
      {/* Record */}
      <section className="glass-sidebar-panel">
        <span className="sidebar-panel-badge neon-blue-badge">SEASON {season}</span>
        <div className="sidebar-record">
          <span className="sidebar-wins">{wins}</span>
          <span className="sidebar-dash">–</span>
          <span className="sidebar-losses">{losses}</span>
        </div>
        <div className="sidebar-pct">Win % {winPct}%</div>
      </section>

      {/* Quick Stats */}
      {/* <section className="glass-sidebar-panel">
        <h4 className="sidebar-panel-title">Quick Stats</h4>
        <div className="sidebar-stat-list">
          <div className="sidebar-stat-row">
            <span className="sidebar-stat-label">PPG</span>
            <span className="sidebar-stat-value">{ppg}</span>
          </div>
          <div className="sidebar-stat-row">
            <span className="sidebar-stat-label">OPPG</span>
            <span className="sidebar-stat-value">{oppg}</span>
          </div>
          <div className="sidebar-stat-row">
            <span className="sidebar-stat-label">Players</span>
            <span className="sidebar-stat-value">{playerCount}</span>
          </div>
        </div>
      </section> */}

      {/* Simulate */}
      <section className="glass-sidebar-panel animated-border-glow">
        <h4 className="sidebar-panel-title">Simulate</h4>

        {/* {lastSimulatedDate && (
          <p className="sidebar-date-info">
            Last simulated: <span className="text-white">{formatDisplayDate(lastSimulatedDate)}</span>
          </p>
        )} */}

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
          className="glass-btn btn-primary-blue-glow large-btn sidebar-action-btn"
          onClick={() => onSimulateToDate(simDate)}
          disabled={loading || !simDate}
        >
          {loading ? 'Simulating…' : 'Simulate to Date'}
        </button>
        <button
          className="glass-btn btn-primary-blue-glow large-btn sidebar-action-btn"
          onClick={() => onSimulateToDate(simDate)}
          disabled={loading || !simDate}
        >
          {loading ? 'Simulating…' : 'Simulate A Day'}
        </button>
      </section>
    </aside>
  );
};

export default GameSidebar;