import { useTranslation } from "react-i18next";
import AllHandsLogo from "#/assets/branding/all-hands-logo.svg?react";
import { I18nKey } from "#/i18n/declaration";
import { TooltipButton } from "./tooltip-button";

export function AllHandsLogoButton() {
  const { t } = useTranslation();

  return (
    <TooltipButton
      tooltip={"OpenHands"}
      ariaLabel={t(I18nKey.BRANDING$ALL_HANDS_LOGO)}
      href="https://github.com/All-Hands-AI/OpenHands/blob/main/community.md"
    >
      <AllHandsLogo width={46} height={30} />
    </TooltipButton>
  );
}
