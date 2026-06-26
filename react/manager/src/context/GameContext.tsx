import React, { createContext, useContext } from 'react';
import { UserGameInfo } from '../api/leagueApi';

interface GameContextValue {
  season: number;
  wins: number;
  losses: number;
  winPct: string;
  playerCount: number;
  ppg: string;
  oppg: string;
  nextUserGame: UserGameInfo | null;
  leagueGamesBeforeCount: number;
  lastSimulatedDate: string | null;
  loading: boolean;
  onContinue: () => void;
  onSimulate: () => void;
  onSimulateToDate: (date: string) => void;
  onViewStandings: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export const useGameContext = () => {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGameContext must be inside GameProvider');
  return ctx;
};

export const GameProvider = GameContext.Provider;