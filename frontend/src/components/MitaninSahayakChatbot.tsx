import React, { useState, useEffect, useRef } from "react";
import {
  MessageSquareHeart,
  X,
  Send,
  Volume2,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Minimize2,
  Maximize2,
} from "lucide-react";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "../i18n/types";
import { useI18n } from "../i18n/I18nContext";
import { VoiceInputButton } from "./VoiceInputButton";
import { speakTextInLanguage, stopAllSpeech } from "../services/speechService";

const API_BASE = "http://127.0.0.1:8000";

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  language: SupportedLanguage;
  providerStatus?: string;
  requiresConfirmation?: boolean;
  pendingAction?: any;
  actionExecuted?: boolean;
  groundedSources?: string[];
  error?: boolean;
}

interface MitaninSahayakChatbotProps {
  authToken?: string | null;
  portalMode?: "public" | "field_employee" | "supervisor" | null;
  selectedLocation?: {
    district_id: string;
    block_id: string;
    village_id?: string | null;
  };
  focusedDisease?: "malaria" | "dengue" | "diarrhoea" | "heat";
  onActionExecuted?: () => void;
}

export const MitaninSahayakChatbot: React.FC<MitaninSahayakChatbotProps> = ({
  authToken,
  portalMode,
  selectedLocation,
  focusedDisease,
  onActionExecuted,
}) => {
  const { language: appLanguage, t } = useI18n();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [botLanguage, setBotLanguage] = useState<SupportedLanguage>(appLanguage);
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
  const [configInfo, setConfigInfo] = useState<any>(null);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Sync chatbot language when user changes app language
  useEffect(() => {
    setBotLanguage(appLanguage);
  }, [appLanguage]);

  // Fetch safe chatbot config
  useEffect(() => {
    fetch(`${API_BASE}/chatbot/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setConfigInfo(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const sendMessage = async (textToSend: string, confirmedActionPayload?: any) => {
    const trimmed = textToSend.trim();
    if (!trimmed && !confirmedActionPayload) return;

    setLoading(true);
    setLastFailedMessage(null);

    if (!confirmedActionPayload) {
      const userTurn: ChatTurn = {
        id: `u_${Date.now()}`,
        role: "user",
        content: trimmed,
        language: botLanguage,
      };
      setMessages((prev) => [...prev, userTurn]);
      setInput("");
    }

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      const historyPayload = messages
        .filter((m) => !m.error)
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch(`${API_BASE}/chatbot/message`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: trimmed || "Confirm action",
          language: botLanguage,
          district_id: selectedLocation?.district_id || "DIST_SAMPLE",
          block_id: selectedLocation?.block_id || "BLK_A",
          village_id: selectedLocation?.village_id || null,
          disease_type: focusedDisease || null,
          history: historyPayload,
          confirmed_action: confirmedActionPayload || null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const detail = errData.detail || `Request failed with status ${res.status}`;
        setLastFailedMessage(trimmed);
        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: "assistant",
            content: detail,
            language: botLanguage,
            error: true,
          },
        ]);
        setLoading(false);
        return;
      }

      const data = await res.json();
      const botTurn: ChatTurn = {
        id: `a_${Date.now()}`,
        role: "assistant",
        content: data.reply,
        language: data.language || botLanguage,
        providerStatus: data.provider_status,
        requiresConfirmation: data.requires_confirmation,
        pendingAction: data.pending_action,
        actionExecuted: data.action_executed,
        groundedSources: data.grounded_sources,
      };
      setMessages((prev) => [...prev, botTurn]);

      if (data.action_executed && onActionExecuted) {
        onActionExecuted();
      }
    } catch {
      setLastFailedMessage(trimmed);
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: "assistant",
          content:
            botLanguage === "hi"
              ? "चैटबॉट सेवा से संपर्क नहीं हो सका। कृपया पुनः प्रयास (Retry) करें।"
              : botLanguage === "hne"
              ? "मितानीन सहायक सर्वर ले अभी जुड़ाव नइ हो पाइस। किरपा करके फेर ले कोसिस (Retry) करव।"
              : "Could not reach Mitanin Sahayak backend service. Please click Retry.",
          language: botLanguage,
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPendingAction = (turn: ChatTurn) => {
    if (!turn.pendingAction) return;
    sendMessage(
      `Confirmed: ${turn.pendingAction.action_type}`,
      {
        action_type: turn.pendingAction.action_type,
        confirmed: true,
        task_id: turn.pendingAction.task_id,
        new_status: turn.pendingAction.new_status,
        notes: "Confirmed by user in Mitanin Sahayak chat.",
      }
    );
  };

  const getSuggestedQuestions = (): string[] => {
    const suggestions: string[] = [
      t("chatbot.suggested_q1_public"),
      t("chatbot.suggested_q2_public"),
      t("chatbot.suggested_q3_public"),
      t("chatbot.suggested_q4_public"),
    ];
    if (portalMode === "field_employee") {
      return [
        t("chatbot.suggested_q1_employee"),
        t("chatbot.suggested_q2_employee"),
        t("chatbot.suggested_q3_employee"),
        t("chatbot.suggested_q1_public"),
      ];
    }
    if (portalMode === "supervisor") {
      return [
        t("chatbot.suggested_q1_supervisor"),
        t("chatbot.suggested_q2_supervisor"),
        t("chatbot.suggested_q1_public"),
      ];
    }
    return suggestions;
  };

  const statusNotice =
    configInfo?.status_message?.[botLanguage] ||
    configInfo?.status_message?.en ||
    "Grounded in verified Mitanin Signal records.";

  return (
    <>
      {/* Floating Launcher Button */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label={t("chatbot.open_btn")}
          data-testid="mitanin-sahayak-launcher"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-full bg-teal-800 hover:bg-teal-900 text-white font-bold shadow-xl border-2 border-teal-300 cursor-pointer transition-transform hover:scale-105"
        >
          <MessageSquareHeart className="w-5 h-5 text-teal-200" />
          <span className="text-sm">{t("chatbot.name")}</span>
          <span className="px-2 py-0.5 rounded-full bg-teal-600 text-[11px] font-extrabold">
            EN · हिं · छग
          </span>
        </button>
      )}

      {/* Dockable / Expandable Chatbot Window */}
      {isOpen && (
        <div
          className={`fixed z-50 bg-white border-2 border-teal-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all ${
            isExpanded
              ? "bottom-4 right-4 left-4 top-16 sm:left-auto sm:w-[640px] sm:h-[82vh]"
              : "bottom-4 right-4 w-[94vw] sm:w-[430px] h-[600px] max-h-[85vh]"
          }`}
          role="dialog"
          aria-label={t("chatbot.name")}
          data-testid="mitanin-sahayak-window"
        >
          {/* Header */}
          <div className="bg-teal-900 text-white px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-teal-700/80 border border-teal-400/40">
                <MessageSquareHeart className="w-5 h-5 text-teal-200" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-extrabold leading-tight">
                  {t("chatbot.name")}
                </h2>
                <p className="text-[11px] text-teal-200">{t("chatbot.subtitle")}</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsExpanded((v) => !v)}
                aria-label="Toggle chatbot size"
                className="p-1.5 rounded-lg hover:bg-teal-800 text-teal-100 cursor-pointer"
              >
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  stopAllSpeech();
                  setIsOpen(false);
                }}
                aria-label="Close Mitanin Sahayak"
                data-testid="mitanin-sahayak-close"
                className="p-1.5 rounded-lg hover:bg-teal-800 text-teal-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Independent Chatbot Language Switcher & Provider Status Bar */}
          <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700">
                {t("chatbot.lang_selector_label")}:
              </span>
              <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-0.5">
                {SUPPORTED_LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => setBotLanguage(l.code)}
                    aria-pressed={botLanguage === l.code}
                    data-testid={`chatbot-lang-${l.code}`}
                    className={`px-2 py-0.5 rounded text-xs font-bold cursor-pointer ${
                      botLanguage === l.code
                        ? "bg-teal-700 text-white"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {l.nativeName}
                  </button>
                ))}
              </div>
            </div>

            {/* Configuration & Grounding Status Notice */}
            <div
              className="flex items-start gap-1.5 text-[11px] text-slate-600 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5"
              data-testid="chatbot-config-banner"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-teal-700 shrink-0 mt-0.5" />
              <span>{statusNotice}</span>
            </div>
          </div>

          {/* Conversation Messages Area */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50/50">
            {/* Suggested Questions when empty */}
            {messages.length === 0 && (
              <div className="space-y-2.5">
                <div className="rounded-xl bg-teal-50 border border-teal-200 p-3 text-xs sm:text-sm text-teal-950">
                  <div className="font-bold flex items-center gap-1.5 mb-1">
                    <Sparkles className="w-4 h-4 text-teal-700" />
                    <span>
                      {botLanguage === "hi"
                        ? "नमस्ते! मैं मितानिन सहायक हूँ।"
                        : botLanguage === "hne"
                        ? "जय जोहार संगवारी! मैं मितानीन सहायक हंव।"
                        : "Hello! I am Mitanin Sahayak."}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700">
                    {botLanguage === "hi"
                      ? "आप मुझसे अपने गाँव के मलेरिया, डेंगू, दस्त या लू जोखिम, बचाव के उपाय और आवंटित फील्ड कार्यों के बारे में पूछ सकते हैं।"
                      : botLanguage === "hne"
                      ? "आप मन मोला अपन गाँव के मलेरिया, डेंगू, टट्टी-उल्टी या घाम-लू के खतरा, बचाव अउ मिले फील्ड बूता के बारे मं पूछ सकथव।"
                      : "Ask me about malaria, dengue, diarrhoeal disease, heat-safety measures, or your assigned field tasks."}
                  </p>
                </div>

                <div className="space-y-1.5">
                  {getSuggestedQuestions().map((q, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => sendMessage(q)}
                      data-testid={`chatbot-suggested-q-${idx}`}
                      className="w-full text-left px-3 py-2 rounded-xl bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-300 text-xs font-semibold text-slate-800 transition-colors cursor-pointer"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((turn) => (
              <div
                key={turn.id}
                className={`flex flex-col ${
                  turn.role === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm whitespace-pre-line leading-relaxed ${
                    turn.role === "user"
                      ? "bg-teal-800 text-white rounded-br-xs"
                      : turn.error
                      ? "bg-rose-50 border border-rose-300 text-rose-900"
                      : "bg-white border border-slate-200 text-slate-900 shadow-2xs rounded-bl-xs"
                  }`}
                >
                  {turn.content}

                  {/* Assistant Footer: Read Aloud + Grounding Badge */}
                  {turn.role === "assistant" && !turn.error && (
                    <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded">
                        {t("chatbot.grounded_badge")}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          speakTextInLanguage(turn.content, turn.language, 1.0, {})
                        }
                        aria-label="Read reply aloud"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 hover:text-teal-900 cursor-pointer"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>{t("voice.play")}</span>
                      </button>
                    </div>
                  )}

                  {/* Explicit Confirmation Gate UI for Consequential Actions */}
                  {turn.requiresConfirmation && turn.pendingAction && (
                    <div
                      className="mt-2.5 p-2.5 rounded-xl bg-amber-50 border border-amber-300 space-y-2"
                      data-testid="chatbot-confirmation-box"
                    >
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleConfirmPendingAction(turn)}
                          data-testid="chatbot-confirm-action-btn"
                          className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
                          {t("chatbot.confirm_action_btn")}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Retry Button on Error */}
                  {turn.error && lastFailedMessage && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => sendMessage(lastFailedMessage)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-700 text-white text-xs font-bold cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>{t("chatbot.retry")}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2 inline-block">
                Mitanin Sahayak is retrieving grounded records...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area with Voice Dictation */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="p-3 bg-white border-t border-slate-200 space-y-2"
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t("chatbot.placeholder")}
                aria-label={t("chatbot.placeholder")}
                data-testid="chatbot-input"
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm focus:border-teal-700 focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label={t("chatbot.send")}
                data-testid="chatbot-send-btn"
                className="px-3.5 py-2 rounded-xl bg-teal-800 hover:bg-teal-900 disabled:opacity-50 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>{t("chatbot.send")}</span>
              </button>
            </div>
            <div className="flex items-center justify-between">
              <VoiceInputButton
                languageOverride={botLanguage}
                onTranscript={(spoken) =>
                  setInput((prev) => (prev ? `${prev} ${spoken}` : spoken))
                }
              />
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMessages([])}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  {t("chatbot.clear")}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  );
};
