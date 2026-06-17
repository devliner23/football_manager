// src/contexts/ThemeContext.tsx

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import teamColors from '../data/teamColors.json';

interface TeamTheme {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  mascot: string;
  background: string;
}

interface ThemeContextType {
  currentTheme: TeamTheme;
  setTheme: (teamName: string) => void;
  availableTeams: string[];
  isThemePanelOpen: boolean;
  toggleThemePanel: () => void;
}

const defaultTheme: TeamTheme = {
  name: 'Default',
  primary: '#00d4ff',
  secondary: '#7b2ffc',
  accent: '#ff6b35',
  mascot: 'Basketball',
  background: 'radial-gradient(ellipse at 20% 50%, rgba(0, 212, 255, 0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(123, 47, 252, 0.08) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(255, 107, 53, 0.05) 0%, transparent 50%), #0a0e1a'
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState<TeamTheme>(defaultTheme);
  const [isThemePanelOpen, setIsThemePanelOpen] = useState(false);
  const availableTeams = Object.keys(teamColors);

  const setTheme = (teamName: string) => {
    const themeData = teamColors[teamName as keyof typeof teamColors];
    if (themeData) {
      const newTheme: TeamTheme = {
        name: teamName,
        primary: themeData.primary,
        secondary: themeData.secondary,
        accent: themeData.accent,
        mascot: themeData.mascot,
        background: themeData.background,
      };
      setCurrentTheme(newTheme);
      localStorage.setItem('selectedTheme', teamName);
      applyTheme(newTheme);
    }
  };

  const applyTheme = (theme: TeamTheme) => {
    const root = document.documentElement;
    
    // Update CSS variables
    root.style.setProperty('--team-primary', theme.primary);
    root.style.setProperty('--team-secondary', theme.secondary);
    root.style.setProperty('--team-accent', theme.accent);
    root.style.setProperty('--team-primary-glow', `${theme.primary}33`);
    root.style.setProperty('--team-secondary-glow', `${theme.secondary}33`);
    root.style.setProperty('--team-background', theme.background);
    
    // Update body background
    document.body.style.background = theme.background;
    
    // Update floating orbs
    const orbs = document.querySelectorAll('.floating-orb');
    if (orbs.length >= 2) {
      (orbs[0] as HTMLElement).style.background = theme.primary;
      (orbs[1] as HTMLElement).style.background = theme.secondary;
      if (orbs[2]) {
        (orbs[2] as HTMLElement).style.background = theme.accent;
      }
    }
  };

  // Load saved theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('selectedTheme');
    if (savedTheme && teamColors[savedTheme as keyof typeof teamColors]) {
      setTheme(savedTheme);
    }
  }, []);

  const toggleThemePanel = () => {
    setIsThemePanelOpen(!isThemePanelOpen);
  };

  return (
    <ThemeContext.Provider value={{
      currentTheme,
      setTheme,
      availableTeams,
      isThemePanelOpen,
      toggleThemePanel,
    }}>
      {children}
    </ThemeContext.Provider>
  );
};