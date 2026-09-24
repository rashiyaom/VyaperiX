import React, { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { AnimatePresence } from "framer-motion";
import { useChatWidget } from "./ChatWidgetProvider";
import { ChatLauncher } from "./ChatLauncher";
import { ChatPanel } from "./ChatPanel";

export const HIDDEN_ROUTES = ["/", "/login", "/onboarding"];

export function ChatWidget() {
  const { isOpen, toggle } = useChatWidget();

  // Inspect current route pathname reactively
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  // Check if current route should hide the chat widget
  const isHidden = HIDDEN_ROUTES.some(
    (route) => pathname === route || (route !== "/" && pathname.startsWith(route)),
  );

  // Global keyboard shortcut: Ctrl+K / Cmd+K to toggle chat
  useEffect(() => {
    if (isHidden) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        // If focusing a form control other than the chat input, allow toggle or keep normal
        const activeTag = document.activeElement?.tagName.toLowerCase();
        const activeIsChat = (document.activeElement as HTMLElement)?.closest("#vyaperix-chat-panel");

        if (activeTag === "input" || activeTag === "textarea") {
          if (!activeIsChat) {
            // allow toggle anyway
            e.preventDefault();
            toggle();
            return;
          }
        } else {
          e.preventDefault();
          toggle();
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isHidden, toggle]);

  if (isHidden) {
    return null;
  }

  return (
    <>
      <ChatLauncher />
      <AnimatePresence>{isOpen && <ChatPanel />}</AnimatePresence>
    </>
  );
}
