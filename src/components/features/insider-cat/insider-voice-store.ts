import { create } from "zustand";
import type { InsiderVoiceState } from "./use-insider-voice";

/**
 * Shared handle on the single realtime-voice session.
 *
 * The voice session must outlive navigation, so it is owned by one always-
 * mounted host ({@link InsiderVoiceHost}) rather than by the cat overlay (which
 * unmounts when you enter a conversation). The host writes its live state and
 * `toggle` here; every cat avatar reads state for its glow and calls `toggle`
 * on tap. This keeps the session continuous while the visible cat can come and
 * go per route.
 */
interface InsiderVoiceStore {
  state: InsiderVoiceState;
  error: string | null;
  /** Available once a skin is installed to serve the voice endpoints. */
  available: boolean;
  toggle: () => void;
  sync: (partial: {
    state: InsiderVoiceState;
    error: string | null;
    available: boolean;
    toggle: () => void;
  }) => void;
}

export const useInsiderVoiceStore = create<InsiderVoiceStore>((set) => ({
  state: "idle",
  error: null,
  available: false,
  toggle: () => {},
  sync: (partial) => set(partial),
}));
