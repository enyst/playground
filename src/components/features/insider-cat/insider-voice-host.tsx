import React from "react";
import { useLocation, useNavigate } from "react-router";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { useSkinStatus } from "#/hooks/query/use-skin";
import { useInsiderVoice } from "./use-insider-voice";
import { useInsiderVoiceStore } from "./insider-voice-store";
import { describeLocation } from "./insider-location";
import {
  handleCanvasControl,
  postToBoard,
  type CanvasControlAction,
  type VoiceConversation,
} from "./canvas-voice-control";

/**
 * Owns the single realtime-voice session and keeps it alive across navigation.
 *
 * Mounted exactly once in the persistent app shell (root.tsx). It runs the
 * voice hook and mirrors its state + `toggle` into {@link useInsiderVoiceStore}
 * so any cat avatar can drive and reflect the session without owning it. It
 * renders nothing — the only DOM the session needs (an <audio> element) lives
 * inside the hook.
 */
export function InsiderVoiceHost() {
  const location = useLocation();
  const locationRef = React.useRef(location.pathname);
  locationRef.current = location.pathname;

  const navigate = useNavigate();

  const { data: skinStatus } = useSkinStatus();
  const available = Boolean(skinStatus?.installed);

  // Bridge the voice model's `control_canvas` tool to real Canvas actions. The
  // deps close over the router here (where hooks are legal); the dispatch logic
  // itself lives in the pure, unit-tested handleCanvasControl.
  const onControl = React.useCallback(
    (args: Record<string, unknown>) =>
      handleCanvasControl(args as unknown as CanvasControlAction, {
        promptBox: (command, mode, text) =>
          postToBoard(command, { mode, text }),
        listConversations: async () => {
          const page =
            await AgentServerConversationService.searchConversations(20);
          return page.items.map(
            (c): VoiceConversation => ({
              id: c.id,
              title: c.title ?? "(untitled)",
              status: c.execution_status ?? "unknown",
            }),
          );
        },
        openConversation: (id) => navigate(`/conversations/${id}`),
      }),
    [navigate],
  );

  const voice = useInsiderVoice({
    getContext: () => describeLocation(locationRef.current),
    onControl,
  });

  const sync = useInsiderVoiceStore((s) => s.sync);
  React.useEffect(() => {
    sync({
      state: voice.state,
      error: voice.error,
      available,
      toggle: voice.toggle,
    });
  }, [voice.state, voice.error, voice.toggle, available, sync]);

  return null;
}
