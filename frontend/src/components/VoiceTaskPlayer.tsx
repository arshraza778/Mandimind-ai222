import React, { useState, useEffect } from "react";
import { Volume2, Play, Pause, Square, RotateCcw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "../i18n/types";
import { useI18n } from "../i18n/I18nContext";
import {
  speakTextInLanguage,
  pauseSpeech,
  resumeSpeech,
  stopAllSpeech,
} from "../services/speechService";

interface VoiceTaskPlayerProps {
  task: any;
  defaultExpanded?: boolean;
  largeOutdoorMode?: boolean;
}

const SPEED_OPTIONS = [0.75, 0.9, 1.0, 1.25];

export const VoiceTaskPlayer: React.FC<VoiceTaskPlayerProps> = ({
  task,
  defaultExpanded = false,
  largeOutdoorMode = false,
}) => {
  const { language, t, localizeTask } = useI18n();
  const [speechLang, setSpeechLang] = useState<SupportedLanguage>(language);
  const [speed, setSpeed] = useState<number>(1.0);
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded);
  const [playState, setPlayState] = useState<"idle" | "playing" | "paused">("idle");
  const [activeVoiceLabel, setActiveVoiceLabel] = useState<string | null>(null);
  const [hneFallbackNotice, setHneFallbackNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Sync default speech language when global app language changes
  useEffect(() => {
    setSpeechLang(language);
    setHneFallbackNotice(null);
    setErrorNotice(null);
  }, [language]);

  // Clean up speech on unmount
  useEffect(() => {
    return () => {
      stopAllSpeech();
    };
  }, []);

  const localized = localizeTask(task, speechLang);

  const triggerPlay = (allowExplicitHindiForHne = false) => {
    setExpanded(true);
    setErrorNotice(null);
    if (!allowExplicitHindiForHne) {
      setHneFallbackNotice(null);
    }

    speakTextInLanguage(
      localized.fullSpeechScript,
      speechLang,
      speed,
      {
        onStart: (spokenLangLabel, voiceName) => {
          setPlayState("playing");
          setActiveVoiceLabel(`${spokenLangLabel} · ${voiceName}`);
          setHneFallbackNotice(null);
        },
        onPause: () => setPlayState("paused"),
        onResume: () => setPlayState("playing"),
        onEnd: () => {
          setPlayState("idle");
        },
        onError: (msg) => {
          setPlayState("idle");
          setErrorNotice(msg);
        },
        onHneUnavailable: (notice) => {
          setPlayState("idle");
          setActiveVoiceLabel(null);
          setHneFallbackNotice(notice);
        },
      },
      { allowExplicitHindiForHneText: allowExplicitHindiForHne }
    );
  };

  const handlePauseResume = () => {
    if (playState === "playing") {
      pauseSpeech();
      setPlayState("paused");
    } else if (playState === "paused") {
      resumeSpeech();
      setPlayState("playing");
    }
  };

  const handleStop = () => {
    stopAllSpeech();
    setPlayState("idle");
  };

  return (
    <div
      className="mt-3 rounded-xl border border-teal-200 bg-teal-50/70 p-3 text-slate-900"
      data-testid={`voice-task-player-${task?.id || "sample"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => triggerPlay(false)}
          aria-label={`${t("voice.read_aloud_btn")}: ${localized.title}`}
          data-testid={`read-task-aloud-btn-${task?.id || "sample"}`}
          className={`inline-flex items-center gap-2 rounded-xl font-bold transition-all cursor-pointer shadow-xs ${
            largeOutdoorMode
              ? "px-5 py-3 text-base bg-teal-800 hover:bg-teal-900 text-white"
              : "px-3.5 py-2 text-xs sm:text-sm bg-teal-700 hover:bg-teal-800 text-white"
          }`}
        >
          <Volume2 className={largeOutdoorMode ? "w-5 h-5" : "w-4 h-4"} aria-hidden="true" />
          <span>
            {playState === "playing" ? t("voice.playing") : t("voice.read_aloud_btn")}
          </span>
        </button>

        {/* Language Pills for Voice Playback */}
        <div
          className="inline-flex items-center gap-1 bg-white border border-teal-200 rounded-lg p-1"
          role="group"
          aria-label="Task Speech Language"
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => {
                handleStop();
                setSpeechLang(l.code);
                setHneFallbackNotice(null);
              }}
              aria-pressed={speechLang === l.code}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                speechLang === l.code
                  ? "bg-teal-700 text-white"
                  : "text-slate-700 hover:bg-teal-50"
              }`}
            >
              {l.nativeName}
            </button>
          ))}
        </div>
      </div>

      {/* Expandable Voice Controls */}
      {(expanded || playState !== "idle" || hneFallbackNotice || errorNotice) && (
        <div className="mt-3 pt-3 border-t border-teal-200/80 space-y-2.5">
          {/* Spoken Script Preview in Selected Language */}
          <div className="rounded-lg bg-white border border-slate-200 p-2.5 text-xs sm:text-sm leading-relaxed text-slate-800">
            <div className="font-bold text-teal-900 mb-1">{localized.title}</div>
            <p className="text-slate-800">{localized.instructions}</p>
            <div className="mt-1.5 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              <strong className="font-semibold">{t("voice.safety_label")}:</strong> {localized.safety}
            </div>
          </div>

          {/* Playback Controls Row */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => triggerPlay(false)}
              aria-label={t("voice.play")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{t("voice.play")}</span>
            </button>

            <button
              type="button"
              onClick={handlePauseResume}
              disabled={playState === "idle"}
              aria-label={playState === "paused" ? t("voice.resume") : t("voice.pause")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 disabled:opacity-50 border border-slate-300 text-slate-800 text-xs font-bold cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>{playState === "paused" ? t("voice.resume") : t("voice.pause")}</span>
            </button>

            <button
              type="button"
              onClick={handleStop}
              disabled={playState === "idle"}
              aria-label={t("voice.stop")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-rose-50 disabled:opacity-50 border border-slate-300 text-rose-700 text-xs font-bold cursor-pointer"
            >
              <Square className="w-3.5 h-3.5" />
              <span>{t("voice.stop")}</span>
            </button>

            <button
              type="button"
              onClick={() => triggerPlay(false)}
              aria-label={t("voice.replay")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-xs font-bold cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t("voice.replay")}</span>
            </button>

            {/* Speed Selector */}
            <div className="inline-flex items-center gap-1 ml-auto bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs">
              <span className="font-semibold text-slate-600">{t("voice.speed")}:</span>
              {SPEED_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  className={`px-1.5 py-0.5 rounded font-bold cursor-pointer ${
                    speed === s ? "bg-teal-700 text-white" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {/* Active Speaking Language Indicator Badge */}
          {activeVoiceLabel && (
            <div
              className="flex items-center gap-1.5 text-xs font-semibold text-teal-900 bg-teal-100/80 border border-teal-300 rounded-lg px-2.5 py-1.5"
              data-testid="active-voice-language-badge"
            >
              <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
              <span>
                {t("voice.speaking_lang_badge")}: <strong>{activeVoiceLabel}</strong>
              </span>
            </div>
          )}

          {/* Honest Chhattisgarhi Voice Fallback Banner */}
          {hneFallbackNotice && (
            <div
              className="rounded-lg bg-amber-50 border border-amber-300 p-3 text-xs text-amber-950 space-y-2"
              role="alert"
              data-testid="hne-voice-fallback-banner"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">{t("voice.hne_fallback_title")} </span>
                  <span>{t("voice.hne_fallback_body")}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pl-6">
                <button
                  type="button"
                  onClick={() => triggerPlay(true)}
                  data-testid="explicit-hindi-fallback-play-btn"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>{t("voice.play_in_hindi_explicit")}</span>
                </button>
              </div>
            </div>
          )}

          {errorNotice && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-900">
              {errorNotice}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
