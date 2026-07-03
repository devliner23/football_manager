// src/context/ManagedTeamContext.tsx
import React, { createContext, useContext } from 'react';
import { Team } from '../shared';

export interface ManagedTeamContextValue {
  savedGameId: string;
  managedClubId: string | null;
  userTeam: Team | undefined;
  userArchetype: string | null;
  loading: boolean;
}

const ManagedTeamContext = createContext<ManagedTeamContextValue | undefined>(undefined);

export const ManagedTeamProvider: React.FC<{
  value: ManagedTeamContextValue;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <ManagedTeamContext.Provider value={value}>
    {children}
  </ManagedTeamContext.Provider>
);

/**
 * Access the current save's managed team anywhere in the tree.
 * Must be called from a component rendered under <ManagedTeamProvider>.
 */
export const useManagedTeam = (): ManagedTeamContextValue => {
  const ctx = useContext(ManagedTeamContext);
  if (!ctx) {
    throw new Error('useManagedTeam must be used within a ManagedTeamProvider');
  }
  return ctx;
};

export default ManagedTeamContext;