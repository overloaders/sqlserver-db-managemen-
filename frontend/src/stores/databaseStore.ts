import { create } from 'zustand';

interface DatabaseState {
  currentDatabase: string | null;
  setCurrentDatabase: (database: string | null) => void;
}

export const useDatabaseStore = create<DatabaseState>((set) => ({
  currentDatabase: null,
  setCurrentDatabase: (database) => set({ currentDatabase: database }),
}));