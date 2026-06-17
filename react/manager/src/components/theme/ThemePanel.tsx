// src/components/ThemePanel/ThemePanel.tsx

import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import './ThemePanel.css';

const ThemePanel: React.FC = () => {
  const { currentTheme, setTheme, availableTeams, isThemePanelOpen, toggleThemePanel } = useTheme();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTeams = availableTeams.filter(team =>
    team.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      {/* Floating toggle button */}
      <button 
        className="theme-toggle-btn"
        onClick={toggleThemePanel}
        aria-label="Toggle theme panel"
      >
        <span className="theme-toggle-icon">🎨</span>
        <span className="theme-toggle-label">Theme</span>
      </button>

      {/* Theme panel */}
      {isThemePanelOpen && (
        <div className="theme-panel-overlay" onClick={toggleThemePanel}>
          <div className="theme-panel" onClick={(e) => e.stopPropagation()}>
            <div className="theme-panel-header">
              <h3>🎨 Team Themes</h3>
              <button className="theme-panel-close" onClick={toggleThemePanel}>✕</button>
            </div>

            <div className="theme-panel-body">
              <div className="theme-search">
                <input
                  type="text"
                  placeholder="Search teams..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="theme-grid">
                {filteredTeams.map((teamName) => {
                  const isActive = currentTheme.name === teamName;
                  const teamData = require('../../data/teamColors.json')[teamName];
                  
                  return (
                    <button
                      key={teamName}
                      className={`theme-item ${isActive ? 'active' : ''}`}
                      onClick={() => {
                        setTheme(teamName);
                        toggleThemePanel();
                      }}
                      style={{
                        '--team-color': teamData.primary,
                        '--team-secondary': teamData.secondary,
                      } as React.CSSProperties}
                    >
                      <div className="theme-preview">
                        <div className="theme-swatch" style={{ backgroundColor: teamData.primary }} />
                        <div className="theme-swatch" style={{ backgroundColor: teamData.secondary }} />
                        <div className="theme-swatch" style={{ backgroundColor: teamData.accent }} />
                      </div>
                      <span className="theme-name">{teamName}</span>
                      <span className="theme-mascot">{teamData.mascot}</span>
                      {isActive && <span className="theme-active-badge">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="theme-panel-footer">
              <button 
                className="theme-reset-btn"
                onClick={() => {
                  setTheme('Default');
                  toggleThemePanel();
                }}
              >
                Reset to Default
              </button>
              <span className="theme-count">{availableTeams.length} teams</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ThemePanel;