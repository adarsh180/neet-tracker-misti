"use client";

import { ArrowRight, BarChart2, BarChart3, BookOpen, CalendarDays, Check, Circle, ClipboardCheck, ExternalLink, Flame, Heart, LayoutDashboard, ListTodo, Loader2, Mic, MicOff, PanelRight, RotateCcw, Search, Send, ShieldCheck, SmilePlus, Sparkles, Swords, Target, Volume2, VolumeX, Waves, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getMicrophonePermissionState, listenForWakePhrase, listenOnce, preloadPrivateVoiceClip, requestMicrophonePermission, speakPrompt, startMicrophoneLevelMeter, stopSpeaking, supportsVoiceRecognition, type MicrophonePermissionState } from "@/lib/browser-voice";
import { ASSISTANT_WAKE_NAMES, assistantRequestId, chooseAssistantTranscript, detectAssistantPersona, parseAssistantClientControl, parseSiteAssistantIntent, SITE_ASSISTANT_OPEN_EVENT, SITE_ASSISTANT_PREFERENCE_EVENT, SITE_ASSISTANT_WAKE_PAUSE_EVENT } from "@/lib/site-assistant";
import { detectVoiceDevice } from "@/lib/voice-device";
import { isAffirmative, isNegative } from "@/lib/voice-assistant";
import type { PrivateVoiceClipId } from "@/lib/private-voice";
import StudyPulseScene, { type StudyPulseState } from "./study-pulse-scene";
import VoiceWaveform from "./voice-waveform";
import styles from "./site-voice-assistant.module.css";

type AssistantState = "READY" | "LISTENING" | "UNDERSTANDING" | "ACTING" | "SPEAKING" | "DONE" | "ERROR";
type AssistantChoice = { label: string; href?: string; utterance?: string };
type AssistantResult = { actionId?: string; reply?: string; href?: string; label?: string; canUndo?: boolean; confirmationRequired?: boolean; state?: "DONE" | "NEEDS_CONFIRMATION" | "ERROR"; choices?: AssistantChoice[]; error?: string };
type Preference = { nickname: "Bubu" | "Shona"; speechEnabled: boolean; interactionMode: "TAP" | "WAKE"; discreetMode: boolean };
type AssistantTone = "WARM" | "MENTOR" | "BUDDY";
type VoiceMoment = "ready" | "working" | "done" | "clarify" | "error";
type WorkspaceMode = "VOICE" | "TEXT";
type AgentContext = {
  todayPlan: Array<{ id: string; title: string; status: string; dueDate: string | null; plannedMinutes: number | null; subject: { name: string; color: string } | null }>;
  completedTaskCount: number;
  visibleTaskCount: number;
  progress: { completedTopics: number; totalTopics: number; percentage: number; subjects: Array<{ name: string; slug: string; color: string; completed: number; total: number; percentage: number; questions: number }> };
  weakSubjects: Array<{ name: string; slug: string; color: string; percentage: number }>;
  upcomingTests: Array<{ id: string; title: string; dueDate: string | null; subject: { name: string; color: string } | null }>;
  recentTests: Array<{ id: string; testName: string; percentage: number; takenAt: string; testType: string }>;
  recentActions: Array<{ id: string; kind: string; utterance: string; status: string; createdAt: string }>;
  stats?: { streak: number; testCount: number; avgPercentage: number; avgScore: number };
};

const DEFAULT_PREFERENCE: Preference = { nickname: "Bubu", speechEnabled: true, interactionMode: "WAKE", discreetMode: false };
const QUICK_COMMANDS = [
  { icon: Target, title: "Start focus session", detail: "25 min · Physics", command: "open focus timer", accent: "var(--accent-rose)" },
  { icon: BookOpen, title: "Summarize chapter", detail: "NCERT / PYQ", command: "open NCERT reader", accent: "var(--accent-green)" },
  { icon: BarChart3, title: "Analyze last mock", detail: "Find weak areas", command: "open tests analytics", accent: "var(--accent-blue)" },
  { icon: CalendarDays, title: "Plan tomorrow", detail: "Optimized schedule", command: "open daily goals voice mode", accent: "var(--accent-gold)" },
] as const;
const NAV_RAIL = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { icon: BookOpen, label: "NCERT reader", href: "/reader" },
  { icon: BarChart2, label: "Tests", href: "/tests" },
  { icon: Target, label: "Daily goals", href: "/daily-goals" },
  { icon: ListTodo, label: "Todo deck", href: "/todo" },
  { icon: Swords, label: "Practice arena", href: "/practice" },
  { icon: ClipboardCheck, label: "Review cards", href: "/reviews" },
  { icon: SmilePlus, label: "Mood tracker", href: "/mood" },
] as const;

function toneFromWake(wakeName: string | null, mode: "WARM" | "MENTOR"): AssistantTone { return mode === "MENTOR" ? "MENTOR" : wakeName === "buddy" ? "BUDDY" : "WARM"; }
function voiceClip(moment: VoiceMoment, tone: AssistantTone): PrivateVoiceClipId {
  const suffix = tone.toLowerCase();
  if ((moment === "clarify" || moment === "error") && tone === "BUDDY") return `assistant-${moment}-warm`;
  return `assistant-${moment}-${suffix}` as PrivateVoiceClipId;
}
function visualState(state: AssistantState): StudyPulseState {
  return state === "LISTENING" ? "listening" : state === "UNDERSTANDING" ? "thinking" : state === "ACTING" ? "executing" : state === "SPEAKING" ? "speaking" : state === "DONE" ? "success" : state === "ERROR" ? "error" : "idle";
}
function stateLabel(state: AssistantState) {
  return state === "LISTENING" ? "Listening to you" : state === "UNDERSTANDING" ? "Understanding your request" : state === "ACTING" ? "Bubu is taking care of it" : state === "SPEAKING" ? "Bubu is replying" : state === "DONE" ? "Complete" : state === "ERROR" ? "Needs your help" : "Ready when you are";
}
function toneLabel(tone: AssistantTone) {
  return tone === "MENTOR" ? "Study mode" : tone === "BUDDY" ? "Buddy mode" : "Personal mode";
}
function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  return minutes < 2 ? "Now" : minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.floor(minutes / 60)}h` : `${Math.floor(minutes / 1440)}d`;
}

export default function SiteVoiceAssistant() {
  const router = useRouter();
  const pathname = usePathname();
  const recognitionRef = useRef<{ abort(): void } | null>(null);
  const meterCleanupRef = useRef<(() => void) | null>(null);
  const audioLevelRef = useRef(0);
  const modeRef = useRef<WorkspaceMode>("VOICE");
  const submitRef = useRef<(command: string) => void>(() => {});
  const welcomeRef = useRef<(tone?: AssistantTone) => void>(() => {});
  const navigationTimerRef = useRef<number | null>(null);
  const navigationFallbackRef = useRef<number | null>(null);
  const stateTimerRef = useRef<number | null>(null);
  const activeToneRef = useRef<AssistantTone>("WARM");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<WorkspaceMode>("VOICE");
  const [railOpen, setRailOpen] = useState(false);
  const [state, setState] = useState<AssistantState>("READY");
  const [command, setCommand] = useState("");
  const [interim, setInterim] = useState("");
  const [message, setMessage] = useState("What would you like me to take care of?");
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [preference, setPreference] = useState<Preference>(DEFAULT_PREFERENCE);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const [wakeArmed, setWakeArmed] = useState(false);
  const [wakeActive, setWakeActive] = useState(false);
  const [wakeRestartToken, setWakeRestartToken] = useState(0);
  const [wakeSuppressed, setWakeSuppressed] = useState(false);
  const [micPermission, setMicPermission] = useState<MicrophonePermissionState>("unknown");
  const [undoing, setUndoing] = useState(false);
  const [permissionHelp, setPermissionHelp] = useState("");
  const [wakeLabel, setWakeLabel] = useState("");
  const [lastVoiceClip, setLastVoiceClip] = useState<PrivateVoiceClipId | null>(null);
  const [context, setContext] = useState<AgentContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [omni, setOmni] = useState("");

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => {
    void preloadPrivateVoiceClip("assistant-ready-warm");
    void preloadPrivateVoiceClip("assistant-ready-mentor");
    void preloadPrivateVoiceClip("assistant-ready-buddy");
  }, []);

  const stopMeter = useCallback(() => { meterCleanupRef.current?.(); meterCleanupRef.current = null; audioLevelRef.current = 0; }, []);
  const resumeVoice = useCallback(() => {
    if (modeRef.current === "VOICE") window.dispatchEvent(new CustomEvent(`${SITE_ASSISTANT_OPEN_EVENT}:listen`));
  }, []);
  const speak = useCallback((text: string, clipId: PrivateVoiceClipId, onEnded?: () => void) => {
    setLastVoiceClip(clipId);
    if (!preference.speechEnabled) { onEnded?.(); return; }
    speakPrompt(text, { locale: "en-IN", enabled: true, clipId, onLevel: (level) => { audioLevelRef.current = level; }, onEnded });
  }, [preference.speechEnabled]);
  const beginVoiceWelcome = useCallback((tone: AssistantTone = "WARM") => {
    recognitionRef.current?.abort(); recognitionRef.current = null; stopMeter(); stopSpeaking();
    if (stateTimerRef.current !== null) window.clearTimeout(stateTimerRef.current);
    activeToneRef.current = tone; setMode("VOICE"); setResult(null); setCommand(""); setInterim(""); setPermissionHelp(""); setState("SPEAKING");
    const reply = tone === "MENTOR" ? `Hey ${preference.nickname}. What shall we focus on today?` : `Of course, my love. What would you like me to take care of?`;
    setMessage(reply);
    let continued = false;
    const listenNext = () => {
      if (continued) return;
      continued = true;
      window.dispatchEvent(new CustomEvent(`${SITE_ASSISTANT_OPEN_EVENT}:listen`));
    };
    speak(reply, voiceClip("ready", tone), listenNext);
    stateTimerRef.current = window.setTimeout(listenNext, 4300);
  }, [preference.nickname, speak, stopMeter]);
  useEffect(() => { welcomeRef.current = beginVoiceWelcome; }, [beginVoiceWelcome]);
  const close = useCallback(() => {
    recognitionRef.current?.abort(); recognitionRef.current = null; stopMeter(); stopSpeaking();
    if (navigationTimerRef.current !== null) window.clearTimeout(navigationTimerRef.current);
    if (navigationFallbackRef.current !== null) window.clearTimeout(navigationFallbackRef.current);
    if (stateTimerRef.current !== null) window.clearTimeout(stateTimerRef.current);
    setOpen(false); setRailOpen(false); setState("READY"); setInterim(""); setWakeLabel(""); setWakeRestartToken((value) => value + 1); activeToneRef.current = "WARM";
  }, [stopMeter]);
  const performNavigation = useCallback((href: string) => {
    let target: URL;
    try {
      target = new URL(href, window.location.origin);
    } catch {
      setState("ERROR");
      setMessage("I could not verify that destination safely.");
      return;
    }
    if (target.origin !== window.location.origin || !target.pathname.startsWith("/")) {
      setState("ERROR");
      setMessage("I only open verified pages inside NEET Tracker.");
      return;
    }
    const destination = `${target.pathname}${target.search}${target.hash}`;
    close();
    router.push(destination);
    navigationFallbackRef.current = window.setTimeout(() => {
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (current !== destination) router.replace(destination);
    }, 1600);
  }, [close, router]);
  const loadContext = useCallback(async () => {
    setContextLoading(true);
    try { const response = await fetch("/api/assistant/context", { cache: "no-store" }); if (response.ok) setContext(await response.json() as AgentContext); }
    finally { setContextLoading(false); }
  }, []);

  const submitCommand = useCallback(async (utterance: string) => {
    const cleaned = utterance.trim();
    if (!cleaned) return;
    recognitionRef.current?.abort(); recognitionRef.current = null; stopMeter();
    if (navigationTimerRef.current !== null) window.clearTimeout(navigationTimerRef.current);
    if (stateTimerRef.current !== null) window.clearTimeout(stateTimerRef.current);
    setCommand(cleaned); setInterim(""); setResult(null); setPermissionHelp(""); setState("UNDERSTANDING"); setMessage(`I heard “${cleaned}”`);

    if (pendingActionId) {
      const decision = isAffirmative(cleaned) ? "CONFIRM" : isNegative(cleaned) ? "CANCEL" : null;
      if (!decision) {
        setState("READY");
        setMessage("I still need a clear yes or no for the pending change. Nothing has been changed yet.");
        speak("Please say yes to confirm or no to cancel.", voiceClip("clarify", activeToneRef.current), resumeVoice);
        return;
      }
      setState("ACTING");
      setMessage(decision === "CONFIRM" ? "Applying the confirmed change." : "Cancelling safely.");
      try {
        const confirmationResponse = await fetch(`/api/assistant/actions/${encodeURIComponent(pendingActionId)}/confirm`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision }),
        });
        const confirmed = await confirmationResponse.json() as AssistantResult;
        if (!confirmationResponse.ok || confirmed.state === "ERROR") throw new Error(confirmed.error || "The confirmation could not be completed.");
        setPendingActionId(null);
        setResult(confirmed);
        const reply = confirmed.reply || (decision === "CONFIRM" ? "Done." : "Cancelled. Nothing was changed.");
        setState("SPEAKING"); setMessage(reply);
        speak(reply, voiceClip("done", activeToneRef.current), confirmed.href ? undefined : resumeVoice);
        if (confirmed.href) navigationTimerRef.current = window.setTimeout(() => performNavigation(confirmed.href as string), 950);
        else stateTimerRef.current = window.setTimeout(() => { setState("DONE"); resumeVoice(); }, 1800);
        void loadContext();
      } catch (reason) {
        setState("ERROR"); setMessage(reason instanceof Error ? reason.message : "The confirmation could not be completed."); speak("Nothing uncertain was changed.", voiceClip("error", activeToneRef.current), resumeVoice);
      }
      return;
    }

    const clientControl = parseAssistantClientControl(cleaned);
    if (clientControl === "CLOSE") { close(); return; }
    if (clientControl === "MUTE") {
      stopSpeaking();
      setPreference((current) => ({ ...current, speechEnabled: false }));
      void fetch("/api/voice/preferences", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...preference, speechEnabled: false }) }).catch(() => {});
      setState("DONE"); setMessage("Muted. I will keep listening and respond visually.");
      return;
    }
    if (clientControl === "UNMUTE") {
      setPreference((current) => ({ ...current, speechEnabled: true }));
      void fetch("/api/voice/preferences", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...preference, speechEnabled: true }) }).catch(() => {});
      setState("DONE"); setMessage("Voice replies are on again.");
      return;
    }
    if (clientControl === "BACK" || clientControl === "REFRESH") {
      const reply = clientControl === "BACK" ? "Going back." : "Refreshing this page.";
      setState("SPEAKING"); setMessage(reply); speak(reply, voiceClip("done", activeToneRef.current));
      navigationTimerRef.current = window.setTimeout(() => {
        close();
        if (clientControl === "BACK") router.back();
        else router.refresh();
      }, 700);
      return;
    }

    const localIntent = parseSiteAssistantIntent(cleaned);
    if (localIntent.kind === "NAVIGATE") {
      const reply = `Opening ${localIntent.label}.`;
      router.prefetch(localIntent.href.split(/[?#]/, 1)[0]);
      setResult({ href: localIntent.href, label: localIntent.label, reply, state: "DONE" });
      setState("SPEAKING"); setMessage(reply); speak(reply, voiceClip("done", activeToneRef.current));
      navigationTimerRef.current = window.setTimeout(() => performNavigation(localIntent.href), 850);
      return;
    }

    speak("I’m checking that for you.", voiceClip("working", activeToneRef.current));
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    setState("ACTING"); setMessage("I’m checking the exact page and protecting your existing progress.");
    try {
      const response = await fetch("/api/assistant/command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId: assistantRequestId(), utterance: cleaned, assistantTone: activeToneRef.current, currentPath: pathname }) });
      const payload = await response.json() as AssistantResult;
      setResult(payload);
      if (!response.ok || payload.state === "ERROR") { setState("ERROR"); setMessage(payload.reply || payload.error || "I could not complete that safely."); speak("Nothing uncertain was changed. Please try once more.", voiceClip("error", activeToneRef.current), resumeVoice); return; }
      if (payload.state === "NEEDS_CONFIRMATION") {
        if (payload.confirmationRequired && payload.actionId) setPendingActionId(payload.actionId);
        setState("READY"); setMessage(payload.reply || "Choose the exact match before I continue.");
        speak(payload.confirmationRequired ? (payload.reply || "Please say yes to confirm or no to cancel.") : "I found more than one match. Choose the exact one to continue.", voiceClip("clarify", activeToneRef.current), resumeVoice);
        return;
      }
      const reply = payload.reply || "Done.";
      let continued = false;
      const finishReply = () => {
        if (continued) return;
        continued = true;
        setState("DONE");
        if (!payload.href && modeRef.current === "VOICE") window.dispatchEvent(new CustomEvent(`${SITE_ASSISTANT_OPEN_EVENT}:listen`));
      };
      setState("SPEAKING"); setMessage(reply); speak(reply, voiceClip("done", activeToneRef.current), finishReply);
      stateTimerRef.current = window.setTimeout(finishReply, 4200);
      if (payload.href) navigationTimerRef.current = window.setTimeout(() => performNavigation(payload.href as string), payload.canUndo ? 2600 : 900);
      void loadContext();
    } catch { setState("ERROR"); setMessage("The connection paused before anything uncertain was changed. Please try again."); }
  }, [close, loadContext, pathname, pendingActionId, performNavigation, preference, resumeVoice, router, speak, stopMeter]);
  useEffect(() => { submitRef.current = (next) => void submitCommand(next); }, [submitCommand]);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ command?: string; wakeName?: string; tone?: AssistantTone; message?: string }>).detail;
      const tone = detail?.tone ?? "WARM";
      setOpen(true); activeToneRef.current = tone; setWakeLabel(detail?.wakeName ? `Hey ${detail.wakeName}` : ""); setResult(null);
      if (detail?.command) submitRef.current(detail.command);
      else welcomeRef.current(tone);
    };
    const onPreference = (event: Event) => {
      const next = (event as CustomEvent<Preference>).detail;
      if (!next) return;
      setPreference((current) => ({ ...current, ...next }));
      if (next.interactionMode === "TAP") setWakeArmed(false);
      if (next.interactionMode === "WAKE" && localStorage.getItem("neet_mic_granted") === "true") setWakeArmed(true);
    };
    const onWakePause = (event: Event) => setWakeSuppressed(Boolean((event as CustomEvent<{ paused?: boolean }>).detail?.paused));
    window.addEventListener(SITE_ASSISTANT_OPEN_EVENT, onOpen); window.addEventListener(SITE_ASSISTANT_PREFERENCE_EVENT, onPreference); window.addEventListener(SITE_ASSISTANT_WAKE_PAUSE_EVENT, onWakePause);
    void Promise.all([fetch("/api/voice/preferences", { cache: "no-store" }).then(async (response) => response.ok ? response.json() as Promise<Preference> : DEFAULT_PREFERENCE), getMicrophonePermissionState()]).then(([saved, permission]) => {
      const next = { ...DEFAULT_PREFERENCE, ...saved };
      const previouslyGranted = localStorage.getItem("neet_mic_granted") === "true";
      const shouldMigrateWake = previouslyGranted && localStorage.getItem("neet_wake_listener_v2") !== "ready";
      if (shouldMigrateWake) {
        next.interactionMode = "WAKE";
        localStorage.setItem("neet_wake_listener_v2", "ready");
        void fetch("/api/voice/preferences", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(next) }).catch(() => {});
      }
      setPreference(next); setMicPermission(permission);
      setWakeArmed(next.interactionMode === "WAKE" && (permission === "granted" || (permission === "unknown" && previouslyGranted))); setPreferenceLoaded(true);
    }).catch(() => setPreferenceLoaded(true));
    return () => { window.removeEventListener(SITE_ASSISTANT_OPEN_EVENT, onOpen); window.removeEventListener(SITE_ASSISTANT_PREFERENCE_EVENT, onPreference); window.removeEventListener(SITE_ASSISTANT_WAKE_PAUSE_EVENT, onWakePause); };
  }, []);
  useEffect(() => {
    if (wakeArmed) setWakeRestartToken((value) => value + 1);
  }, [pathname, wakeArmed]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; void loadContext();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [close, loadContext, open]);
  useEffect(() => {
    if (!wakeArmed || open || wakeSuppressed) return;
    const controller = listenForWakePhrase({ phrases: ASSISTANT_WAKE_NAMES.map((name) => `hey ${name}`), locale: "en-IN", onStatus: setWakeActive, onError: (error) => {
      setWakeActive(false); setPermissionHelp(error);
      if (/permission|unavailable/i.test(error)) {
        setWakeArmed(false);
        void getMicrophonePermissionState().then(setMicPermission);
      }
    }, onWake: (transcript, remainingCommand) => {
      setOpen(true); const persona = detectAssistantPersona(transcript, preference.nickname); const tone = toneFromWake(persona.wakeName, persona.mode); activeToneRef.current = tone;
      setWakeLabel(persona.wakeName ? `Hey ${persona.wakeName.replace(/\b\w/g, (letter) => letter.toUpperCase())}` : "");
      const reply = persona.mode === "MENTOR" ? `${persona.acknowledgement}. What shall we focus on?` : `${persona.acknowledgement}. What would you like me to take care of?`;
      setMessage(reply);
      if (remainingCommand) submitRef.current(remainingCommand); else { setState("SPEAKING"); let continued = false; const listenNext = () => { if (continued) return; continued = true; window.dispatchEvent(new CustomEvent(`${SITE_ASSISTANT_OPEN_EVENT}:listen`)); }; speak(reply, voiceClip("ready", tone), listenNext); window.setTimeout(listenNext, 4300); }
    } });
    return () => controller?.abort();
  }, [open, preference.nickname, speak, wakeArmed, wakeRestartToken, wakeSuppressed]);

  const startListening = useCallback(async () => {
    if (state === "LISTENING") { recognitionRef.current?.abort(); recognitionRef.current = null; stopMeter(); setState("READY"); return; }
    stopSpeaking(); setPermissionHelp("");
    const permission = await requestMicrophonePermission(); setMicPermission(permission.state);
    if (!permission.granted) { const device = detectVoiceDevice(navigator.userAgent, navigator.maxTouchPoints); setState("ERROR"); setMessage(permission.message); setPermissionHelp(device.permissionHelp); return; }
    localStorage.setItem("neet_mic_granted", "true");
    if (!supportsVoiceRecognition()) { setState("ERROR"); setMessage("This browser accepted the microphone but does not expose website speech recognition. Text mode remains available."); return; }
    setState("LISTENING"); setMessage("I’m listening — speak naturally."); setInterim("");
    try { meterCleanupRef.current = await startMicrophoneLevelMeter((level) => { audioLevelRef.current = level; }); } catch { /* Recognition can still proceed. */ }
    recognitionRef.current = listenOnce({ locale: "en-IN", onInterim: setInterim, onError: (error) => { stopMeter(); setState("ERROR"); setMessage(error); }, onEnd: () => { recognitionRef.current = null; stopMeter(); setState((current) => current === "LISTENING" ? "READY" : current); }, onResult: (transcript, confidence, alternatives) => {
      const selected = chooseAssistantTranscript(alternatives.length ? alternatives : [{ transcript, confidence }]);
      void submitCommand(selected?.transcript ?? transcript);
    } });
  }, [state, stopMeter, submitCommand]);
  useEffect(() => { const onListen = () => { if (state !== "LISTENING") void startListening(); }; window.addEventListener(`${SITE_ASSISTANT_OPEN_EVENT}:listen`, onListen); return () => window.removeEventListener(`${SITE_ASSISTANT_OPEN_EVENT}:listen`, onListen); }, [startListening, state]);

  const persistWakeMode = useCallback(async (interactionMode: "TAP" | "WAKE") => {
    setPreference((current) => ({ ...current, interactionMode }));
    await fetch("/api/voice/preferences", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...preference, interactionMode }) }).catch(() => {});
  }, [preference]);
  const enableHandsFree = useCallback(async () => {
    const permission = await requestMicrophonePermission(); setMicPermission(permission.state);
    if (!permission.granted || !supportsVoiceRecognition()) { setOpen(true); setState("ERROR"); setMessage(permission.granted ? "Wake listening is unavailable in this browser, but tap-to-speak and Text mode still work." : permission.message); if (!permission.granted) setPermissionHelp(detectVoiceDevice(navigator.userAgent, navigator.maxTouchPoints).permissionHelp); return; }
    localStorage.setItem("neet_mic_granted", "true"); await persistWakeMode("WAKE"); setWakeArmed(true); setMessage("Hands-free wake is active on every NEET Tracker page while this browser tab stays visible.");
  }, [persistWakeMode]);
  const toggleWake = useCallback(async () => { if (!wakeArmed) return enableHandsFree(); setWakeArmed(false); setWakeActive(false); await persistWakeMode("TAP"); }, [enableHandsFree, persistWakeMode, wakeArmed]);
  const undo = async () => {
    if (!result?.actionId) return; setUndoing(true);
    try { const response = await fetch(`/api/assistant/actions/${encodeURIComponent(result.actionId)}/undo`, { method: "POST" }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Undo failed"); setResult((current) => current ? { ...current, canUndo: false, href: undefined } : current); setState("DONE"); setMessage("Undone. The untouched topic was removed safely."); void loadContext(); }
    catch (error) { setState("ERROR"); setMessage(error instanceof Error ? error.message : "That action could not be undone."); }
    finally { setUndoing(false); }
  };
  const goTo = (href: string) => performNavigation(href);
  const actionSteps = useMemo(() => [
    { label: "Understanding your request", done: !["UNDERSTANDING", "READY", "LISTENING"].includes(state), active: state === "UNDERSTANDING" },
    { label: "Checking NEET Tracker data", done: ["SPEAKING", "DONE"].includes(state), active: state === "ACTING" },
    { label: "Returning the verified result", done: state === "DONE", active: state === "SPEAKING" },
  ], [state]);

  if (!open) {
    const needsActivation = preferenceLoaded && preference.interactionMode === "WAKE" && !wakeArmed;
    return <>{needsActivation ? <button className={styles.permissionNudge} onClick={() => void enableHandsFree()}><Mic size={15} /><span><strong>{micPermission === "denied" ? "Fix microphone access" : "Enable “Hey Bubu”"}</strong><small>{micPermission === "denied" ? "Allow Microphone in this site’s settings" : "One tap for microphone access"}</small></span></button> : null}<span className={`${styles.wakeSentinel} ${wakeActive ? styles.wakeSentinelActive : ""}`} aria-hidden="true" /></>;
  }

  const activeConversation = !["READY", "DONE", "ERROR"].includes(state);
  const assistantName = preference.discreetMode ? "Study assistant" : `${preference.nickname}'s assistant`;
  const planPct = context?.visibleTaskCount ? Math.round((context.completedTaskCount / context.visibleTaskCount) * 100) : 0;
  const stats = context?.stats;
  const listening = state === "LISTENING";

  return <div className={styles.backdrop}>
    <section className={styles.shell} role="dialog" aria-modal="true" aria-label={`${assistantName} agent workspace`}>

      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}><Sparkles size={18} /></span>
          <div><strong>{assistantName}</strong><small>Agent workspace</small></div>
        </div>

        {mode === "TEXT" ? <form
          className={styles.omni}
          onSubmit={(event) => { event.preventDefault(); const next = omni.trim(); if (next) { setOmni(""); void submitCommand(next); } }}
        >
          <Search size={15} />
          <input
            value={omni}
            onChange={(event) => setOmni(event.target.value)}
            placeholder="Ask anything or use a quick command…"
            aria-label="Ask the assistant"
          />
          <kbd>↵</kbd>
        </form> : <span className={styles.omniQuiet} aria-hidden="true" />}

        <div className={styles.topActions}>
          {stats?.streak ? <span className={styles.streakChip}><Flame size={14} />{stats.streak} day streak</span> : null}
          <button
            className={wakeArmed ? styles.wakeOn : ""}
            onClick={() => void toggleWake()}
            aria-label={wakeArmed ? "Turn off wake words" : "Enable wake words"}
          ><Waves size={15} /><span className={mode === "VOICE" ? styles.srOnly : ""}>{wakeArmed ? "Hands-free" : "Arm wake"}</span></button>
          <button className={styles.railToggle} onClick={() => setRailOpen(true)} aria-label="Open agent control rail"><PanelRight size={17} /></button>
          <button className={styles.closeButton} onClick={close} aria-label="Close assistant"><X size={18} /></button>
        </div>
      </header>

      <div className={styles.body}>
        <nav className={styles.navRail} aria-label="Workspace shortcuts">
          {NAV_RAIL.map(({ icon: Icon, label, href }) => (
            <button key={href} onClick={() => goTo(href)} aria-label={label} data-tip={label}><Icon size={18} /></button>
          ))}
        </nav>

        <div className={styles.workspace}>
          <main className={styles.voicePanel}>
            <div className={styles.voiceHead}>
              <div className={styles.modeSwitch} role="tablist" aria-label="Assistant input mode">
                <button role="tab" aria-selected={mode === "VOICE"} className={mode === "VOICE" ? styles.modeActive : ""} onClick={() => { if (mode !== "VOICE") welcomeRef.current(activeToneRef.current); }}><Waves size={14} /> Voice mode</button>
                <button role="tab" aria-selected={mode === "TEXT"} className={mode === "TEXT" ? styles.modeActive : ""} onClick={() => { recognitionRef.current?.abort(); recognitionRef.current = null; stopMeter(); stopSpeaking(); setMode("TEXT"); setState("READY"); setMessage("Type what you would like me to take care of."); }}><Send size={13} /> Text mode</button>
              </div>
              <div className={`${styles.liveState} ${state === "SPEAKING" ? styles.liveStateBlue : ""}`} aria-label={stateLabel(state)}><i /><span className={mode === "VOICE" ? styles.srOnly : ""}>{stateLabel(state)}</span></div>
            </div>

            <div className={styles.stage}>
              <StudyPulseScene state={visualState(state)} audioLevelRef={audioLevelRef} className={styles.scene} />
              {mode === "TEXT" ? <div className={styles.conversation} aria-live="polite">
                <span className={`${styles.eyebrow} ${state === "SPEAKING" ? styles.blueEyebrow : ""}`}><Waves size={12} />{wakeLabel || stateLabel(state)}</span>
                <h1>{message}</h1>
                <span className={styles.modePill}><Heart size={11} />{toneLabel(activeToneRef.current)}</span>
                {interim ? <p className={styles.transcript}>“{interim}”</p> : command && state !== "READY" ? <p className={styles.transcript}>“{command}”</p> : null}
              </div> : <span className={styles.srOnly} aria-live="polite">{stateLabel(state)}. {message}</span>}
            </div>

            {!activeConversation && mode === "TEXT" ? <div className={styles.quickCommands}>
              {QUICK_COMMANDS.map(({ icon: Icon, title, detail, command: quickCommand, accent }) => (
                <button key={title} onClick={() => void submitCommand(quickCommand)} style={{ "--accent": accent } as React.CSSProperties}>
                  <i><Icon size={16} /></i>
                  <span><strong>{title}</strong><small>{detail}</small></span>
                </button>
              ))}
            </div> : null}

            {mode === "TEXT" && activeConversation && ["UNDERSTANDING", "ACTING", "SPEAKING"].includes(state) ? <div className={styles.executionSteps}>
              {actionSteps.map((step) => (
                <div key={step.label} className={step.active ? styles.stepActive : step.done ? styles.stepDone : ""}>
                  {step.done ? <Check /> : step.active ? <Loader2 className={styles.spin} /> : <Circle />}<span>{step.label}</span>
                </div>
              ))}
            </div> : null}

            {permissionHelp ? <div className={styles.permissionHelp}><ShieldCheck /><span>{permissionHelp}</span></div> : null}

            {mode === "TEXT" && result?.choices?.length ? <div className={styles.choices}>
              {result.choices.map((choice) => choice.utterance
                ? <button key={choice.label} onClick={() => void submitCommand(choice.utterance as string)}>{choice.label}<ArrowRight /></button>
                : <a key={choice.label} href={choice.href}>{choice.label}<ExternalLink /></a>)}
            </div> : null}

            {mode === "TEXT" && state === "DONE" && result ? <div className={styles.resultActions}>
              {result.canUndo ? <button onClick={() => void undo()} disabled={undoing}>{undoing ? <Loader2 className={styles.spin} /> : <RotateCcw />} Undo</button> : null}
              {result.href ? <a href={result.href}>Open now <ArrowRight /></a> : null}
              {preference.speechEnabled && result.reply && lastVoiceClip ? <button onClick={() => speak(result.reply as string, lastVoiceClip)}><Volume2 /> Replay</button> : null}
            </div> : null}

            {mode === "VOICE" ? <div className={styles.dock}>
              <button
                className={styles.dockMic}
                onClick={() => void startListening()}
                aria-label={listening ? "Stop listening" : "Start listening"}
                data-live={listening ? "true" : undefined}
              >{listening ? <MicOff size={18} /> : <Mic size={18} />}</button>

              <div className={styles.dockMeter}>
                <VoiceWaveform audioLevelRef={audioLevelRef} active={listening || state === "SPEAKING"} className={styles.wave} />
                <span className={styles.srOnly}>{listening ? "Speak naturally" : state === "SPEAKING" ? "Replying" : "Wake word listening is active"}</span>
              </div>

              <button
                className={styles.dockGhost}
                onClick={() => setPreference((current) => ({ ...current, speechEnabled: !current.speechEnabled }))}
                aria-label={preference.speechEnabled ? "Mute assistant voice" : "Enable assistant voice"}
              >{preference.speechEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>

              <button className={styles.dockEnd} onClick={close} aria-label="End session"><X size={18} /></button>
            </div> : <form className={styles.textComposer} onSubmit={(event) => { event.preventDefault(); void submitCommand(command); }}>
              <input autoFocus value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Ask Bubu to open, create, plan, or review…" aria-label="Assistant command" />
              <button type="submit" disabled={!command.trim() || state === "ACTING" || state === "UNDERSTANDING"}><ArrowRight size={17} /></button>
            </form>}
          </main>

          <aside className={`${styles.rail} ${railOpen ? styles.railOpen : ""}`} aria-label="Agent control rail">
            <div className={styles.railHead}>
              <div><h2>Agent control rail</h2><span>Live NEET Tracker data</span></div>
              <button onClick={() => setRailOpen(false)} aria-label="Close control rail"><X size={16} /></button>
            </div>

            {contextLoading && !context ? <div className={styles.railLoading}><Loader2 className={styles.spin} /> Loading live progress…</div> : <div className={styles.railGrid}>

              <section className={styles.card}>
                <div className={styles.cardTitle}><h3>Today’s study plan</h3><a href="/todo">View full plan <ArrowRight /></a></div>
                <div className={styles.progressLine}><span>{context?.completedTaskCount ?? 0} / {context?.visibleTaskCount ?? 0} tasks completed</span><b>{planPct}%</b></div>
                <div className={styles.track}><i style={{ width: `${planPct}%` }} /></div>
                {context?.todayPlan.slice(0, 3).map((task) => (
                  <div className={styles.planRow} key={task.id}>
                    <Circle />
                    <span>{task.title}<small>{task.subject?.name ?? "Study task"}{task.plannedMinutes ? ` · ${task.plannedMinutes} min` : ""}</small></span>
                  </div>
                ))}
                {!context?.todayPlan.length ? <p className={styles.empty}>No pending tasks. Ask Bubu to plan tomorrow.</p> : null}
              </section>

              <section className={styles.card}>
                <div className={styles.cardTitle}><h3>Progress overview</h3><a href="/dashboard"><BarChart3 /></a></div>
                <div className={styles.overview}>
                  <div className={styles.ring} style={{ "--progress": `${context?.progress.percentage ?? 0}%` } as React.CSSProperties}>
                    <span><b>{context?.progress.percentage ?? 0}%</b><em>Syllabus</em></span>
                  </div>
                </div>
                <div className={styles.statRow}>
                  <div><small>Tests taken</small><strong>{stats?.testCount ?? 0}</strong></div>
                  <div><small>Avg score</small><strong>{stats?.avgScore ?? 0}<i>/720</i></strong></div>
                  <div><small>Topics</small><strong>{context?.progress.completedTopics ?? 0}<i>/{context?.progress.totalTopics ?? 0}</i></strong></div>
                </div>
              </section>

              <section className={styles.card}>
                <div className={styles.cardTitle}><h3>Weak subjects</h3><a href="/dashboard">Review all <ArrowRight /></a></div>
                {context?.weakSubjects.map((subject) => (
                  <a className={styles.weakRow} key={subject.slug} href={`/subjects/${subject.slug}`}>
                    <span>{subject.name}<i><b style={{ width: `${subject.percentage}%`, background: subject.color }} /></i></span>
                    <strong style={{ color: subject.color }}>{subject.percentage}%</strong>
                  </a>
                ))}
                {!context?.weakSubjects.length ? <p className={styles.empty}>Subject data will appear once topics are tracked.</p> : null}
              </section>

              <section className={styles.card}>
                <div className={styles.cardTitle}><h3>Upcoming tests</h3><a href="/practice">Build <ArrowRight /></a></div>
                {context?.upcomingTests.slice(0, 3).map((test) => (
                  <div className={styles.testRow} key={test.id}>
                    <ClipboardCheck />
                    <span>{test.title}<small>{test.subject?.name ?? "NEET"}</small></span>
                    <time>{test.dueDate ? new Date(test.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "Ready"}</time>
                  </div>
                ))}
                {!context?.upcomingTests.length ? <><p className={styles.empty}>No test scheduled yet.</p>{context?.recentTests.slice(0, 2).map((test) => (
                  <div className={styles.testRow} key={test.id}><Check /><span>{test.testName}<small>Recent · {test.percentage}%</small></span></div>
                ))}</> : null}
              </section>

              <section className={`${styles.card} ${styles.fullCard}`}>
                <div className={styles.cardTitle}><h3>Recent actions by {preference.discreetMode ? "the assistant" : preference.nickname}</h3><span>Audit trail</span></div>
                {context?.recentActions.map((action) => (
                  <div className={styles.actionRow} key={action.id}>
                    <time>{relativeTime(action.createdAt)}</time>
                    <span>{action.utterance}</span>
                    <em>{action.kind.replaceAll("_", " ")}</em>
                  </div>
                ))}
                {!context?.recentActions.length ? <p className={styles.empty}>Actions the assistant completes will appear here.</p> : null}
              </section>

            </div>}
          </aside>
        </div>
      </div>

      <footer className={`${styles.statusBar} ${mode === "VOICE" ? styles.statusBarVoice : ""}`}>
        {mode === "VOICE" ? <>
          <span className={styles.voiceStatusIcon} aria-label={wakeArmed ? "Assistant is online" : "Tap the microphone to speak"}><i className={wakeActive || wakeArmed ? styles.online : ""} /></span>
          <span className={styles.voiceStatusIcon} aria-label="Audio is never stored"><ShieldCheck size={13} /></span>
          <span className={styles.voiceStatusIcon} aria-label={wakeArmed ? "Wake-word is active" : "Wake-word is off"}><VoiceWaveform audioLevelRef={audioLevelRef} active={wakeActive} bars={14} className={styles.miniWave} /><i className={wakeActive ? styles.online : ""} /></span>
        </> : <>
          <span className={styles.statusWho}><i className={wakeActive || wakeArmed ? styles.online : ""} /><b>{preference.discreetMode ? "Assistant" : preference.nickname}</b><small>{wakeArmed ? "Online" : "Tap to speak"}</small></span>
          <span className={styles.statusPrivacy}><ShieldCheck size={13} />All conversations stay private — audio is never stored</span>
          <span className={styles.statusWake}>{wakeArmed ? "Wake-word is active" : "Wake-word is off"}<VoiceWaveform audioLevelRef={audioLevelRef} active={wakeActive} bars={14} className={styles.miniWave} /><i className={wakeActive ? styles.online : ""} /></span>
        </>}
      </footer>

    </section>
  </div>;
}
