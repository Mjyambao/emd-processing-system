import { useEffect, useRef, useState } from "react";

// API
import { processingAgentChat } from "../api/chatApi";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function nowTs() {
  return Date.now();
}

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function newId(prefix = "m") {
  return (
    crypto.randomUUID?.() ??
    `${prefix}-${nowTs()}-${Math.random().toString(16).slice(2)}`
  );
}

// ---- localStorage helpers (safe for SSR) ----
const STORAGE_KEYS = {
  processing: "chat_history_processing",
  admin: "chat_history_admin",
};

function loadHistory(agentId) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS[agentId]);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveHistory(agentId, messages) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEYS[agentId],
      JSON.stringify(messages),
    );
  } catch {
    // ignore storage quota or private mode errors
  }
}

function clearHistory(agentId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEYS[agentId]);
  } catch {
    // ignore
  }
}

function buildDefaultMessages(agentId) {
  if (agentId === "processing") {
    return [
      {
        id: newId("w"),
        role: "assistant",
        text: "Hi — I’m Processing Agent. Ask about SSR/RFIC-RFISC alignment, deal matching, issuance, or queue triage.",
        ts: nowTs(),
        status: "delivered",
      },
    ];
  }

  return [
    {
      id: newId("w"),
      role: "assistant",
      text: "Hello — I’m Admin Agent. Ask about ops checks, reporting contract readiness, access/session, or governance metrics.",
      ts: nowTs(),
      status: "delivered",
    },
  ];
}

const SAMPLE_PROMPTS = {
  processing: [
    "Explain why deal match failed and suggest next action.",
    "PNR is HUMAN_INPUT_REQUIRED — what are the top 3 checks before approving?",
    "SSR shows XBAG but RFISC mapping looks off. What should I validate?",
    "Give a checklist to validate EMD coupon association per segment.",
    "Summarize this case in 3 bullets and recommend Approve vs Route to Human vs Error.",
  ],
  admin: [
    "What fields should the backend return so the AI can explain processing errors accurately?",
    "Define KPIs for throughput, aging, exception rate, and human-touch rate.",
    "Suggest an error taxonomy for deal-matching vs validation vs issuance vs dependency failures.",
    "What should we log for auditability (human-in-the-loop + overrides)?",
    "Give an ops runbook outline for common PNR processing failures.",
  ],
};

async function sendMessageToAgent({ agentId, messages, userText }) {
  const agentType = agentId === "admin" ? "admin" : "processing";
  const conversationId = localStorage.getItem("conversation_id");

  const payload = {
    agent_type: agentType,
    message: userText,
  };

  const res = await processingAgentChat(conversationId, payload);

  console.log("Chat Response: ", res);

  if (!res.success) {
    const msg =
      res?.message ||
      `Request failed (${res.status}${res.statusText ? ` ${res.statusText}` : ""}).`;
    throw new Error(msg);
  }

  return {
    text: res?.message ?? "",
    meta: {
      api: true,
      agent_type: res?.agent_type,
    },
  };
}

function BubbleButton({ title, iconClass, accentClass, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "pointer-events-auto",
        "h-12 w-12 rounded-full shadow-lg",
        "border border-black/10",
        "flex items-center justify-center",
        accentClass,
        "text-white hover:brightness-95",
        "focus:outline-none focus:ring-1 focus:ring-black/30",
      )}
      aria-label={title}
      title={title}
    >
      <i className={iconClass}></i>
    </button>
  );
}

function ConfirmModal({
  open,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}) {
  const dialogRef = useRef(null);
  const confirmBtnRef = useRef(null);

  // Focus management + ESC to close
  useEffect(() => {
    if (!open) return;

    // Focus confirm by default for speed; change to cancel if you prefer
    const t = setTimeout(() => confirmBtnRef.current?.focus(), 0);

    function onKeyDown(e) {
      if (e.key === "Escape") onCancel?.();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onCancel}
        aria-label="Close modal"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-[92vw] max-w-[360px] rounded-md bg-white shadow-2xl border border-black/10 overflow-hidden"
      >
        <div className="px-4 py-3 border-b bg-gradient-to-r from-white to-black/[0.03]">
          <div className="text-lg font-semibold text-black">{title}</div>
          {description ? (
            <div className="mt-1 text-sm text-black/60">{description}</div>
          ) : null}
        </div>

        <div className="px-4 py-3">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-3 py-2 text-[15px] font-semibold border border-black/30 bg-black/5 hover:bg-black/20 focus:outline-none focus:ring-1 focus:ring-black/30"
            >
              {cancelText}
            </button>

            <button
              ref={confirmBtnRef}
              type="button"
              onClick={onConfirm}
              className={cx(
                "rounded-md px-3 py-2 text-[15px] font-semibold",
                danger
                  ? "bg-red-600 text-white hover:bg-red-800"
                  : "bg-brand-red text-white hover:brightness-95",
              )}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatPanel({
  activeAgent,
  setActiveAgent,
  onClose,
  onClearActive,
  histories,
  setHistories,
  inputs,
  setInputs,
  getProcessingContext,
  getAdminContext,
}) {
  const agentId = activeAgent;

  const agentName =
    agentId === "processing" ? "Processing Agent" : "Admin Agent";

  const agentIconClass =
    agentId === "processing"
      ? "fa-solid fa-diagram-project"
      : "fa-solid fa-user-tie";

  const accentClass =
    agentId === "processing" ? "bg-emerald-600" : "bg-indigo-600";

  const messages = histories[agentId] ?? [];
  const input = inputs[agentId] ?? "";

  const [sendingByAgent, setSendingByAgent] = useState({
    processing: false,
    admin: false,
  });
  const scrollRef = useRef(null);

  // ---- Typing animation refs ----
  const typingTimersRef = useRef({
    processing: null,
    admin: null,
  });
  const typingSessionsRef = useRef({
    processing: 0,
    admin: 0,
  });

  function stopTyping(targetAgent = agentId) {
    if (typingTimersRef.current[targetAgent]) {
      clearInterval(typingTimersRef.current[targetAgent]);
      typingTimersRef.current[targetAgent] = null;
    }
  }

  // Word-by-word tokenizer preserving whitespace/newlines (word + trailing whitespace)
  function tokenizeWordsWithWhitespace(text) {
    const parts = text?.match(/\S+\s*/g);
    return parts && parts.length ? parts : [text ?? ""]; // fallback
  }

  // Typewriter animation
  function typeIntoMessageWordByWord({
    placeholderId,
    fullText,
    agentId,
    meta,
  }) {
    stopTyping(agentId);

    typingSessionsRef.current[agentId] += 1;
    const sessionId = typingSessionsRef.current[agentId];

    const BASE_DELAY_MS = 55;
    const WORDS_PER_TICK_MIN = 1;
    const WORDS_PER_TICK_MAX = 2;

    const parts = tokenizeWordsWithWhitespace(fullText);
    let i = 0;

    typingTimersRef.current[agentId] = setInterval(() => {
      if (typingSessionsRef.current[agentId] !== sessionId) {
        stopTyping(agentId);
        return;
      }

      const step =
        WORDS_PER_TICK_MIN +
        Math.floor(
          Math.random() * (WORDS_PER_TICK_MAX - WORDS_PER_TICK_MIN + 1),
        );

      i = Math.min(parts.length, i + step);

      const done = i >= parts.length;
      const partial = parts.slice(0, i).join("") + (done ? "" : " ▍");

      setHistories((prev) => {
        const next = { ...prev };
        const list = Array.isArray(next[agentId]) ? [...next[agentId]] : [];

        next[agentId] = list.map((m) =>
          m.id === placeholderId
            ? {
                ...m,
                text: partial,
                ts: nowTs(),
                status: done ? "delivered" : "sent",
                meta,
              }
            : m,
        );

        return next;
      });

      if (done) stopTyping(agentId);
    }, BASE_DELAY_MS);
  }

  // Cleanup timers on unmount + stop typing when switching agents
  useEffect(() => {
    return () => {
      stopTyping("processing");
      stopTyping("admin");
    };
  }, []);

  // Auto-scroll on message change
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function updateInput(val) {
    setInputs((prev) => ({ ...prev, [agentId]: val }));
  }

  function onKeyDown(e) {
    // Multiline supported: Shift+Enter inserts newline; Enter sends
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function send() {
    const targetAgent = agentId;
    const userText = (inputs[targetAgent] ?? "").trim();

    if (!userText || sendingByAgent[targetAgent]) return;

    // Stop typing only for the current target agent
    stopTyping(targetAgent);

    const userMsg = {
      id: newId("u"),
      role: "user",
      text: userText,
      ts: nowTs(),
      status: "sent",
    };

    const placeholderId = newId("a");
    const placeholder = {
      id: placeholderId,
      role: "assistant",
      text: "Typing…",
      ts: nowTs(),
      status: "sent",
      meta: { placeholder: true },
    };

    setHistories((prev) => {
      const next = { ...prev };
      const list = Array.isArray(next[targetAgent])
        ? [...next[targetAgent]]
        : [];

      list.push(userMsg, placeholder);
      next[targetAgent] = list.slice(-80);

      return next;
    });

    setInputs((prev) => ({
      ...prev,
      [targetAgent]: "",
    }));

    setSendingByAgent((prev) => ({
      ...prev,
      [targetAgent]: true,
    }));

    try {
      const context =
        targetAgent === "processing"
          ? typeof getProcessingContext === "function"
            ? getProcessingContext()
            : undefined
          : typeof getAdminContext === "function"
            ? getAdminContext()
            : undefined;

      const res = await sendMessageToAgent({
        agentId: targetAgent,
        messages: histories[targetAgent] ?? [],
        userText,
        context,
      });

      const fullText = res?.text ?? "No response.";
      const meta = res?.meta;

      setHistories((prev) => {
        const next = { ...prev };
        const list = Array.isArray(next[targetAgent])
          ? [...next[targetAgent]]
          : [];

        next[targetAgent] = list
          .map((m) =>
            m.id === placeholderId
              ? {
                  ...m,
                  text: "",
                  ts: nowTs(),
                  status: "sent",
                  meta,
                }
              : m,
          )
          .slice(-80);

        return next;
      });

      typeIntoMessageWordByWord({
        placeholderId,
        fullText,
        agentId: targetAgent,
        meta,
      });
    } catch (err) {
      setHistories((prev) => {
        const next = { ...prev };
        const list = Array.isArray(next[targetAgent])
          ? [...next[targetAgent]]
          : [];

        next[targetAgent] = list
          .map((m) =>
            m.id === placeholderId
              ? {
                  ...m,
                  text: "Sorry something went wrong.",
                  ts: nowTs(),
                  status: "error",
                  meta: { error: String(err?.message ?? err) },
                }
              : m,
          )
          .slice(-80);

        return next;
      });
    } finally {
      setSendingByAgent((prev) => ({
        ...prev,
        [targetAgent]: false,
      }));
    }
  }

  // Show quick prompts when chat is fresh (only welcome msg or empty)
  const showPromptChips = (messages ?? []).length <= 1;

  // Render prompt chips BELOW the initial message (not above)
  const firstMsg = messages?.[0];
  const restMsgs = (messages ?? []).slice(1);

  return (
    <section
      className={cx(
        "pointer-events-auto w-[310px] rounded-2xl border border-black/10 bg-white shadow-xl overflow-hidden",
      )}
      aria-label="AI chat panel"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-white to-black/[0.03]">
        <span
          className={cx(
            "inline-flex h-8 w-8 items-center justify-center rounded-full text-white",
            accentClass,
          )}
          aria-hidden="true"
        >
          <i className={agentIconClass}></i>
        </span>

        <div className="flex-1">
          <div className="text-sm font-semibold text-black">{agentName}</div>
          <div className="text-xs text-black/60">Explainer mode</div>
        </div>

        {/* Clear chat */}
        <button
          type="button"
          onClick={onClearActive}
          className="inline-flex items-center justify-center rounded-lg px-2 py-2 text-black/60 hover:bg-black/5 focus:outline-none focus:ring-1 focus:ring-black/30"
          aria-label="Clear chat"
          title="Clear chat"
        >
          {/* NOTE: kept your latest trash icon */}
          <i className="fa-solid fa-trash-can"></i>
        </button>

        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center rounded-lg px-2 py-2 text-black/60 hover:bg-black/5 focus:outline-none focus:ring-1 focus:ring-black/30"
          aria-label="Close chat"
          title="Close"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>

      {/* Agent switch pills */}
      <div className="px-3 pt-2 mb-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveAgent("processing")}
            className={cx(
              "flex-1 rounded-xl px-3 py-2 text-xs font-semibold border",
              activeAgent === "processing"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-white text-black/70 border-black/10 hover:bg-black/[0.02]",
            )}
          >
            <i className="fa-solid fa-diagram-project mr-1"></i> Processing
            {sendingByAgent.processing ? (
              <i className="fa-solid fa-circle-notch animate-spin ml-2"></i>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => setActiveAgent("admin")}
            className={cx(
              "flex-1 rounded-xl px-3 py-2 text-xs font-semibold border",
              activeAgent === "admin"
                ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                : "bg-white text-black/70 border-black/10 hover:bg-black/[0.02]",
            )}
          >
            <i className="fa-solid fa-user-tie mr-1"></i> Admin
            {sendingByAgent.admin ? (
              <i className="fa-solid fa-circle-notch animate-spin ml-2"></i>
            ) : null}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="h-[220px] overflow-y-auto px-3 py-2 bg-white"
      >
        {/* 1) Render initial welcome message first */}
        {firstMsg && <MessageBubble msg={firstMsg} />}

        {/* 2) Then show quick prompt chips BELOW the initial message */}
        {showPromptChips && (
          <div className="mb-2">
            <div className="text-[11px] text-black/40 mb-1">Quick prompts:</div>
            <div className="flex flex-wrap gap-2">
              {(SAMPLE_PROMPTS[agentId] ?? []).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => updateInput(p)}
                  className="text-[11px] px-2 py-1 rounded-full border border-black/10 bg-white hover:bg-black/[0.02] text-black/70"
                  title="Click to insert into input"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 3) Render the rest of the conversation */}
        {restMsgs.map((m) => (
          <MessageBubble key={m.id} msg={m} />
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-black/10 p-2 bg-white">
        <div className="flex items-end gap-2">
          <textarea
            className={cx(
              "min-h-[42px] max-h-[140px] flex-1 resize-none rounded-xl",
              "border border-black/10 px-2 py-2 text-[13px]",
              "focus:outline-none focus:ring-1 focus:ring-black/30",
            )}
            placeholder="Type a message…"
            value={input}
            onChange={(e) => updateInput(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label={`Message ${agentName}`}
          />

          <button
            type="button"
            onClick={send}
            disabled={sendingByAgent[agentId] || !input.trim()}
            className={cx(
              "inline-flex items-center justify-center rounded-xl px-3 py-2 text-[13px] font-semibold",
              sendingByAgent[agentId] || !input.trim()
                ? "bg-black/10 text-black/40 cursor-not-allowed"
                : "bg-green-600 text-white hover:brightness-95",
            )}
            title="Send"
          >
            {sendingByAgent[agentId] ? (
              <i className="fa-solid fa-circle-notch animate-spin"></i>
            ) : (
              <i className="fa-solid fa-paper-plane"></i>
            )}
          </button>
        </div>

        <div className="mt-1 text-[11px] text-black/40">
          Enter to send • Shift+Enter for newline
        </div>
      </div>
    </section>
  );

  function MessageBubble({ msg }) {
    const isUser = msg.role === "user";
    const isPlaceholder = msg?.meta?.placeholder;

    return (
      <div
        className={cx("mb-2 flex", isUser ? "justify-end" : "justify-start")}
      >
        <div
          className={cx(
            "max-w-[88%] rounded-2xl px-3 py-2 text-[13px] whitespace-pre-wrap",
            isUser
              ? "bg-green-600 text-white rounded-br-lg"
              : "bg-black/5 text-black rounded-bl-lg",
            msg.status === "error" && "ring-1 ring-red-300",
          )}
        >
          <div className={cx(isPlaceholder && "animate-pulse")}>{msg.text}</div>
          <div
            className={cx(
              "mt-1 text-[10px]",
              isUser ? "text-white/80" : "text-black/40",
            )}
          >
            {formatTime(msg.ts)} {msg?.meta?.stub ? "• stub" : ""}
          </div>
        </div>
      </div>
    );
  }
}

export default function AIAgentsDock({
  getProcessingContext,
  getAdminContext,
  onOpenChange,
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeAgent, setActiveAgent] = useState("processing"); // "processing" | "admin"

  // Per-agent histories + per-agent input drafts
  const [histories, setHistories] = useState({
    processing: [],
    admin: [],
  });

  const [inputs, setInputs] = useState({
    processing: "",
    admin: "",
  });

  // Modal state for "Clear chat" confirmation
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [pendingClearAgent, setPendingClearAgent] = useState(null);

  // Load histories once on mount
  useEffect(() => {
    const p = loadHistory("processing");
    const a = loadHistory("admin");
    setHistories({
      processing: p && p.length ? p : buildDefaultMessages("processing"),
      admin: a && a.length ? a : buildDefaultMessages("admin"),
    });
  }, []);

  // Persist histories whenever they change
  useEffect(() => {
    saveHistory("processing", histories.processing ?? []);
    saveHistory("admin", histories.admin ?? []);
  }, [histories]);

  // Inform dashboard about open/close (for padding adjustments)
  useEffect(() => {
    if (typeof onOpenChange === "function") onOpenChange(panelOpen);
  }, [panelOpen, onOpenChange]);

  // Open modal instead of window.confirm (retains behavior, just new UI)
  function requestClearActiveChat() {
    setPendingClearAgent(activeAgent);
    setClearModalOpen(true);
  }

  // Perform the actual clear after confirmation
  function confirmClearChat() {
    const agentId = pendingClearAgent ?? activeAgent;
    clearHistory(agentId);
    setHistories((prev) => ({
      ...prev,
      [agentId]: buildDefaultMessages(agentId),
    }));
    setInputs((prev) => ({
      ...prev,
      [agentId]: "",
    }));
    setClearModalOpen(false);
    setPendingClearAgent(null);
  }

  function cancelClearChat() {
    setClearModalOpen(false);
    setPendingClearAgent(null);
  }

  const pendingLabel =
    (pendingClearAgent ?? activeAgent) === "processing"
      ? "Processing"
      : "Admin";

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] flex flex-col items-end gap-2"
      aria-label="AI Agents dock"
    >
      {/* Confirmation modal for clear chat */}
      <ConfirmModal
        open={clearModalOpen}
        title={`Clear ${pendingLabel} chat history?`}
        description="This will remove the current chat history stored in your browser for this agent and reset the conversation."
        confirmText="Clear"
        cancelText="Cancel"
        danger
        onConfirm={confirmClearChat}
        onCancel={cancelClearChat}
      />

      {/* Panel */}
      {panelOpen && (
        <ChatPanel
          activeAgent={activeAgent}
          setActiveAgent={setActiveAgent}
          onClose={() => setPanelOpen(false)}
          onClearActive={requestClearActiveChat}
          histories={histories}
          setHistories={setHistories}
          inputs={inputs}
          setInputs={setInputs}
          getProcessingContext={getProcessingContext}
          getAdminContext={getAdminContext}
        />
      )}

      {/* Bubble-only closed state */}
      {!panelOpen && (
        <div className="flex flex-col gap-2 items-end">
          <BubbleButton
            title="Processing Agent"
            iconClass="fa-solid fa-diagram-project"
            accentClass="bg-emerald-600"
            onClick={() => {
              setActiveAgent("processing");
              setPanelOpen(true);
            }}
          />

          <BubbleButton
            title="Admin Agent"
            iconClass="fa-solid fa-user-tie"
            accentClass="bg-indigo-600"
            onClick={() => {
              setActiveAgent("admin");
              setPanelOpen(true);
            }}
          />
        </div>
      )}

      {/* When panel open, keep bubbles for quick switching */}
      {panelOpen && (
        <div className="flex gap-2">
          <BubbleButton
            title="Switch to Processing Agent"
            iconClass="fa-solid fa-diagram-project"
            accentClass={cx(
              "bg-emerald-600",
              activeAgent === "processing" ? "ring-2 ring-emerald-200" : "",
            )}
            onClick={() => setActiveAgent("processing")}
          />

          <BubbleButton
            title="Switch to Admin Agent"
            iconClass="fa-solid fa-user-tie"
            accentClass={cx(
              "bg-indigo-600",
              activeAgent === "admin" ? "ring-2 ring-indigo-200" : "",
            )}
            onClick={() => setActiveAgent("admin")}
          />
        </div>
      )}
    </div>
  );
}
