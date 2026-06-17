// components/GameResults.tsx

import React, { useState, useEffect } from 'react';
import { leagueAPI, GameResult } from '../../api/leagueApi';
import './GameResults.css';

interface GameResultsProps {
  savedGameId: string;
  onGameClick?: (gameId: string) => void;
}

const GameResults: React.FC<GameResultsProps> = ({ savedGameId, onGameClick }) => {
  const [games, setGames] = useState<GameResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedGame, setExpandedGame] = useState<string | null>(null);
  const [boxScores, setBoxScores] = useState<any>(null);

  useEffect(() => {
    loadRecentGames();
  }, [savedGameId]);

  const loadRecentGames = async () => {
    setLoading(true);
    try {
      const response = await leagueAPI.getRecentGames(savedGameId, 10);
      if (response.data.success) {
        setGames(response.data.data);
      }
    } catch (error) {
      console.error('Failed to load games:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGameClick = async (gameId: string) => {
    if (expandedGame === gameId) {
      setExpandedGame(null);
      setBoxScores(null);
      return;
    }

    try {
      const response = await leagueAPI.getGameDetails(gameId);
      if (response.data.success) {
        setBoxScores(response.data.data.boxScores);
        setExpandedGame(gameId);
        if (onGameClick) onGameClick(gameId);
      }
    } catch (error) {
      console.error('Failed to load game details:', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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
        <h3>📋 Recent Games</h3>
        <span className="game-count">{games.length} games</span>
      </div>
      
      <div className="game-list">
        {games.map((game) => {
          const isHomeWin = game.home_score > game.away_score;
          const winner = isHomeWin ? game.home_team : game.away_team;
          const loser = isHomeWin ? game.away_team : game.home_team;
          const isExpanded = expandedGame === game.id;

          return (
            <div 
              key={game.id} 
              className={`game-item ${isExpanded ? 'expanded' : ''}`}
              onClick={() => handleGameClick(game.id)}
            >
              <div className="game-summary">
                <div className="game-teams">
                  <div className="team home">
                    <span className="team-name">{game.home_team?.abbreviation || game.home_team?.name}</span>
                    <span className={`team-score ${isHomeWin ? 'winner' : 'loser'}`}>
                      {game.home_score}
                    </span>
                  </div>
                  <div className="game-vs">vs</div>
                  <div className="team away">
                    <span className="team-name">{game.away_team?.abbreviation || game.away_team?.name}</span>
                    <span className={`team-score ${!isHomeWin ? 'winner' : 'loser'}`}>
                      {game.away_score}
                    </span>
                  </div>
                </div>
                <div className="game-meta">
                  <span className="game-week">Week {game.week}</span>
                  <span className="game-date">{formatDate(game.played_at)}</span>
                  <span className="game-result-badge">
                    {isHomeWin ? '🏠' : '✈️'} {winner?.abbreviation} wins!
                  </span>
                </div>
              </div>

              {isExpanded && boxScores && (
                <div className="game-details">
                  <div className="box-score">
                    <h4>Box Score</h4>
                    <div className="box-score-grid">
                      {boxScores.map((stat: any) => (
                        <div key={stat.player_id} className="player-stat">
                          <div className="player-name">
                            {stat.player?.first_name} {stat.player?.last_name}
                          </div>
                          <div className="stat-line">
                            <span title="Points">{stat.points}</span>
                            <span title="Rebounds">📊{stat.rebounds}</span>
                            <span title="Assists">🎯{stat.assists}</span>
                            <span title="Steals">👆{stat.steals}</span>
                            <span title="Blocks">🚫{stat.blocks}</span>
                            <span title="Turnovers">⚠️{stat.turnovers}</span>
                          </div>
                          <div className="shot-stats">
                            <span>FG: {stat.fgm}/{stat.fga}</span>
                            <span>3P: {stat.fgm_3}/{stat.fga_3}</span>
                            <span>FT: {stat.ftm}/{stat.fta}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GameResults;