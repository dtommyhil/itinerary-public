'use client';
import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

type CardState = { expanded: boolean; draft: string };
type Change = Partial<CardState> | ((current: CardState) => Partial<CardState>);
const empty: CardState = { expanded: false, draft: '' };
function createStore() {
  const states = new Map<string, CardState>();
  const listeners = new Map<string, Set<() => void>>();
  return {
    read: (key: string, fallback = empty) => states.get(key) ?? fallback,
    subscribe(key: string, listener: () => void) {
      const group = listeners.get(key) ?? new Set();
      group.add(listener);
      listeners.set(key, group);
      return () => {
        group.delete(listener);
        if (!group.size) listeners.delete(key);
      };
    },
    update(key: string, change: Change, fallback = empty) {
      const previous = states.get(key) ?? fallback;
      const next = {
        ...previous,
        ...(typeof change === 'function' ? change(previous) : change),
      };
      if (next.expanded === previous.expanded && next.draft === previous.draft)
        return;
      states.set(key, next);
      listeners.get(key)?.forEach((listener) => listener());
    },
  };
}
const Context = createContext<ReturnType<typeof createStore> | null>(null);
/** Drafts and expansion live for this trip view, including moves between days. */
export function TripCardState({ children }: { children: ReactNode }) {
  const [store] = useState(createStore);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useCardState(key: string, defaults?: Partial<CardState>) {
  const provided = useContext(Context);
  const [fallback] = useState(createStore);
  const [initial] = useState(() => ({ ...empty, ...defaults }));
  const store = provided ?? fallback;
  const state = useSyncExternalStore(
    (listener) => store.subscribe(key, listener),
    () => store.read(key, initial),
    () => initial,
  );
  return [
    state,
    (change: Change) => store.update(key, change, initial),
  ] as const;
}
