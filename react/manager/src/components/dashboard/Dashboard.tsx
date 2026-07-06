import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { userAPI, gameAPI } from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
import SavedGames from './SavedGames';
import NewGameForm from './NewGameForm';
import SelectedGame from '../pages/SelectedGame';
import { SavedGame } from '../../shared';
import { RingLoader } from 'react-spinners'; // ← new import
import './styles/Dashboard.css';

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [savedGames, setSavedGames] = useState<SavedGame[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [showNewGameForm, setShowNewGameForm] = useState<boolean>(false);
  const [selectedGame, setSelectedGame] = useState<SavedGame | null>(null);
  const [isCreatingGame, setIsCreatingGame] = useState<boolean>(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  useEffect(() => {
    loadSavedGames();
  }, []);

  const loadSavedGames = async (): Promise<void> => {
    try {
      setLoading(true);
      const response = await userAPI.getSavedGames();
      setSavedGames(response.data.data || []);
    } catch (err) {
      setError('Failed to load saved games');
      console.error('Error loading games:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGameCreated = async (newGame: SavedGame): Promise<void> => {
    setShowNewGameForm(false);
    setIsCreatingGame(true);

    try {
      const ready = await waitForLeagueInit(newGame.id); // polls gameAPI.getGame until managed_club_id is set
      setSavedGames([ready, ...savedGames]);
      setSelectedGame(ready);
    } catch (err) {
      setError('League initialization timed out');
    } finally {
      setIsCreatingGame(false);
    }
  };

  async function waitForLeagueInit(gameId: string, timeoutMs = 25000): Promise<SavedGame> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await gameAPI.getGame(gameId);
      if (res.data?.managed_club_id) return res.data;
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('timeout');
  }

  const handleGameDeleted = async (gameId: string): Promise<void> => {
    try {
      await gameAPI.deleteGame(gameId);
      setSavedGames(savedGames.filter(game => game.id !== gameId));
      if (selectedGame?.id === gameId) {
        setSelectedGame(null);
      }
    } catch (err) {
      console.error('Error deleting game:', err);
      setError('Failed to delete game');
    }
  };

  const handleGameSelect = (game: SavedGame): void => {
    setSelectedGame(game);
  };

  const handleGameUpdate = (updatedGame: SavedGame): void => {
    setSavedGames(savedGames.map(g =>
      g.id === updatedGame.id ? updatedGame : g
    ));
    setSelectedGame(updatedGame);
  };

  const handleBackToDashboard = (): void => {
    setSelectedGame(null);
  };

  const getLatestGame = (): SavedGame | null => {
    if (savedGames.length === 0) return null;
    return savedGames.reduce((latest, current) => {
      const latestDate = new Date(latest.updated_at || latest.created_at || 0);
      const currentDate = new Date(current.updated_at || current.created_at || 0);
      return currentDate > latestDate ? current : latest;
    });
  };

  const handleContinueLatest = (): void => {
    const latest = getLatestGame();
    if (latest) {
      setSelectedGame(latest);
    }
  };

  const handleStartNewSeason = async (): Promise<void> => {
    const latest = getLatestGame();
    if (latest) {
      const confirmDelete = window.confirm(
        'Starting a new season will delete your current saved game. Are you sure?'
      );
      if (!confirmDelete) return;
      await handleGameDeleted(latest.id);
    }
    setShowNewGameForm(true);
  };

  // ── Loading spinner while initial data is being fetched ──
  if (loading) {
    return (
        <div className="pulse-ring-loader"></div>
    );
  }

  // ── Selected game view ──
  if (selectedGame) {
    return (
      <SelectedGame
        game={selectedGame}
        onBack={handleBackToDashboard}
        onDelete={handleGameDeleted}
        onUpdate={handleGameUpdate}
      />
    );
  }

  const latestGame = getLatestGame();
  const hasGames = savedGames.length > 0;

  return (
    <div className="dark-glass-dashboard">
      {/* Top Navigation Bar */}
      <header className="dashboard-navbar">
        <div className="nav-container">
          <div className="nav-logo">
            <span className="logo-icon">🏀</span>
            <h1 className="logo-text">Hardwood<span className="text-glow-blue">GM</span></h1>
          </div>
          <div className="nav-user-panel">
            <div className="user-badge">
              <span className="user-status-dot"></span>
              <span className="username">{user?.username || 'Coach'}</span>
            </div>
            <button
              className="glass-action-btn settings-trigger"
              onClick={() => setShowSettingsMenu(true)}
              aria-label="Open settings"
            >
              ⚙️
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="dashboard-content-wrapper">
        <div className="dashboard-layout">
          
          {/* Main Action Control Panel Card */}
          <section className="glass-panel main-panel animated-border-glow">
            {hasGames && latestGame ? (
              <div className="panel-inner">
                <div className="panel-badge neon-blue">CURRENT LEAGUE</div>
                <h2 className="panel-title">{latestGame.name}</h2>
                <p className="panel-subtitle">Keep it creamy and keep fuckin on these hoes.</p>
                
                <div className="panel-actions-grid">
                  <button 
                    className="glass-btn btn-primary-blue-glow"
                    onClick={handleContinueLatest}
                  >
                    ⚡ Resume Season
                  </button>
                  <button 
                    className="glass-btn btn-secondary-danger"
                    onClick={handleStartNewSeason}
                  >
                    🔄 Purge & Restart
                  </button>
                </div>
                
                {/* Meta details footer inside the card */}
                <footer className="panel-meta-footer">
                  <div className="meta-item">
                    <span className="meta-label">Save File</span>
                    <span className="meta-value text-white">{latestGame.name}</span>
                  </div>
                  <div className="meta-item text-right">
                    <span className="meta-label">Last Saved</span>
                    <span className="meta-value">
                      {new Date(latestGame.updated_at || latestGame.created_at).toLocaleDateString()} at{' '}
                      {new Date(latestGame.updated_at || latestGame.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </footer>
              </div>
            ) : (
              <div className="panel-inner empty-state">
                <div className="panel-badge neon-amber">NO FRANCHISE</div>
                <h2 className="panel-title">Inaugurate Your League</h2>
                <p className="panel-subtitle">No active careers found. Step up to the front office and build your basketball dynasty from scratch.</p>
                <button 
                  className="glass-btn btn-primary-glow large-btn"
                  onClick={() => setShowNewGameForm(true)}
                >
                  🏆 Establish New Franchise
                </button>
              </div>
            )}
          </section>

          {/* Quick Stats Summary / System Log Row */}
          {error && (
            <div className="glass-banner error-banner">
              <span>⚠️ {error}</span>
            </div>
          )}
          
        </div>
      </main>

      {/* Modern Blurred Modals */}
      {showNewGameForm && (
        <div className="glass-modal-backdrop blur-bg">
          <div className="glass-modal-container layout-popup">
            <NewGameForm
              onClose={() => setShowNewGameForm(false)}
              onGameCreated={handleGameCreated}
            />
          </div>
        </div>
      )}

      {isCreatingGame && (
        <div className="glass-modal-backdrop heavy-blur-bg">
          <div className="creation-spinner-box">
            <div className="pulse-ring-loader"></div>
            <h3>Generating Simulated Universe</h3>
            <p>Drafting players, balancing cap sheets, and establishing schedules...</p>
          </div>
        </div>
      )}

      {showSettingsMenu && (
        <div
          className="glass-modal-backdrop blur-bg"
          onClick={() => setShowSettingsMenu(false)}
        >
          <div
            className="settings-glass-drawer"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-header">
              <h3>SYSTEM CONTROL</h3>
              <button className="close-drawer" onClick={() => setShowSettingsMenu(false)}>✕</button>
            </div>
            <div className="drawer-links">
              <button className="drawer-item" onClick={() => setShowSettingsMenu(false)}>▶ Resume Operations</button>
              <button className="drawer-item">🔊 Audio Options</button>
              <button className="drawer-item">⚙ System Config</button>
              <button className="drawer-item text-danger" onClick={logout}>🚪 Terminate Session (Logout)</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;