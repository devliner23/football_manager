import React from 'react';
import { GameResult } from '../../../api/leagueApi';
import './styles/ScheduleTab.css';

interface ScheduleTabProps {
  schedule: Record<number, GameResult[]>;
  teams: { id: string; name: string; abbreviation: string }[];
}

const ScheduleTab: React.FC<ScheduleTabProps> = ({ schedule, teams }) => {
  const weeks = Object.keys(schedule).sort((a, b) => Number(a) - Number(b));

  const getTeamName = (teamId: string) => {
    const team = teams.find(t => t.id === teamId);
    return team?.abbreviation || team?.name || teamId;
  };

  if (weeks.length === 0) {
    return (
      <div className="schedule-tab">
        <h2>League Schedule</h2>
        <p>No games scheduled yet.</p>
      </div>
    );
  }

  return (
    <div className="schedule-tab">
      <h2>League Schedule</h2>
      {weeks.map(week => (
        <div key={week} className="schedule-week">
          <h3>Week {week}</h3>
          <div className="schedule-games">
            {schedule[Number(week)].map(game => (
              <div key={game.id} className="schedule-game">
                <span className="game-teams">
                  {getTeamName(game.home_team_id)} vs {getTeamName(game.away_team_id)}
                </span>
                <span className="game-status">
                  {`Final: ${game.home_score}-${game.away_score}`}
                </span>
                <span className="game-date">{new Date(game.played_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ScheduleTab;