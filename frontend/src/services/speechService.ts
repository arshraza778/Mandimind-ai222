/**
 * Speech Synthesis (TTS) & Speech Recognition (STT) Service for Mitanin Signal.
 *
 * Strictly enforces Chhattisgarhi (hne) voice honesty:
 * - Detects actual installed Web Speech API voices via speechSynthesis.getVoices().
 * - NEVER labels a Hindi (hi-IN) voice as Chhattisgarhi (hne).
 * - When Chhattisgarhi (hne) is requested and no native hne browser voice is installed,
 *   checks optional backend cloud TTS (/tts/synthesize). If unavailable, reports
 *   honest fallback state so the UI keeps the task readable on screen and offers an
 *   explicitly labeled Hindi voice option.
 */

import type { SupportedLanguage } from "../i18n/types";

const API_BASE = "http://127.0.0.1:8000";

export interface VoiceAvailabilityReport {
  webSpeechSupported: boolean;
  sttSupported: boolean;
  voicesLoaded: boolean;
  enVoice: SpeechSynthesisVoice | null;
  hiVoice: SpeechSynthesisVoice | null;
  hneNativeVoice: SpeechSynthesisVoice | null;
}

export interface PlaybackCallbacks {
  onStart?: (spokenLanguageLabel: string, voiceName: string) => void;
  onPause?: () => void;
  onResume?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
  onHneUnavailable?: (notice: string) => void;
}

let activeAudioElement: HTMLAudioElement | null = null;

export function detectBrowserVoices(): VoiceAvailabilityReport {
  const webSpeechSupported =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance !== "undefined";

  const sttSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  if (!webSpeechSupported) {
    return {
      webSpeechSupported: false,
      sttSupported,
      voicesLoaded: false,
      enVoice: null,
      hiVoice: null,
      hneNativeVoice: null,
    };
  }

  const voices = window.speechSynthesis.getVoices() || [];
  const enVoice =
    voices.find((v) => v.lang.toLowerCase().startsWith("en-in")) ||
    voices.find((v) => v.lang.toLowerCase().startsWith("en")) ||
    null;

  const hiVoice =
    voices.find((v) => v.lang.toLowerCase().startsWith("hi-in")) ||
    voices.find((v) => v.lang.toLowerCase().startsWith("hi")) ||
    null;

  // Strictly match only genuine Chhattisgarhi (hne) voices — never match hi-IN here!
  const hneNativeVoice =
    voices.find(
      (v) =>
        v.lang.toLowerCase().startsWith("hne") ||
        v.name.toLowerCase().includes("chhattisgarhi")
    ) || null;

  return {
    webSpeechSupported: true,
    sttSupported,
    voicesLoaded: voices.length > 0,
    enVoice,
    hiVoice,
    hneNativeVoice,
  };
}

export function stopAllSpeech(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
  if (activeAudioElement) {
    try {
      activeAudioElement.pause();
      activeAudioElement.currentTime = 0;
    } catch {
      // ignore
    }
    activeAudioElement = null;
  }
}

export function pauseSpeech(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.pause();
    } catch {
      // ignore
    }
  }
  if (activeAudioElement) {
    try {
      activeAudioElement.pause();
    } catch {
      // ignore
    }
  }
}

export function resumeSpeech(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.resume();
    } catch {
      // ignore
    }
  }
  if (activeAudioElement) {
    try {
      activeAudioElement.play();
    } catch {
      // ignore
    }
  }
}

export async function speakTextInLanguage(
  text: string,
  language: SupportedLanguage,
  speed: number,
  callbacks: PlaybackCallbacks,
  options?: { allowExplicitHindiForHneText?: boolean }
): Promise<void> {
  stopAllSpeech();

  const report = detectBrowserVoices();

  // Case 1: Chhattisgarhi (hne) requested
  if (language === "hne" && !options?.allowExplicitHindiForHneText) {
    if (report.hneNativeVoice && report.webSpeechSupported) {
      const utter = new window.SpeechSynthesisUtterance(text);
      utter.voice = report.hneNativeVoice;
      utter.lang = report.hneNativeVoice.lang || "hne-IN";
      utter.rate = speed;
      utter.onstart = () =>
        callbacks.onStart?.("छत्तीसगढ़ी (Chhattisgarhi — Native Voice)", report.hneNativeVoice!.name);
      utter.onpause = () => callbacks.onPause?.();
      utter.onresume = () => callbacks.onResume?.();
      utter.onend = () => callbacks.onEnd?.();
      utter.onerror = () => callbacks.onError?.("Chhattisgarhi voice playback encountered an error.");
      window.speechSynthesis.speak(utter);
      return;
    }

    // Use backend Server-Side / Cloud TTS for Chhattisgarhi text (honestly labeled)
    try {
      const res = await fetch(`${API_BASE}/tts/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language: "hne", speed }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.available && data.audio_base64) {
          const audio = new Audio(`data:${data.mime_type || "audio/mp3"};base64,${data.audio_base64}`);
          audio.playbackRate = speed;
          activeAudioElement = audio;
          const label = data.native_hne_voice
            ? "छत्तीसगढ़ी (Cloud Native hne Voice)"
            : "छत्तीसगढ़ी पाठ (Devanagari Phonetic TTS Engine)";
          audio.onplay = () =>
            callbacks.onStart?.(label, data.voice_name || "Server Devanagari TTS");
          audio.onpause = () => callbacks.onPause?.();
          audio.onended = () => callbacks.onEnd?.();
          audio.onerror = () => callbacks.onError?.("Server TTS audio playback failed.");
          await audio.play();
          return;
        }
      }
    } catch {
      // Backend unreachable; fall through to browser Devanagari voice if installed
    }

    // Offline fallback: if browser has a Devanagari (hi-IN) voice, read the Chhattisgarhi script aloud and label honestly
    if (report.webSpeechSupported && report.hiVoice) {
      const utter = new window.SpeechSynthesisUtterance(text);
      utter.voice = report.hiVoice;
      utter.lang = "hi-IN";
      utter.rate = speed;
      utter.onstart = () =>
        callbacks.onStart?.(
          "छत्तीसगढ़ी पाठ (Browser Devanagari Engine — Not Native hne Voice)",
          report.hiVoice!.name
        );
      utter.onpause = () => callbacks.onPause?.();
      utter.onresume = () => callbacks.onResume?.();
      utter.onend = () => callbacks.onEnd?.();
      utter.onerror = () =>
        callbacks.onHneUnavailable?.(
          "Could not synthesize Chhattisgarhi speech on this device. The task remains readable on screen."
        );
      window.speechSynthesis.speak(utter);
      return;
    }

    callbacks.onHneUnavailable?.(
      "Native Chhattisgarhi (hne) voice is not installed on this device. Please read the Chhattisgarhi task card on screen."
    );
    return;
  }

  // Case 2: Hindi (hi) when browser has no installed hi-IN voice -> use Server-Side Hindi TTS first!
  if ((language === "hi" || (language === "hne" && options?.allowExplicitHindiForHneText)) && !report.hiVoice) {
    try {
      const res = await fetch(`${API_BASE}/tts/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language: "hi", speed }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.available && data.audio_base64) {
          const audio = new Audio(`data:${data.mime_type || "audio/mp3"};base64,${data.audio_base64}`);
          audio.playbackRate = speed;
          activeAudioElement = audio;
          audio.onplay = () =>
            callbacks.onStart?.("हिन्दी (Server Devanagari TTS — hi-IN)", data.voice_name || "Server hi-IN");
          audio.onpause = () => callbacks.onPause?.();
          audio.onended = () => callbacks.onEnd?.();
          audio.onerror = () => callbacks.onError?.("Server Hindi TTS audio playback failed.");
          await audio.play();
          return;
        }
      }
    } catch {
      // fall through to Web Speech API
    }
  }

  // Case 3: Standard browser Web Speech API playback
  if (!report.webSpeechSupported) {
    callbacks.onError?.(
      "Browser Web Speech API (speechSynthesis) is not supported in this browser. Please read the task card on screen."
    );
    return;
  }

  const utter = new window.SpeechSynthesisUtterance(text);
  utter.rate = speed;

  if (language === "hne" && options?.allowExplicitHindiForHneText) {
    if (report.hiVoice) {
      utter.voice = report.hiVoice;
    }
    utter.lang = "hi-IN";
    const voiceLabel = report.hiVoice ? report.hiVoice.name : "Browser hi-IN";
    utter.onstart = () =>
      callbacks.onStart?.("हिन्दी आवाज़ (छत्तीसगढ़ी पाठ हेतु स्पष्ट विकल्प / Explicit Hindi Voice)", voiceLabel);
  } else if (language === "hi") {
    if (report.hiVoice) {
      utter.voice = report.hiVoice;
    }
    utter.lang = "hi-IN";
    const voiceLabel = report.hiVoice ? report.hiVoice.name : "Browser hi-IN";
    utter.onstart = () => callbacks.onStart?.("हिन्दी (Hindi — hi-IN)", voiceLabel);
  } else {
    if (report.enVoice) {
      utter.voice = report.enVoice;
    }
    utter.lang = "en-IN";
    const voiceLabel = report.enVoice ? report.enVoice.name : "Browser en-IN";
    utter.onstart = () => callbacks.onStart?.("English (en-IN)", voiceLabel);
  }

  utter.onpause = () => callbacks.onPause?.();
  utter.onresume = () => callbacks.onResume?.();
  utter.onend = () => callbacks.onEnd?.();
  utter.onerror = (ev) => {
    if (ev.error === "canceled" || ev.error === "interrupted") {
      callbacks.onEnd?.();
      return;
    }
    callbacks.onError?.("Voice playback could not be completed on this device. The task remains readable on screen.");
  };

  window.speechSynthesis.speak(utter);
}

export interface STTCallbacks {
  onResult: (transcript: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

export function startSpeechToText(
  language: SupportedLanguage,
  callbacks: STTCallbacks
): { stop: () => void; usedLanguageLabel: string; fallbackNotice?: string } | null {
  if (typeof window === "undefined") {
    callbacks.onError("Speech recognition is not available in this environment.");
    return null;
  }

  const SpeechRecognitionCtor =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognitionCtor) {
    callbacks.onError(
      language === "hi"
        ? "इस ब्राउज़र में वॉइस इनपुट (Speech-to-Text) समर्थित नहीं है। कृपया टाइप करके लिखें।"
        : language === "hne"
        ? "ए ब्राउज़र मं बोलके लिखे के सुविधा नइ हे। किरपा करके टाइप करके लिखव।"
        : "Speech-to-Text is not supported in this browser. Please use keyboard text input."
    );
    return null;
  }

  const recognition = new SpeechRecognitionCtor();
  recognition.continuous = false;
  recognition.interimResults = false;

  let usedLanguageLabel = "English (en-IN)";
  let fallbackNotice: string | undefined;

  if (language === "hi") {
    recognition.lang = "hi-IN";
    usedLanguageLabel = "हिन्दी (hi-IN)";
  } else if (language === "hne") {
    // Browser STT engines do not have a verified hne-IN recognizer; disclose honestly and use Devanagari hi-IN or text input
    recognition.lang = "hi-IN";
    usedLanguageLabel = "देवनागरी वॉइस इनपुट (hi-IN fallback)";
    fallbackNotice =
      "ब्राउज़र में सीधा छत्तीसगढ़ी (hne) स्पीच-टू-टेक्स्ट उपलब्ध नहीं है; देवनागरी (hi-IN) पहचान सक्रिय है या आप सीधे टाइप कर सकते हैं।";
  } else {
    recognition.lang = "en-IN";
    usedLanguageLabel = "English (en-IN)";
  }

  recognition.onresult = (event: any) => {
    const transcript = event?.results?.[0]?.[0]?.transcript;
    if (transcript) {
      callbacks.onResult(transcript);
    }
  };

  recognition.onerror = () => {
    callbacks.onError(
      language === "en"
        ? "Could not capture voice input. Please use keyboard text input."
        : "आवाज़ स्पष्ट नहीं मिली। कृपया दोबारा बोलें या टाइप करके लिखें।"
    );
  };

  recognition.onend = () => {
    callbacks.onEnd();
  };

  try {
    recognition.start();
  } catch {
    callbacks.onError("Microphone access could not be started.");
    return null;
  }

  return {
    stop: () => {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
    },
    usedLanguageLabel,
    fallbackNotice,
  };
}
