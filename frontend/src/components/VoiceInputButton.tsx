import React, { useState, useRef } from "react";
import { Mic, MicOff } from "lucide-react";
import type { SupportedLanguage } from "../i18n/types";
import { useI18n } from "../i18n/I18nContext";
import { startSpeechToText } from "../services/speechService";

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  languageOverride?: SupportedLanguage;
  className?: string;
  size?: "sm" | "md";
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  onTranscript,
  languageOverride,
  className = "",
  size = "sm",
}) => {
  const { language, t } = useI18n();
  const activeLang = languageOverride || language;
  const [listening, setListening] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const controllerRef = useRef<{ stop: () => void } | null>(null);

  const handleToggle = () => {
    if (listening) {
      controllerRef.current?.stop();
      setListening(false);
      return;
    }

    setNotice(null);
    const session = startSpeechToText(activeLang, {
      onResult: (transcript) => {
        onTranscript(transcript);
        setListening(false);
      },
      onError: (msg) => {
        setNotice(msg);
        setListening(false);
      },
      onEnd: () => {
        setListening(false);
      },
    });

    if (session) {
      controllerRef.current = session;
      setListening(true);
      if (session.fallbackNotice) {
        setNotice(session.fallbackNotice);
      }
    }
  };

  return (
    <div className={`inline-flex flex-col items-start gap-1 ${className}`}>
      <button
        type="button"
        onClick={handleToggle}
        aria-label={listening ? t("voice.stt_listening") : t("voice.stt_start")}
        title={listening ? t("voice.stt_listening") : t("voice.stt_start")}
        data-testid="voice-input-btn"
        className={`inline-flex items-center gap-1.5 rounded-lg font-semibold transition-all cursor-pointer border ${
          size === "md" ? "px-3.5 py-2 text-sm" : "px-2.5 py-1.5 text-xs"
        } ${
          listening
            ? "bg-rose-600 text-white border-rose-700 animate-pulse"
            : "bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-800 border-slate-300"
        }`}
      >
        {listening ? <MicOff className="w-4 h-4 shrink-0" /> : <Mic className="w-4 h-4 shrink-0 text-teal-700" />}
        <span>{listening ? t("voice.stt_listening") : t("voice.stt_start")}</span>
      </button>
      {notice && (
        <span className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 max-w-xs">
          {notice}
        </span>
      )}
    </div>
  );
};
