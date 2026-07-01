import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { userAPI, gameAPI } from '../../api/client';
import SavedGames from './SavedGames';
import NewGameForm from './NewGameForm';
import SelectedGame from '../pages/SelectedGame';
import { SavedGame } from '../../shared';
import { RingLoader } from 'react-spinners'; // ← new import
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
      <div className="loading-overlay">
        <RingLoader color="#4A90D9" loading={loading} size={120} />
      </div>
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

  // ── Main dashboard ──
  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-content">
          <h1>🏀 Hardwood GM</h1>
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
        <div className="dashboard-main">
          <div className="panel-card full-width">
            {hasGames && latestGame ? (
              <>
                <span className="icon">▶️</span>
                <h2>Continue Season</h2>
                <p>Pick up where you left off in your most recent season.</p>
                <div className="panel-actions">
                  <button 
                    className="panel-button continue"
                    onClick={handleContinueLatest}
                  >
                    Continue Game
                  </button>
                  <button 
                    className="panel-button new-season"
                    onClick={handleStartNewSeason}
                  >
                    Start New Season
                  </button>
                </div>
                <div className="game-info">
                  Last saved: {new Date(latestGame.updated_at || latestGame.created_at).toLocaleString()} <br />
                  Save Name: {latestGame.name}
                </div>
              </>
            ) : (
              <>
                <span className="icon">🏆</span>
                <h2>Start Your First Season</h2>
                <p>No saved games found. Create your first basketball season now!</p>
                <button 
                  className="panel-button new-season"
                  onClick={() => setShowNewGameForm(true)}
                >
                  Get Started
                </button>
              </>
            )}
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