import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { userAPI, gameAPI } from '../../api/client';
import SavedGames from './SavedGames';
import NewGameForm from './NewGameForm';
import SelectedGame from '../pages/SelectedGame';
import { SavedGame } from '../../types';
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
    // Close modal, show loading, then navigate to the new game
    setShowNewGameForm(false);
    setIsCreatingGame(true);

    // Simulate a short loading delay for UX (or you can wait for league data)
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

  // If a game is selected, render only SelectedGame (full screen)
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

  // Otherwise render the dashboard with a modal for new game
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
          </div>        </div>
      </header>

      <div className="dashboard-content">
        <div className="dashboard-sidebar">
          <button
            className="new-game-button"
            onClick={() => setShowNewGameForm(true)}
          >
            ➕ New Season
          </button>

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
          <div className="welcome-message">
            <h2>Welcome to Basketball GM!</h2>
            <p>Select a saved game from the sidebar or start a new season.</p>
            <div className="quick-actions">
              <button onClick={() => setShowNewGameForm(true)} className="quick-action-button">
                🏆 Start New Season
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* New Game Modal */}
      {showNewGameForm && (
        <div className="modal-overlay">
          <NewGameForm
            onClose={() => setShowNewGameForm(false)}
            onGameCreated={handleGameCreated}
          />
        </div>
      )}

      {/* Loading Overlay */}
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