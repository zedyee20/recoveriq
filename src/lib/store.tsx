import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { deviceCurrency, deviceRegion } from './currency';
import type { Claim, Profile } from './types';

const STORAGE_KEY = 'recoveriq/v1';

interface PersistedState {
  claims: Claim[];
  profile: Profile;
  onboarded: boolean;
}

const DEFAULT_STATE: PersistedState = {
  claims: [],
  profile: { fullName: '', email: '', plan: 'free', currency: deviceCurrency(), region: deviceRegion() },
  onboarded: false,
};

export const FREE_ACTIVE_CLAIM_LIMIT = 3;

interface Store extends PersistedState {
  ready: boolean;
  addClaim: (claim: Claim) => void;
  updateClaim: (id: string, fn: (c: Claim) => Claim) => void;
  removeClaim: (id: string) => void;
  setProfile: (p: Partial<Profile>) => void;
  setOnboarded: (v: boolean) => void;
  resetAll: () => void;
  getClaim: (id: string) => Claim | undefined;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<PersistedState>;
          setState({ ...DEFAULT_STATE, ...parsed, profile: { ...DEFAULT_STATE.profile, ...parsed.profile } });
        }
      })
      .catch((e) => console.warn('Failed to load saved claims', e))
      .finally(() => {
        loaded.current = true;
        setReady(true);
      });
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch((e) => console.warn('Failed to save claims', e));
  }, [state]);

  const addClaim = useCallback((claim: Claim) => setState((s) => ({ ...s, claims: [claim, ...s.claims] })), []);
  const updateClaim = useCallback(
    (id: string, fn: (c: Claim) => Claim) =>
      setState((s) => ({ ...s, claims: s.claims.map((c) => (c.id === id ? fn(c) : c)) })),
    [],
  );
  const removeClaim = useCallback((id: string) => setState((s) => ({ ...s, claims: s.claims.filter((c) => c.id !== id) })), []);
  const setProfile = useCallback((p: Partial<Profile>) => setState((s) => ({ ...s, profile: { ...s.profile, ...p } })), []);
  const setOnboarded = useCallback((v: boolean) => setState((s) => ({ ...s, onboarded: v })), []);
  const resetAll = useCallback(() => setState({ ...DEFAULT_STATE, onboarded: true }), []);

  const value = useMemo<Store>(
    () => ({
      ...state,
      ready,
      addClaim,
      updateClaim,
      removeClaim,
      setProfile,
      setOnboarded,
      resetAll,
      getClaim: (id) => state.claims.find((c) => c.id === id),
    }),
    [state, ready, addClaim, updateClaim, removeClaim, setProfile, setOnboarded, resetAll],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

export function activeClaimCount(claims: Claim[]): number {
  return claims.filter((c) => c.status === 'draft' || c.status === 'active').length;
}
