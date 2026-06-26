import React, { useState, useEffect } from 'react';
import {
  List,
  Trophy,
  Calendar,
  ChevronDown,
} from 'lucide-react';
import { leagueAPI, GameResult } from '../../api/leagueApi';
import IndividualGameView from './components/IndividualGameView';
import './GameResults.css';

interface GameResultsProps {
  savedGameId: string;
  onGameClick?: (gameId: string) => void;
  /**
   * Optional counter that, when incremented, triggers a new fetch.
   * This replaces the previous key‑based remounting.
   * The parent should increment this after a simulation completes.
   */
  refreshKey?: number;
}

const GameResults: React.FC<GameResultsProps> = ({ savedGameId, onGameClick, refreshKey = 0 }) => {
  const [games, setGames] = useState<GameResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedGame, setSelectedGame] = useState<GameResult | null>(null);

  // Re‑fetch whenever savedGameId or refreshKey changes
  useEffect(() => {
    loadRecentGames();
  }, [savedGameId, refreshKey]);

  const loadRecentGames = async () => {
    setLoading(true);
    try {
      const gamesData = await leagueAPI.getRecentGames(savedGameId, 10);
      setGames(gamesData);
    } catch (error) {
      console.error('Failed to load games:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGameClick = (game: GameResult) => {
    setSelectedGame(game);
    if (onGameClick) onGameClick(game.id);
  };

  const handleClose = () => {
    setSelectedGame(null);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Helper to show score only when the game has completed (backend uses 'completed')
  const isGameFinished = (game: GameResult): boolean => {
    return game.status === 'completed';
  };

  if (loading) {
    return <div className="game-results-loading">Loading games...</div>;
  }

  if (games.length === 0) {
    return (
      <div className="game-results-empty">
        <p>No games played yet. Start simulating to see results!</p>
      </div>
    );
  }

  return (
    <div className="game-results">
      <div className="game-results-header">
        <div className="header-left">
          <List size={20} className="header-icon" />
          <h3>Recent Games</h3>
        </div>
        <span className="game-count">{games.length} games</span>
      </div>

      <div className="game-grid">
        {games.map((game) => {
          const isHomeWin = game.home_score > game.away_score;

          return (
            <div
              key={game.id}
              className="game-card"
            >
              <div
                className="game-summary-square"
                onClick={() => handleGameClick(game)}
              >
                <div className="team-stack">
                  <div className={`team-row ${!isHomeWin ? 'winner' : ''}`}>
                    <span className="team-abbrev">
                      {game.away_team?.abbreviation || game.away_team?.name}
                    </span>
                    <span className="team-score">
                      {isGameFinished(game) ? game.away_score : '—'}
                    </span>
                  </div>

                  <div className="vs-divider">VS</div>

                  <div className={`team-row ${isHomeWin ? 'winner' : ''}`}>
                    <span className="team-abbrev">
                      {game.home_team?.abbreviation || game.home_team?.name}
                    </span>
                    <span className="team-score">
                      {isGameFinished(game) ? game.home_score : '—'}
                    </span>
                  </div>
                </div>

                <div className="game-footer">
                  <span className="game-date">
                    <Calendar size={12} />
                    {formatDate(game.played_at)}
                  </span>
                </div>

                <div className="expand-indicator">
                  <ChevronDown size={18} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedGame && selectedGame.home_team && selectedGame.away_team && (
        <IndividualGameView
            game={selectedGame}
            homeTeam={{
            name: selectedGame.home_team.name,
            abbreviation: selectedGame.home_team.abbreviation,
            }}
            awayTeam={{
            name: selectedGame.away_team.name,
            abbreviation: selectedGame.away_team.abbreviation,
            }}
            onClose={handleClose}
        />
      )}
    </div>
  );
};

export default GameResults;