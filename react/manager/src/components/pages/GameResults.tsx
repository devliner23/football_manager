import React, { useState, useEffect } from 'react';
import {
  List,
  Clock,
  Trophy,
  Zap,
} from 'lucide-react';
import { leagueAPI, GameResult } from '../../api/leagueApi';
import IndividualGameView from './tabs/tabComponents/IndividualGameViewFinal';
import './GameResults.css';

interface GameResultsProps {
  savedGameId: string;
  onGameClick?: (gameId: string) => void;
  refreshKey?: number;
}

const GameResults: React.FC<GameResultsProps> = ({ savedGameId, onGameClick, refreshKey = 0 }) => {
  const [games, setGames] = useState<GameResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedGame, setSelectedGame] = useState<GameResult | null>(null);

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

  const isGameFinished = (game: GameResult): boolean => {
    return game.status === 'completed';
  };

  if (loading) {
    return (
      <div className="gr-container">
        <div className="gr-state">
          <div className="gr-spinner" />
          <p>Loading recent games…</p>
        </div>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="gr-container">
        <div className="gr-state">
          <Trophy size={32} strokeWidth={1.5} className="gr-state-icon" />
          <p>No games played yet.</p>
          <span className="gr-state-sub">Start simulating to see results!</span>
        </div>
      </div>
    );
  }

  return (
    <div className="gr-container">
      <div className="gr-header">
        <div className="gr-header-left">
          <div className="gr-header-icon-wrap">
            <Zap size={16} strokeWidth={2} />
          </div>
          <h3 className="gr-title">Around the League</h3>
        </div>
        <span className="gr-count-badge">{games.length} Games</span>
      </div>

      <div className="gr-grid">
        {games.map((game) => {
          const homeWin = game.home_score > game.away_score;
          const finished = isGameFinished(game);

          return (
            <div
              key={game.id}
              className="gr-card"
              onClick={() => handleGameClick(game)}
              role="button"
              tabIndex={0}
            >
              <div className="gr-card-body">
                {/* Away Team */}
                <div className={`gr-team-row ${!homeWin && finished ? 'gr-team-row--winner' : ''}`}>
                  <span className="gr-team-abbr">
                    {game.away_team?.abbreviation || game.away_team?.name || 'TBD'}
                  </span>
                  <span className="gr-team-score">
                    {finished ? game.away_score : '—'}
                  </span>
                </div>

                {/* VS Divider */}
                <div className="gr-vs-pill">VS</div>

                {/* Home Team */}
                <div className={`gr-team-row ${homeWin && finished ? 'gr-team-row--winner' : ''}`}>
                  <span className="gr-team-abbr">
                    {game.home_team?.abbreviation || game.home_team?.name || 'TBD'}
                  </span>
                  <span className="gr-team-score">
                    {finished ? game.home_score : '—'}
                  </span>
                </div>
              </div>

              {/* Footer / Status */}
              {!finished && (
                <div className="gr-card-footer">
                  <span className="gr-status-badge">
                    <Clock size={10} strokeWidth={2} />
                    Upcoming
                  </span>
                </div>
              )}
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