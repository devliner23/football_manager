// NewGameTeamData.tsx
import React from 'react';
import teams from "../../../../data/teams.json";
import '../styles/NewGameTeamData.css';

interface TeamInfo {
  city: string;
  name: string;
  abbreviation: string;
  conference: string;
  division: string;
  description: string;
  primaryColor: string;
}

interface NewGameTeamDataProps {
  teamName: string;
}

const NewGameTeamData: React.FC<NewGameTeamDataProps> = ({ teamName }) => {
  const team = (teams as TeamInfo[]).find(
    (t) => t.name.toLowerCase() === teamName.toLowerCase()
  );

  if (!team) {
    return (
      <div className="team-data-glass team-data-error">
        Could not find team data for "{teamName}".
      </div>
    );
  }

  return (
    <div className="team-data-glass">
      {/* Header with accent color */}
      <div className="team-data-header-section">
        <h3 className="team-data-title">
          <span className="team-color-bar" style={{ backgroundColor: team.primaryColor }} />
          {team.city} {team.name}
        </h3>
        <span className="team-data-abbr">{team.abbreviation}</span>
      </div>

      <div className="team-data-meta">
        <span className="meta-badge">{team.conference} Conference</span>
        <span className="meta-badge">{team.division} Division</span>
      </div>

      <div className="team-data-description">
        {team.description}
      </div>
    </div>
  );
};

export default NewGameTeamData;