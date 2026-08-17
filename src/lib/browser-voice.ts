"use client";

import type { PrivateVoiceClipId } from "@/lib/private-voice";

type RecognitionAlternative = { transcript: string; confidence: number };
type RecognitionResult = { isFinal: boolean; 0: RecognitionAlternative; length: number };
type RecognitionEvent = Event & { results: ArrayLike<RecognitionResult>; resultIndex: number };
type RecognitionErrorEvent = Event & { error: string; message?: string };

interface RecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

type RecognitionConstructor = new () => RecognitionInstance;

export type MicrophonePermissionState = "granted" | "prompt" | "denied" | "unsupported" | "unknown";

export type MicrophonePermissionResult = {
  granted: boolean;
  state: MicrophonePermissionState;
  message: string;
};

let activePromptAudio: HTMLAudioElement | null = null;
let activeAudioMeterCleanup: (() => void) | null = null;
const privateVoiceUrls = new Map<PrivateVoiceClipId, string>();
const privateVoiceLoads = new Map<PrivateVoiceClipId, Promise<string | null>>();

export type AudioLevelCallback = (level: number) => void;

export function preloadPrivateVoiceClip(clipId: PrivateVoiceClipId) {
  if (typeof window === "undefined") return Promise.resolve(null);
  const ready = privateVoiceUrls.get(clipId);
  if (ready) return Promise.resolve(ready);
  const loading = privateVoiceLoads.get(clipId);
  if (loading) return loading;
  const request = fetch(`/api/voice/audio/${encodeURIComponent(clipId)}`, { credentials: "same-origin", cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) return null;
      const url = URL.createObjectURL(await response.blob());
      privateVoiceUrls.set(clipId, url);
      return url;
    })
    .catch(() => null)
    .finally(() => privateVoiceLoads.delete(clipId));
  privateVoiceLoads.set(clipId, request);
  return request;
}

function createAnalyserMeter(
  context: AudioContext,
  analyser: AnalyserNode,
  onLevel: AudioLevelCallback,
) {
  const samples = new Uint8Array(analyser.frequencyBinCount);
  let frame = 0;
  let smoothed = 0;
  const tick = () => {
    analyser.getByteFrequencyData(samples);
    let energy = 0;
    const limit = Math.min(samples.length, 96);
    for (let index = 0; index < limit; index += 1) {
      const normalized = samples[index] / 255;
      energy += normalized * normalized;
    }
    const rms = Math.sqrt(energy / Math.max(1, limit));
    smoothed += (Math.min(1, rms * 2.25) - smoothed) * (rms > smoothed ? 0.42 : 0.12);
    onLevel(smoothed);
    frame = window.requestAnimationFrame(tick);
  };
  frame = window.requestAnimationFrame(tick);
  return () => {
    window.cancelAnimationFrame(frame);
    onLevel(0);
    void context.close().catch(() => {});
  };
}

export async function startMicrophoneLevelMeter(onLevel: AudioLevelCallback) {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const AudioContextConstructor = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) {
    stream.getTracks().forEach((track) => track.stop());
    return null;
  }
  const context = new AudioContextConstructor();
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.72;
  context.createMediaStreamSource(stream).connect(analyser);
  const stopMeter = createAnalyserMeter(context, analyser, onLevel);
  return () => {
    stopMeter();
    stream.getTracks().forEach((track) => track.stop());
  };
}

function getRecognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const voiceWindow = window as typeof window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition ?? null;
}

export function supportsVoiceRecognition() {
  return Boolean(getRecognitionConstructor());
}

export async function getMicrophonePermissionState(): Promise<MicrophonePermissionState> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return "unsupported";
  if (!navigator.permissions?.query) return "unknown";
  try {
    const status = await navigator.permissions.query({ name: "microphone" } as PermissionDescriptor);
    return status.state;
  } catch {
    return "unknown";
  }
}

export async function requestMicrophonePermission(): Promise<MicrophonePermissionResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return {
      granted: false,
      state: "unsupported",
      message: "This browser cannot request microphone access. You can continue with written answers.",
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return {
      granted: true,
      state: "granted",
      message: "Microphone ready. Audio is used only while you are answering.",
    };
  } catch (reason) {
    const name = reason instanceof DOMException ? reason.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      return {
        granted: false,
        state: "denied",
        message: "Microphone access is blocked. Open the lock or site-controls icon beside the address, set Microphone to Allow, then try again.",
      };
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return {
        granted: false,
        state: "unsupported",
        message: "No microphone was found. Connect a microphone or continue with written answers.",
      };
    }
    return {
      granted: false,
      state: "unknown",
      message: "The microphone could not be started. Check the browser's site permissions, then try again.",
    };
  }
}

export function listenOnce(options: {
  locale?: string;
  onInterim?: (text: string) => void;
  onResult: (text: string, confidence: number) => void;
  onError: (message: string) => void;
  onEnd?: () => void;
}) {
  const Recognition = getRecognitionConstructor();
  if (!Recognition) {
    options.onError("Voice recognition is unavailable in this browser. You can still type the answer.");
    options.onEnd?.();
    return null;
  }
  const recognition = new Recognition();
  recognition.lang = options.locale ?? "en-IN";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;
  let delivered = false;
  recognition.onresult = (event) => {
    let interim = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = result[0]?.transcript?.trim() ?? "";
      if (result.isFinal && transcript) {
        delivered = true;
        options.onResult(transcript, result[0]?.confidence ?? 0);
      } else {
        interim += transcript;
      }
    }
    if (interim) options.onInterim?.(interim);
  };
  recognition.onerror = (event) => {
    const friendly = event.error === "not-allowed"
      ? "Microphone permission was blocked. Allow microphone access or use the text box."
      : event.error === "no-speech"
        ? "I did not hear an answer. Tap the microphone and try again."
        : event.error === "audio-capture"
          ? "The browser could not receive microphone audio. Check the selected input device and try again."
          : event.error === "network" || event.error === "service-not-allowed"
            ? "This browser could not start its speech-recognition service. Update the browser or use the text box."
            : "Voice recognition paused. Please try again or type the answer.";
    options.onError(friendly);
  };
  recognition.onend = () => {
    if (!delivered) options.onInterim?.("");
    options.onEnd?.();
  };
  recognition.start();
  return recognition;
}

export function listenForWakePhrase(options: {
  phrases: string[];
  locale?: string;
  onWake: (transcript: string, remainingCommand: string) => void;
  onError?: (message: string) => void;
  onStatus?: (active: boolean) => void;
}) {
  const Recognition = getRecognitionConstructor();
  if (!Recognition) {
    options.onError?.("Foreground wake listening is unavailable in this browser. Tap the microphone instead.");
    return null;
  }

  let active = true;
  let recognition: RecognitionInstance | null = null;
  let restartTimer: number | null = null;
  const phrases = options.phrases.map((phrase) => phrase.toLowerCase());

  const stop = () => {
    active = false;
    if (restartTimer !== null) window.clearTimeout(restartTimer);
    recognition?.abort();
    options.onStatus?.(false);
  };
  const start = () => {
    if (!active || recognition || document.visibilityState !== "visible") return;
    recognition = new Recognition();
    recognition.lang = options.locale ?? "en-IN";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript?.trim() ?? "";
        const lower = transcript.toLowerCase();
        const phrase = phrases.find((candidate) => lower.includes(candidate));
        if (!phrase) continue;
        const phraseIndex = lower.indexOf(phrase);
        const remainingCommand = transcript.slice(phraseIndex + phrase.length).replace(/^[,\s:-]+/, "").trim();
        active = false;
        recognition?.abort();
        options.onStatus?.(false);
        options.onWake(transcript, remainingCommand);
        break;
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        active = false;
        options.onError?.("Wake listening needs microphone permission. Allow it in this site's browser settings, then arm wake words again.");
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        options.onError?.("Wake listening paused. Tap the assistant microphone to continue.");
      }
    };
    recognition.onend = () => {
      recognition = null;
      if (!active) return;
      restartTimer = window.setTimeout(start, 350);
    };
    try {
      recognition.start();
      options.onStatus?.(true);
    } catch {
      active = false;
      options.onStatus?.(false);
      options.onError?.("Wake listening could not start. Tap the assistant microphone instead.");
    }
  };
  const onVisibility = () => {
    if (!active) return;
    if (document.visibilityState === "visible") start();
    else recognition?.abort();
  };
  document.addEventListener("visibilitychange", onVisibility);
  start();
  return {
    abort() {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    },
  };
}

export function getPreferredVoice(preferredName?: string | null, locale = "en-IN") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (preferredName) {
    const preferred = voices.find((voice) => voice.name === preferredName);
    if (preferred) return preferred;
  }
  const language = locale.toLowerCase();
  const indianVoiceHints = /india|indian|ravi|prabhat|heera|neerja|veena|raveena|lekha|aditi|kajal/i;
  return voices.find((voice) => voice.lang.toLowerCase() === language && indianVoiceHints.test(voice.name))
    ?? voices.find((voice) => voice.lang.toLowerCase() === language)
    ?? voices.find((voice) => voice.lang.toLowerCase().startsWith(language.split("-")[0]) && indianVoiceHints.test(voice.name))
    ?? voices.find((voice) => voice.lang.toLowerCase().startsWith("en"))
    ?? voices[0]
    ?? null;
}

export function speakPrompt(text: string, options?: { preferredVoice?: string | null; locale?: string; enabled?: boolean; clipId?: PrivateVoiceClipId | null; onLevel?: AudioLevelCallback; onEnded?: () => void; allowBrowserFallback?: boolean }) {
  if (typeof window === "undefined" || options?.enabled === false) return null;
  activeAudioMeterCleanup?.();
  activeAudioMeterCleanup = null;
  activePromptAudio?.pause();
  activePromptAudio = null;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  const speakWithBrowser = () => {
    if (!("speechSynthesis" in window)) return null;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options?.locale ?? "en-IN";
    utterance.rate = 1;
    utterance.pitch = 1.02;
    const voice = getPreferredVoice(options?.preferredVoice, utterance.lang);
    if (voice) utterance.voice = voice;
    if (options?.onLevel) {
      const started = performance.now();
      let frame = 0;
      const animate = () => {
        const elapsed = (performance.now() - started) / 1000;
        options.onLevel?.(0.18 + Math.abs(Math.sin(elapsed * 7.1)) * 0.2 + Math.abs(Math.sin(elapsed * 13.7)) * 0.08);
        frame = window.requestAnimationFrame(animate);
      };
      frame = window.requestAnimationFrame(animate);
      activeAudioMeterCleanup = () => {
        window.cancelAnimationFrame(frame);
        options.onLevel?.(0);
      };
    }
    utterance.onend = () => {
      activeAudioMeterCleanup?.();
      activeAudioMeterCleanup = null;
      options?.onEnded?.();
    };
    window.speechSynthesis.speak(utterance);
    return utterance;
  };
  if (options?.clipId) {
    const audio = new Audio(privateVoiceUrls.get(options.clipId) ?? `/api/voice/audio/${encodeURIComponent(options.clipId)}`);
    audio.preload = "auto";
    audio.playbackRate = 1;
    activePromptAudio = audio;
    audio.addEventListener("ended", () => {
      if (activePromptAudio === audio) activePromptAudio = null;
      activeAudioMeterCleanup?.();
      activeAudioMeterCleanup = null;
      options?.onEnded?.();
    }, { once: true });
    void audio.play().catch(() => {
      if (activePromptAudio === audio) activePromptAudio = null;
      activeAudioMeterCleanup?.();
      activeAudioMeterCleanup = null;
      if (options.allowBrowserFallback === true) speakWithBrowser();
      else options.onEnded?.();
    });
    if (options?.onLevel) {
      try {
        const AudioContextConstructor = window.AudioContext
          ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioContextConstructor) {
          const context = new AudioContextConstructor();
          const analyser = context.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.74;
          const source = context.createMediaElementSource(audio);
          source.connect(analyser);
          analyser.connect(context.destination);
          activeAudioMeterCleanup = createAnalyserMeter(context, analyser, options.onLevel);
          void context.resume().catch(() => {});
        }
      } catch {
        // The assistant remains audible even when this browser blocks visual metering.
      }
    }
    return audio;
  }
  return speakWithBrowser();
}

export function stopSpeaking() {
  activeAudioMeterCleanup?.();
  activeAudioMeterCleanup = null;
  activePromptAudio?.pause();
  activePromptAudio = null;
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
