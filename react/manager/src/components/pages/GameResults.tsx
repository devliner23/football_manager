// GameResults.tsx
import React, { useState, useEffect } from 'react';
import {
  List,
  Trophy,
  Calendar,
  BarChart3,
  Target,
  Hand,
  Ban,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';
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
      const gamesData = await leagueAPI.getRecentGames(savedGameId, 10);
      setGames(gamesData);
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
      const gameDetail = await leagueAPI.getGameDetails(gameId);
      setBoxScores(gameDetail.boxScores);
      setExpandedGame(gameId);
      if (onGameClick) onGameClick(gameId);
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
      minute: '2-digit',
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
        <div className="header-left">
          <List size={20} className="header-icon" />
          <h3>Recent Games</h3>
        </div>
        <span className="game-count">{games.length} games</span>
      </div>

      <div className="game-grid">
        {games.map((game) => {
          const isHomeWin = game.home_score > game.away_score;
          const isExpanded = expandedGame === game.id;

          return (
            <div
              key={game.id}
              className={`game-card ${isExpanded ? 'expanded' : ''}`}
            >
              {/* Square summary area – always visible */}
              <div
                className="game-summary-square"
                onClick={() => handleGameClick(game.id)}
              >
                <div className="team-stack">
                  {/* Away team on top */}
                  <div className={`team-row ${!isHomeWin ? 'winner' : ''}`}>
                    <span className="team-abbrev">
                      {game.away_team?.abbreviation || game.away_team?.name}
                    </span>
                    <span className="team-score">{game.away_score}</span>
                  </div>

                  <div className="vs-divider">VS</div>

                  {/* Home team below */}
                  <div className={`team-row ${isHomeWin ? 'winner' : ''}`}>
                    <span className="team-abbrev">
                      {game.home_team?.abbreviation || game.home_team?.name}
                    </span>
                    <span className="team-score">{game.home_score}</span>
                  </div>
                </div>

                <div className="game-footer">
                  <span className="game-week">Week {game.week}</span>
                  <span className="game-date">
                    <Calendar size={12} />
                    {formatDate(game.played_at)}
                  </span>
                </div>

                <div className="expand-indicator">
                  <ChevronDown size={18} />
                </div>
              </div>

              {/* Expandable box score area */}
              {isExpanded && boxScores && (
                <div className="game-details">
                  <div className="box-score">
                    <h4>
                      <Trophy size={16} className="section-icon" />
                      Box Score
                    </h4>
                    <div className="box-score-grid">
                      {boxScores.map((stat: any) => (
                        <div key={stat.player_id} className="player-stat">
                          <div className="player-name">
                            {stat.player?.first_name} {stat.player?.last_name}
                          </div>
                          <div className="stat-line">
                            <span title="Points">{stat.points}</span>
                            <span title="Rebounds">
                              <BarChart3 size={14} className="stat-icon" />
                              {stat.rebounds}
                            </span>
                            <span title="Assists">
                              <Target size={14} className="stat-icon" />
                              {stat.assists}
                            </span>
                            <span title="Steals">
                              <Hand size={14} className="stat-icon" />
                              {stat.steals}
                            </span>
                            <span title="Blocks">
                              <Ban size={14} className="stat-icon" />
                              {stat.blocks}
                            </span>
                            <span title="Turnovers">
                              <AlertTriangle size={14} className="stat-icon" />
                              {stat.turnovers}
                            </span>
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