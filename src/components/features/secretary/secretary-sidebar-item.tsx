/* eslint-disable i18next/no-literal-string -- prototype rail item (smolpaws-s9e.8);
   labels not yet lifted into the 15-language i18n bundle. */
import React from "react";
import { useNavigation } from "#/context/navigation-context";
import { cn } from "#/utils/utils";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";
import { SidebarCollapsedIconSlot } from "../sidebar/sidebar-collapsed-icon-slot";
import {
  SIDEBAR_ICON_SLOT_CLASS,
  SIDEBAR_ROW_INTERACTIVE_CLASS,
  sidebarNavLabelClassName,
  sidebarNavRowClassName,
} from "../sidebar/sidebar-layout";
import { SecretaryCatIcon } from "./secretary-cat-icon";
import { useSecretaryContext } from "./use-secretary-context";
import { useSecretaryVoice } from "./use-secretary-voice";

const DOUBLE_CLICK_MS = 250;

/**
 * The "Secretary" rail entry, sitting above New Chat.
 * - single click → start/stop realtime voice (the cat answers by voice, knowing
 *   which conversation or page the user is on)
 * - double click → open the Secretary view (`/secretary`)
 *
 * A short timer disambiguates the two: a second click within the window cancels
 * the pending voice toggle and navigates instead.
 */
export function SecretarySidebarItem({ collapsed }: { collapsed: boolean }) {
  const { navigate } = useNavigation();
  const ctx = useSecretaryContext();
  const voice = useSecretaryVoice({ getContextPhrase: () => ctx.phrase });
  const clickTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = voice.state === "live" || voice.state === "connecting";

  const handleClick = () => {
    if (clickTimer.current) return; // second click handled by dblclick
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      voice.toggle();
    }, DOUBLE_CLICK_MS);
  };

  const handleDoubleClick = () => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    // Carry the current context into the view (there's no conversation route
    // param on /secretary, so the open conversation id/title ride as query).
    const params = new URLSearchParams();
    if (ctx.conversationId) params.set("cid", ctx.conversationId);
    if (ctx.conversationTitle) params.set("title", ctx.conversationTitle);
    const qs = params.toString();
    navigate(qs ? `/secretary?${qs}` : "/secretary");
  };

  const label =
    voice.state === "live"
      ? "Secretary · listening"
      : voice.state === "connecting"
        ? "Secretary · connecting"
        : "Secretary";

  const icon = <SecretaryCatIcon />;

  const button = (
    <button
      type="button"
      data-testid="sidebar-secretary-item"
      aria-label={collapsed ? "Secretary" : undefined}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      className={cn(
        sidebarNavRowClassName({ collapsed }),
        !collapsed &&
          (active
            ? SIDEBAR_ROW_INTERACTIVE_CLASS.active
            : SIDEBAR_ROW_INTERACTIVE_CLASS.idle),
        active && collapsed && "text-white",
      )}
    >
      {collapsed ? (
        <SidebarCollapsedIconSlot active={active}>
          {icon}
        </SidebarCollapsedIconSlot>
      ) : (
        <span className={SIDEBAR_ICON_SLOT_CLASS}>{icon}</span>
      )}
      <span className={sidebarNavLabelClassName(collapsed)}>{label}</span>
    </button>
  );

  if (!collapsed) return button;

  return (
    <StyledTooltip
      content="Secretary — click to talk, double-click to open"
      placement="right"
    >
      {button}
    </StyledTooltip>
  );
}
