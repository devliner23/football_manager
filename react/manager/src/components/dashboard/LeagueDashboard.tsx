import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { SavedGame } from '../../types';
import './LeagueDashboard.css';

interface LeagueDashboardProps {
  game: SavedGame;
}

const LeagueDashboard: React.FC<LeagueDashboardProps> = ({ game }) => {
  const [loading, setLoading] = useState(false);
  const [standings, setStandings] = useState<any[]>([]);
  const [leagueLeaders, setLeagueLeaders] = useState<any[]>([]);
  const [selectedTab, setSelectedTab] = useState<'standings' | 'leaders' | 'schedule' | 'playoffs'>('standings');
  const { user } = useAuth();

  useEffect(() => {
    loadLeagueData();
  }, []);

  const loadLeagueData = async () => {
    setLoading(true);
    try {
      // Fetch standings and leaders from API
      // This will be implemented when backend is ready
    } catch (error) {
      console.error('Error loading league data:', error);
    } finally {
      setLoading(false);
    }
  };

  const simulateSeason = async () => {
    setLoading(true);
    try {
      // Call API to simulate season
      // This will be implemented when backend is ready
    } catch (error) {
      console.error('Error simulating season:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="league-dashboard">
      <div className="league-header">
        <h2>League Dashboard</h2>
        <div className="league-actions">
          <button className="simulate-season-btn" onClick={simulateSeason}>
            ⚡ Simulate Season
          </button>
        </div>
      </div>

      <div className="league-nav">
        <button 
          className={`nav-btn ${selectedTab === 'standings' ? 'active' : ''}`}
          onClick={() => setSelectedTab('standings')}
        >
          Standings
        </button>
        <button 
          className={`nav-btn ${selectedTab === 'leaders' ? 'active' : ''}`}
          onClick={() => setSelectedTab('leaders')}
        >
          League Leaders
        </button>
        <button 
          className={`nav-btn ${selectedTab === 'schedule' ? 'active' : ''}`}
          onClick={() => setSelectedTab('schedule')}
        >
          Schedule
        </button>
        <button 
          className={`nav-btn ${selectedTab === 'playoffs' ? 'active' : ''}`}
          onClick={() => setSelectedTab('playoffs')}
        >
          Playoffs
        </button>
      </div>

      <div className="league-content">
        {selectedTab === 'standings' && (
          <div className="standings-container">
            <div className="conference-standings">
              <h3>Eastern Conference</h3>
              <table className="standings-table">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>W</th>
                    <th>L</th>
                    <th>PCT</th>
                    <th>GB</th>
                    <th>Streak</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Map through Eastern teams */}
                </tbody>
              </table>
            </div>
            <div className="conference-standings">
              <h3>Western Conference</h3>
              <table className="standings-table">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>W</th>
                    <th>L</th>
                    <th>PCT</th>
                    <th>GB</th>
                    <th>Streak</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Map through Western teams */}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {selectedTab === 'leaders' && (
          <div className="leaders-container">
            <div className="leader-category">
              <h4>Points Per Game</h4>
              <table>
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Team</th>
                    <th>PPG</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Map through scoring leaders */}
                </tbody>
              </table>
            </div>
            {/* Add more leader categories */}
          </div>
        )}

        {/* Add more tabs */}
      </div>
    </div>
  );
};

export default LeagueDashboard;