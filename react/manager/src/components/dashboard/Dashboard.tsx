import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { userAPI, gameAPI } from '../../api/client';
import SavedGames from './SavedGames';
import NewGameForm from './NewGameForm';
import SelectedGame from '../pages/SelectedGame';
import { SavedGame } from '../../shared';

import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import './Dashboard.css';

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [savedGames, setSavedGames] = useState<SavedGame[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [showNewGameForm, setShowNewGameForm] = useState<boolean>(false);
  const [selectedGame, setSelectedGame] = useState<SavedGame | null>(null);
  const [isCreatingGame, setIsCreatingGame] = useState<boolean>(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

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

  const handleGameCreated = (newGame: SavedGame): void => {
    setShowNewGameForm(false);
    setIsCreatingGame(true);

    setTimeout(() => {
      setSavedGames([newGame, ...savedGames]);
      setSelectedGame(newGame);
      setIsCreatingGame(false);
    }, 1200);
  };

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

  // Get the most recently updated game
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
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-content">
          <h1>🏀 Basketball GM</h1>
          <div className="user-info">
            <span className="username">
              {user?.username || 'Coach'}
            </span>
            <button
              className="settings-button"
              onClick={() => setShowSettingsMenu(true)}
            >
              ⚙
            </button>
          </div>
        </div>
      </header>

      <div className="dashboard-content">
        <button
          className={`sidebar-toggle ${!sidebarOpen ? 'collapsed' : ''}`}
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <ArrowForwardIosIcon /> : <ArrowBackIosNewIcon />}
        </button>

        <div className={`dashboard-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>

          <div className="game-list">
            <h3>Your Saved Games</h3>
            {loading ? (
              <div className="loading">Loading your games...</div>
            ) : error ? (
              <div className="error">{error}</div>
            ) : savedGames.length === 0 ? (
              <div className="no-games">
                <p>No saved games yet</p>
                <p className="hint">Start your first season!</p>
              </div>
            ) : (
              <SavedGames
                games={savedGames}
                onSelect={handleGameSelect}
                onDelete={handleGameDeleted}
                selectedId={null}
              />
            )}
          </div>
        </div>

        <div className="dashboard-main">
          <div className="split-panel">
            {/* Continue Last Save Panel - Only show if there are games */}
            {hasGames && latestGame && (
              <div className="panel-card continue-panel">
                <span className="icon">▶️</span>
                <h2>Continue Last Save</h2>
                <p>Pick up where you left off in your most recent season.</p>
                <button 
                  className="panel-button" 
                  onClick={handleContinueLatest}
                >
                  Continue Game
                </button>
              </div>
            )}

            {/* Create New Season Panel - Always shown */}
            <div className={`panel-card new-panel ${!hasGames ? 'full-width' : ''}`}>
              <span className="icon">🏆</span>
              <h2>{hasGames ? 'Create New Season' : 'Start Your First Season'}</h2>
              <p>
                {hasGames 
                  ? 'Start a fresh basketball season with a new team and roster.'
                  : 'No saved games found. Create your first basketball season now!'}
              </p>
              <button 
                className="panel-button" 
                onClick={() => setShowNewGameForm(true)}
              >
                {hasGames ? 'New Season' : 'Get Started'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showNewGameForm && (
        <div className="modal-overlay">
          <NewGameForm
            onClose={() => setShowNewGameForm(false)}
            onGameCreated={handleGameCreated}
          />
        </div>
      )}

      {isCreatingGame && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <p>Creating your league…</p>
        </div>
      )}

      {showSettingsMenu && (
        <div
          className="modal-overlay"
          onClick={() => setShowSettingsMenu(false)}
        >
          <div
            className="settings-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Menu</h3>
            <button>▶ Resume</button>
            <button>🔊 Audio</button>
            <button>⚙ Settings</button>
            <button onClick={logout}>🚪 Logout</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;