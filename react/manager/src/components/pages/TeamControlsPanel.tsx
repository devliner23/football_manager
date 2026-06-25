// src/components/SelectedGame/TeamControlsPanel.tsx
import React, { useState } from 'react';
import { ChevronDown, Settings } from 'lucide-react';
import './styles/TeamControlsPanel.css';

interface TeamControlsPanelProps {
  // placeholder for future actions
}

const TeamControlsPanel: React.FC<TeamControlsPanelProps> = () => {
  const [expanded, setExpanded] = useState(false);

  const handleAction = (action: string) => {
    // placeholder – will be wired up later
    console.log(`Team action: ${action}`);
  };

  return (
    <div className="team-controls-panel glass-panel">
      <button
        className="accordion-trigger"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <div className="trigger-left">
          <Settings size={18} strokeWidth={2} />
          <span>Team Controls</span>
        </div>
        <ChevronDown
          size={18}
          strokeWidth={2}
          className={`chevron ${expanded ? 'rotated' : ''}`}
        />
      </button>

      <div className={`accordion-content ${expanded ? 'open' : ''}`}>
        <div className="controls-grid">
          <button className="control-btn" onClick={() => handleAction('roster')}>
            Roster Moves
          </button>
          <button className="control-btn" onClick={() => handleAction('depth')}>
            Depth Chart
          </button>
          <button className="control-btn" onClick={() => handleAction('trade')}>
            Trade Block
          </button>
          <button className="control-btn" onClick={() => handleAction('scouting')}>
            Scouting
          </button>
          <button className="control-btn" onClick={() => handleAction('practice')}>
            Practice
          </button>
          <button className="control-btn" onClick={() => handleAction('coaching')}>
            Coaching
          </button>
        </div>
      </div>
    </div>
  );
};

export default TeamControlsPanel;