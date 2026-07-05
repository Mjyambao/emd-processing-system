import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import AIAgentsDock from "./AIAgentsDock";

export default function AIAgentsDockPortal() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed bottom-6 right-6 z-[9999] pointer-events-auto">
      <AIAgentsDock />
    </div>,
    document.body,
  );
}
