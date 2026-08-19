"use client";

import { ArrowRight, Check, CheckCircle2, Heart, ListTodo, Loader2, Mic, MicOff, PencilLine, RotateCcw, Sparkles, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { getMicrophonePermissionState, listenOnce, requestMicrophonePermission, speakPrompt, stopSpeaking, supportsVoiceRecognition, type MicrophonePermissionState } from "@/lib/browser-voice";
import type { PrivateVoiceClipId } from "@/lib/private-voice";
import { VOICE_ONBOARDING_VERSION } from "@/lib/private-voice";
import { resolveStudyAllocations, type StudyActivityKindValue, type StudyCoverageValue, type StudyTopicDirectoryItem } from "@/lib/study-activity";
import { detectVoiceDevice, type VoiceDeviceProfile } from "@/lib/voice-device";
import { SITE_ASSISTANT_PREFERENCE_EVENT, SITE_ASSISTANT_WAKE_PAUSE_EVENT } from "@/lib/site-assistant";
import { isAffirmative, isNegative, isSkipUtterance, parseCompactStudyAnswer, parseSpokenNumber, parseTomorrowTasks, type TomorrowTaskDraft } from "@/lib/voice-assistant";

type Subject = { id: string; name: string; slug: string; color: string; emoji: string };
type SubjectDraft = {
  active: boolean;
  studyText: string;
  topicId: string | null;
  topicName: string | null;
  chapter: string;
  classLevel: string | null;
  kind: StudyActivityKindValue;
  coverage: StudyCoverageValue;
  hours: number;
  hoursDelta: number;
  questions: number;
  questionsDelta: number;
  previousTopicQuestions: number;
  intensity: number;
  completionConfirmed: boolean;
  weakConcepts: string;
  notes: string;
  allocations: Array<{
    topicId: string | null;
    topicName: string | null;
    chapter: string;
    classLevel: string | null;
    questionsDelta: number;
    previousTopicQuestions: number;
  }>;
};
type Preference = {
  nickname: "Bubu" | "Shona";
  locale: string;
  preferredVoice: string | null;
  speechEnabled: boolean;
  onboardingSeen: boolean;
  onboardingVersion: number;
  interactionMode: "TAP" | "WAKE";
  affectionMode: "WARM" | "DISCREET";
  discreetMode: boolean;
};
type WizardStep =
  | { kind: "studySummary"; subject: Subject }
  | { kind: "discipline" | "completion" | "tomorrow" | "review" };
type StudySuggestion = {
  id: string;
  kind: "REVISION" | "TEST";
  title: string;
  reason: string;
  description: string | null;
  subjectId: string | null;
  plannedMinutes: number | null;
  dueDate: string;
};

const DEFAULT_PREFERENCE: Preference = {
  nickname: "Bubu",
  locale: "en-IN",
  preferredVoice: null,
  speechEnabled: true,
  onboardingSeen: false,
  onboardingVersion: 0,
  interactionMode: "WAKE",
  affectionMode: "WARM",
  discreetMode: false,
};

const DEFAULT_DEVICE_PROFILE: VoiceDeviceProfile = detectVoiceDevice("");

function promptFor(step: WizardStep, nickname: string) {
  if (step.kind === "studySummary") return `${nickname}, tell me your complete ${step.subject.name} update in one calm answer: chapter or topic, new learning, practice or revision, full or partial, time, questions, intensity from one to five, whether it is completed, and any weak concept. Say no weak concept if there was none, or skip ${step.subject.name}.`;
  if (step.kind === "discipline") return "What was your overall discipline score out of one hundred?";
  if (step.kind === "completion") return "What percentage of today's plan did you complete?";
  if (step.kind === "tomorrow") return "Last question. What are you going to study tomorrow? Say skip if you do not want any Todo tasks.";
  return `Here is your complete review, ${nickname}. Check every value and tomorrow's Todo tasks. Say yes to save, or edit anything on screen.`;
}

function clipForStep(step: WizardStep, nickname: "Bubu" | "Shona"): PrivateVoiceClipId {
  const nick = nickname.toLowerCase();
  if (step.kind === "studySummary") return `study-${step.subject.slug}-${nick}` as PrivateVoiceClipId;
  if (step.kind === "discipline" || step.kind === "tomorrow") return step.kind;
  if (step.kind === "completion") return "plan-completion";
  return `review-${nick}` as PrivateVoiceClipId;
}

function createSubjectDraft(initial?: { hours: string; questions: string; intensity: string; notes: string }): SubjectDraft {
  return {
    active: false,
    studyText: "",
    topicId: null,
    topicName: null,
    chapter: "",
    classLevel: null,
    kind: "PRACTICE",
    coverage: "PARTIAL",
    hours: Number(initial?.hours) || 0,
    hoursDelta: 0,
    questions: Number(initial?.questions) || 0,
    questionsDelta: 0,
    previousTopicQuestions: 0,
    intensity: Number(initial?.intensity) || 0,
    completionConfirmed: false,
    weakConcepts: "",
    notes: initial?.notes ?? "",
    allocations: [],
  };
}

export default function VoiceDailyLog({
  subjects,
  selectedDate,
  initialValues,
  initialDiscipline,
  initialCompletion,
  onSaved,
  onApplyToManual,
}: {
  subjects: Subject[];
  selectedDate: string;
  initialValues: Record<string, { hours: string; questions: string; intensity: string; notes: string }>;
  initialDiscipline: string;
  initialCompletion: string;
  onSaved: () => Promise<void> | void;
  onApplyToManual: (values: Record<string, { hours: string; questions: string; intensity: string; notes: string }>, meta: { disciplineScore: string; completionPercent: string }) => void;
}) {
  const recognitionRef = useRef<{ abort(): void } | null>(null);
  const startListeningRef = useRef<() => void>(() => {});
  const autoOpenedRef = useRef(false);
  const [preference, setPreference] = useState<Preference>(DEFAULT_PREFERENCE);
  const [preferenceReady, setPreferenceReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<Record<string, SubjectDraft>>({});
  const [discipline, setDiscipline] = useState(0);
  const [completion, setCompletion] = useState(0);
  const [tomorrowText, setTomorrowText] = useState("");
  const [todos, setTodos] = useState<TomorrowTaskDraft[]>([]);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [heard, setHeard] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [microphonePermission, setMicrophonePermission] = useState<MicrophonePermissionState>("unknown");
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState("");
  const [topicDirectory, setTopicDirectory] = useState<Record<string, StudyTopicDirectoryItem[]>>({});
  const [contextLoading, setContextLoading] = useState(false);
  const [lastSubmissionId, setLastSubmissionId] = useState<string | null>(null);
  const [pendingStudyAnswers, setPendingStudyAnswers] = useState<Record<string, string>>({});
  const [deviceProfile, setDeviceProfile] = useState<VoiceDeviceProfile>(DEFAULT_DEVICE_PROFILE);
  const [followUpPrompt, setFollowUpPrompt] = useState("");
  const [suggestions, setSuggestions] = useState<StudySuggestion[]>([]);
  const [addingSuggestion, setAddingSuggestion] = useState<string | null>(null);
  const [addedSuggestions, setAddedSuggestions] = useState<string[]>([]);

  const steps = useMemo<WizardStep[]>(() => [
    ...subjects.map((subject) => ({ kind: "studySummary" as const, subject })),
    { kind: "discipline" },
    { kind: "completion" },
    { kind: "tomorrow" },
    { kind: "review" },
  ], [subjects]);
  const step = steps[Math.min(stepIndex, Math.max(steps.length - 1, 0))];
  const progress = steps.length ? Math.round(((stepIndex + 1) / steps.length) * 100) : 0;
  const basePrompt = step ? promptFor(step, preference.nickname) : "Preparing your study log.";
  const prompt = followUpPrompt || basePrompt;

  useEffect(() => {
    queueMicrotask(() => setDeviceProfile(detectVoiceDevice(navigator.userAgent, navigator.maxTouchPoints)));
    fetch("/api/voice/preferences", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : DEFAULT_PREFERENCE)
      .then((payload) => {
        const next = { ...DEFAULT_PREFERENCE, ...payload } as Preference;
        setPreference(next);
        setShowOnboarding(next.onboardingVersion < VOICE_ONBOARDING_VERSION);
      })
      .finally(() => setPreferenceReady(true));
    void getMicrophonePermissionState().then(setMicrophonePermission);
  }, []);

  useEffect(() => {
    if (!wizardOpen || !step || !preference.speechEnabled) return;
    speakPrompt(prompt, {
      ...preference,
      enabled: true,
      clipId: followUpPrompt ? "assistant-clarify-warm" : clipForStep(step, preference.nickname),
      onEnded: () => {
        if (microphonePermission === "granted") window.setTimeout(() => startListeningRef.current(), 180);
      },
    });
    return stopSpeaking;
  }, [followUpPrompt, microphonePermission, preference, prompt, step, wizardOpen]);

  useEffect(() => () => {
    recognitionRef.current?.abort();
    stopSpeaking();
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent(SITE_ASSISTANT_WAKE_PAUSE_EVENT, { detail: { paused: wizardOpen } }));
    return () => {
      if (wizardOpen) window.dispatchEvent(new CustomEvent(SITE_ASSISTANT_WAKE_PAUSE_EVENT, { detail: { paused: false } }));
    };
  }, [wizardOpen]);

  const resetDraft = useCallback(() => {
    setDraft(Object.fromEntries(subjects.map((subject) => {
      const initial = initialValues[subject.id];
      return [subject.id, createSubjectDraft(initial)];
    })));
    setDiscipline(Number(initialDiscipline) || 0);
    setCompletion(Number(initialCompletion) || 0);
    setTomorrowText("");
    setTodos([]);
    setStepIndex(0);
    setTypedAnswer("");
    setHeard("");
    setInterim("");
    setError("");
    setSaved(false);
    setLastSubmissionId(null);
    setPendingStudyAnswers({});
    setFollowUpPrompt("");
    setSuggestions([]);
    setAddedSuggestions([]);
  }, [initialCompletion, initialDiscipline, initialValues, subjects]);

  const openWizard = useCallback(async () => {
    resetDraft();
    setWizardOpen(true);
    setContextLoading(true);
    try {
      const response = await fetch("/api/study-activities/context", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to load the chapter directory");
      setTopicDirectory(Object.fromEntries((payload.subjects ?? []).map((subject: { id: string; topics: StudyTopicDirectoryItem[] }) => [subject.id, subject.topics])));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load the chapter directory");
    } finally {
      setContextLoading(false);
    }
  }, [resetDraft]);

  useEffect(() => {
    if (autoOpenedRef.current || !preferenceReady || !subjects.length || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("voice") !== "1") return;
    autoOpenedRef.current = true;
    params.delete("voice");
    window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`);
    void openWizard();
  }, [openWizard, preferenceReady, subjects.length]);

  const advance = useCallback((amount = 1) => {
    setTypedAnswer("");
    setInterim("");
    setError("");
    setFollowUpPrompt("");
    setStepIndex((current) => Math.min(current + amount, steps.length - 1));
  }, [steps.length]);

  const saveReviewedLog = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const requestId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      const response = await fetch("/api/daily-goals/voice-confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId,
          date: selectedDate,
          disciplineScore: discipline,
          completionPercent: completion,
          entries: subjects.map((subject) => {
            const value = draft[subject.id] ?? createSubjectDraft();
            return {
              subjectId: subject.id,
              hoursStudied: value.hours,
              questionsSolved: value.questions,
              intensityLevel: value.intensity,
              notes: value.notes,
            };
          }),
          activities: subjects.flatMap((subject) => {
            const value = draft[subject.id] ?? createSubjectDraft();
            if (!value.active || !value.allocations.length) return [];
            return value.allocations.map((allocation, index) => ({
              subjectId: subject.id,
              topicId: allocation.topicId,
              chapter: allocation.chapter,
              kind: value.kind,
              coverage: value.coverage,
              hoursStudied: index === 0 ? value.hoursDelta : 0,
              questionsDelta: allocation.questionsDelta,
              intensityLevel: value.intensity,
              notes: value.studyText,
              weakConcepts: value.weakConcepts,
              completionConfirmed: value.completionConfirmed && (allocation.topicId !== null || value.coverage === "FULL"),
            }));
          }),
          todos,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to save the reviewed voice log");
      setLastSubmissionId(typeof payload.submissionId === "string" ? payload.submissionId : null);
      setSuggestions(Array.isArray(payload.suggestions) ? payload.suggestions : []);
      setSaved(true);
      speakPrompt(`Perfect, ${preference.nickname}. Your study log is saved${todos.length ? ` and ${todos.length} task${todos.length === 1 ? " is" : "s are"} waiting in Todo for tomorrow` : ""}.`, { ...preference, enabled: preference.speechEnabled, clipId: `saved-${preference.nickname.toLowerCase()}` as PrivateVoiceClipId });
      await onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save the reviewed voice log");
    } finally {
      setSaving(false);
    }
  }, [completion, discipline, draft, onSaved, preference, saving, selectedDate, subjects, todos]);

  const addSuggestionToTodo = useCallback(async (suggestion: StudySuggestion) => {
    if (addingSuggestion || addedSuggestions.includes(suggestion.id)) return;
    setAddingSuggestion(suggestion.id);
    setError("");
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: suggestion.title,
          description: suggestion.description,
          subjectId: suggestion.subjectId,
          dueDate: suggestion.dueDate,
          plannedMinutes: suggestion.plannedMinutes,
          aiAssistEnabled: false,
          source: "VOICE_ASSISTANT",
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to add this suggestion");
      setAddedSuggestions((current) => [...current, suggestion.id]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to add this suggestion");
    } finally {
      setAddingSuggestion(null);
    }
  }, [addedSuggestions, addingSuggestion]);

  const undoLastSave = useCallback(async () => {
    if (!lastSubmissionId || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/daily-goals/voice-confirm/${lastSubmissionId}/undo`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to undo this update");
      setSaved(false);
      setLastSubmissionId(null);
      await onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to undo this update");
    } finally {
      setSaving(false);
    }
  }, [lastSubmissionId, onSaved, saving]);

  const acceptAnswer = useCallback((raw: string) => {
    if (!step) return;
    const answer = raw.trim();
    if (!answer) return;
    setHeard(answer);
    setError("");
    if (step.kind === "review") {
      if (isAffirmative(answer)) void saveReviewedLog();
      else if (isNegative(answer)) setError("No problem—edit the highlighted fields below, then press Save reviewed log.");
      else setError("Please say yes to save, or edit the review on screen.");
      return;
    }
    if (step.kind === "studySummary") {
      if (isSkipUtterance(answer)) {
        setDraft((current) => ({ ...current, [step.subject.id]: { ...(current[step.subject.id] ?? createSubjectDraft()), active: false } }));
        advance();
        return;
      }
      const accumulated = [pendingStudyAnswers[step.subject.id], answer].filter(Boolean).join(". ");
      const summary = parseCompactStudyAnswer(accumulated);
      const allocationResult = resolveStudyAllocations(accumulated, topicDirectory[step.subject.id] ?? []);
      if (allocationResult.needsChapter) {
        setPendingStudyAnswers((current) => ({ ...current, [step.subject.id]: accumulated }));
        setFollowUpPrompt(`I recorded ${allocationResult.totalQuestions ?? summary.questions ?? 0} ${step.subject.name} questions. Which chapter or topic were they from? You can name one, or split them across several, for example “20 from Morphology and 25 from Anatomy.”`);
        setError("");
        return;
      }
      if (allocationResult.needsAllocation) {
        setPendingStudyAnswers((current) => ({ ...current, [step.subject.id]: accumulated }));
        setFollowUpPrompt(`I found ${allocationResult.matches.map((match) => match.topicName ?? match.chapter).join(" and ")}. Tell me how many questions belong to each one.`);
        setError("");
        return;
      }
      const allocations = allocationResult.matches.map((match) => {
        const matchedTopic = match.topicId ? (topicDirectory[step.subject.id] ?? []).find((topic) => topic.id === match.topicId) : null;
        return {
          topicId: match.topicId,
          topicName: match.topicName,
          chapter: match.chapter,
          classLevel: match.classLevel,
          questionsDelta: match.questions ?? 0,
          previousTopicQuestions: matchedTopic?.questionsSolved ?? 0,
        };
      });
      const allocatedQuestions = allocations.reduce((sum, allocation) => sum + allocation.questionsDelta, 0);
      const questionsDelta = allocations.length > 1 ? allocatedQuestions : allocationResult.totalQuestions ?? allocatedQuestions;
      const hoursDelta = summary.hours ?? 0;
      if (!allocations.length && questionsDelta > 0) {
        setPendingStudyAnswers((current) => ({ ...current, [step.subject.id]: accumulated }));
        setFollowUpPrompt(`Which ${step.subject.name} chapter or topic should receive these ${questionsDelta} questions?`);
        return;
      }
      const primary = allocations[0] ?? null;
      setDraft((current) => ({
        ...current,
        [step.subject.id]: {
          ...(current[step.subject.id] ?? createSubjectDraft()),
          active: hoursDelta > 0 || questionsDelta > 0 || allocations.length > 0,
          studyText: accumulated,
          topicId: primary?.topicId ?? null,
          topicName: primary?.topicName ?? null,
          chapter: primary?.chapter ?? "",
          classLevel: primary?.classLevel ?? null,
          kind: summary.kind ?? "PRACTICE",
          coverage: summary.coverage ?? "PARTIAL",
          hours: (current[step.subject.id]?.hours ?? (Number(initialValues[step.subject.id]?.hours) || 0)) + hoursDelta,
          hoursDelta,
          questions: (current[step.subject.id]?.questions ?? (Number(initialValues[step.subject.id]?.questions) || 0)) + questionsDelta,
          questionsDelta,
          intensity: summary.intensity ?? (current[step.subject.id]?.intensity ?? 0),
          completionConfirmed: summary.completionConfirmed ?? false,
          weakConcepts: summary.weakConcepts,
          previousTopicQuestions: primary?.previousTopicQuestions ?? 0,
          allocations,
        },
      }));
      setPendingStudyAnswers((current) => {
        const next = { ...current };
        delete next[step.subject.id];
        return next;
      });
      advance();
      return;
    }
    if (step.kind === "discipline" || step.kind === "completion") {
      const value = parseSpokenNumber(answer);
      if (value === null) return setError("Please give a score between zero and one hundred.");
      const bounded = Math.max(0, Math.min(100, Math.round(value)));
      if (step.kind === "discipline") setDiscipline(bounded); else setCompletion(bounded);
      advance();
      return;
    }
    if (step.kind === "tomorrow") {
      setTomorrowText(answer);
      setTodos(parseTomorrowTasks(answer, subjects));
      advance();
    }
  }, [advance, initialValues, pendingStudyAnswers, saveReviewedLog, step, subjects, topicDirectory]);

  const enableMicrophone = useCallback(async () => {
    setPermissionBusy(true);
    setError("");
    const result = await requestMicrophonePermission();
    setMicrophonePermission(result.state);
    setPermissionMessage(result.message);
    setPermissionBusy(false);
    if (!result.granted) setError(result.message);
    return result.granted;
  }, []);

  const startListening = useCallback(async () => {
    if (listening) {
      recognitionRef.current?.abort();
      setListening(false);
      return;
    }
    const permissionGranted = microphonePermission === "granted" || await enableMicrophone();
    if (!permissionGranted) return;
    stopSpeaking();
    setError("");
    setInterim("");
    setListening(true);
    recognitionRef.current = listenOnce({
      locale: preference.locale,
      onInterim: setInterim,
      onResult: (text) => acceptAnswer(text),
      onError: setError,
      onEnd: () => setListening(false),
    });
  }, [acceptAnswer, enableMicrophone, listening, microphonePermission, preference.locale]);

  useEffect(() => {
    startListeningRef.current = () => { void startListening(); };
  }, [startListening]);

  const finishOnboarding = async () => {
    let microphoneReady = microphonePermission === "granted";
    if (preference.speechEnabled && microphonePermission !== "granted") {
      microphoneReady = await enableMicrophone();
      if (!microphoneReady) return;
    }
    const next = { ...preference, onboardingSeen: true, onboardingVersion: VOICE_ONBOARDING_VERSION };
    const response = await fetch("/api/voice/preferences", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
    if (!response.ok) {
      setPermissionMessage("Your setup could not be saved. Nothing was lost—please try once more.");
      return;
    }
    setPreference(next);
    setShowOnboarding(false);
    speakPrompt(`Hey ${next.nickname}. I can now help you log each subject, update chapter progress and prepare tomorrow's tasks without tedious typing.`, { ...next, enabled: next.speechEnabled, clipId: `onboarding-${next.nickname.toLowerCase()}` as PrivateVoiceClipId });
    if (next.interactionMode === "WAKE" && microphoneReady) localStorage.setItem("neet_mic_granted", "true");
    window.dispatchEvent(new CustomEvent(SITE_ASSISTANT_PREFERENCE_EVENT, { detail: next }));
  };

  const applyToManual = () => {
    onApplyToManual(
      Object.fromEntries(subjects.map((subject) => {
        const value = draft[subject.id] ?? createSubjectDraft();
        return [subject.id, { hours: String(value.hours || ""), questions: String(value.questions || ""), intensity: String(value.intensity || ""), notes: value.notes }];
      })),
      { disciplineScore: String(discipline || ""), completionPercent: String(completion || "") },
    );
    setWizardOpen(false);
  };

  return <>
    <div className="voice-entry-dock">
      <div className="voice-entry-copy"><span><Sparkles size={13} /> Faster daily logging</span><strong>Speak the day. Review it. Save once.</strong><small>Tomorrow plans are created directly in Todo after confirmation.</small></div>
      <button type="button" onClick={openWizard} disabled={!preferenceReady || !subjects.length}><Mic size={17} /> Start voice log</button>
    </div>

    {showOnboarding && typeof document !== "undefined" && createPortal(<div className="voice-overlay"><section className="onboarding-card" role="dialog" aria-modal="true" aria-label="Meet your study voice companion">
      <div className="assistant-orb"><Heart size={25} /><span /></div>
      <span className="onboarding-kicker">A gentler way to log the day</span>
      <h2>Meet your study voice companion.</h2>
      <p>Adarsh&apos;s private assistant voice will ask one clear question at a time, show every answer for review, update confirmed chapter progress, and create approved plans in tomorrow&apos;s Todo deck.</p>
      <div className="device-note"><strong>{deviceProfile.label} setup</strong><span>{deviceProfile.wakeScope}</span></div>
      <div className="nickname-choice"><span>What should the assistant call you?</span><div>{(["Bubu", "Shona"] as const).map((nickname) => <button key={nickname} className={preference.nickname === nickname ? "active" : ""} onClick={() => setPreference((current) => ({ ...current, nickname }))}>{nickname}</button>)}</div></div>
      <div className="interaction-choice"><span>How should listening start?</span><div><button className={preference.interactionMode === "TAP" ? "active" : ""} onClick={() => setPreference((current) => ({ ...current, interactionMode: "TAP" }))}><strong>Tap to speak</strong><small>Most reliable on iPad and Samsung</small></button><button className={preference.interactionMode === "WAKE" ? "active" : ""} onClick={() => setPreference((current) => ({ ...current, interactionMode: "WAKE" }))}><strong>Wake words</strong><small>Hey Bubu, Shona, Coach and more</small></button></div></div>
      <button className="speech-toggle" onClick={() => setPreference((current) => ({ ...current, speechEnabled: !current.speechEnabled }))}>{preference.speechEnabled ? <Volume2 /> : <VolumeX />}<span><strong>{preference.speechEnabled ? "Spoken and written prompts" : "Written prompts only"}</strong><small>You can change this later.</small></span><Check className={preference.speechEnabled ? "checked" : ""} /></button>
      {preference.speechEnabled && <button className={`permission-button ${microphonePermission === "granted" ? "ready" : ""}`} onClick={() => void enableMicrophone()} disabled={permissionBusy}>{permissionBusy ? <Loader2 className="spin" /> : microphonePermission === "granted" ? <CheckCircle2 /> : <Mic />}<span><strong>{microphonePermission === "granted" ? "Microphone ready" : "Allow microphone access"}</strong><small>{microphonePermission === "granted" ? "You can answer each question by voice." : "Your browser will ask for permission."}</small></span></button>}
      {permissionMessage && <p className={`permission-message ${microphonePermission === "denied" ? "blocked" : ""}`} role="status">{permissionMessage}</p>}
      {microphonePermission === "denied" && <p className="device-permission-help">{deviceProfile.permissionHelp}</p>}
      <button className="meet-button" onClick={() => void finishOnboarding()}><Sparkles size={16} /> Meet your companion</button>
      <small className="privacy-note">{preference.interactionMode === "WAKE" ? "Wake listening runs only while this site is visible and armed." : "The microphone starts only when you press it."} Raw audio is not saved in the project database.</small>
    </section></div>, document.body)}

    {wizardOpen && step && typeof document !== "undefined" && createPortal(<div className="voice-overlay" onMouseDown={() => setWizardOpen(false)}><section className="wizard-card" role="dialog" aria-modal="true" aria-label="Guided daily voice log" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span><Sparkles size={13} /> {preference.nickname}&apos;s study companion</span><strong>{step.kind === "review" ? "Review before anything is saved" : "One answer at a time"}</strong></div><button onClick={() => setWizardOpen(false)} aria-label="Close voice log"><X /></button></header>
      <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
      <div className="wizard-body">
        {saved ? <div className="save-success"><CheckCircle2 /><h2>Everything is safely recorded.</h2><p>Your daily totals, confirmed chapter progress and revisions are saved together. {todos.length ? `${todos.length} approved task${todos.length === 1 ? "" : "s"} ${todos.length === 1 ? "is" : "are"} now in Todo for tomorrow.` : "No Todo tasks were requested."}</p>{suggestions.length > 0 && <section className="post-log-suggestions" aria-label="Bubu's next-step suggestions"><span><Sparkles size={14} /> Before you go</span><h3>I found {suggestions.length === 1 ? "one useful next step" : "two useful next steps"} from today&apos;s confirmed log.</h3>{suggestions.map((suggestion) => <article key={suggestion.id}><div><strong>{suggestion.title}</strong><small>{suggestion.reason}</small></div><button onClick={() => void addSuggestionToTodo(suggestion)} disabled={addingSuggestion === suggestion.id || addedSuggestions.includes(suggestion.id)}>{addedSuggestions.includes(suggestion.id) ? <><Check size={14} /> Added</> : addingSuggestion === suggestion.id ? <Loader2 className="spin" /> : <><ListTodo size={14} /> Add to Todo</>}</button></article>)}</section>}{error && <p className="voice-error" role="alert">{error}</p>}<div><a href="/todo"><ListTodo size={16} /> Open Todo deck</a>{lastSubmissionId && <button onClick={() => void undoLastSave()} disabled={saving}><RotateCcw size={15} /> Undo update</button>}<button onClick={() => setWizardOpen(false)}>Done</button></div></div> : step.kind === "review" ? <div className="review-stage">
          <div className="prompt-bubble"><Sparkles /><div><span>Final check</span><h2>{prompt}</h2></div></div>
          <div className="review-subjects">{subjects.map((subject) => { const value = draft[subject.id] ?? createSubjectDraft(); return <div key={subject.id} className={value.active ? "active-study" : "skipped-study"} style={{ "--subject": subject.color } as React.CSSProperties}><div className="review-subject-head"><strong>{subject.emoji} {subject.name}</strong>{value.active ? <><span>{value.allocations.length ? value.allocations.map((allocation) => allocation.topicName ?? allocation.chapter).join(" · ") : "Subject totals only"}</span><small>{value.kind.replaceAll("_", " ").toLowerCase()} · {value.coverage.toLowerCase()}</small>{value.allocations.map((allocation) => <small key={`${allocation.topicId}-${allocation.chapter}`}>{allocation.topicName ?? allocation.chapter}: +{allocation.questionsDelta} questions{allocation.topicId ? ` (${allocation.previousTopicQuestions} → ${allocation.previousTopicQuestions + allocation.questionsDelta})` : ""}</small>)}{value.completionConfirmed && <em><Check size={11} /> Confirmed completion will be marked</em>}{value.weakConcepts && <small>Watch: {value.weakConcepts}</small>}</> : <small>No new activity — existing daily values stay unchanged</small>}</div><label>Today hours<input type="number" step="0.25" min="0" max="24" value={value.hours} onChange={(event) => setDraft((current) => ({ ...current, [subject.id]: { ...value, hours: Number(event.target.value) } }))} /></label><label>Today questions<input type="number" min="0" value={value.questions} onChange={(event) => setDraft((current) => ({ ...current, [subject.id]: { ...value, questions: Number(event.target.value) } }))} /></label><label>Intensity<input type="number" min="0" max="5" value={value.intensity} onChange={(event) => setDraft((current) => ({ ...current, [subject.id]: { ...value, intensity: Number(event.target.value) } }))} /></label></div>; })}</div>
          <div className="review-meta"><label>Discipline / 100<input type="number" min="0" max="100" value={discipline} onChange={(event) => setDiscipline(Number(event.target.value))} /></label><label>Completion %<input type="number" min="0" max="100" value={completion} onChange={(event) => setCompletion(Number(event.target.value))} /></label></div>
          <div className="todo-review"><div><span><ListTodo size={15} /> Tomorrow · Todo deck</span><small>{tomorrowText || "No spoken plan"}</small></div>{todos.length ? todos.map((todo, index) => <div className="todo-draft" key={`${todo.subjectId}-${index}`}><input value={todo.title} onChange={(event) => setTodos((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, title: event.target.value } : entry))} /><label><input type="number" min="5" value={todo.plannedMinutes ?? ""} placeholder="min" onChange={(event) => setTodos((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, plannedMinutes: Number(event.target.value) || null } : entry))} /> min</label><button onClick={() => setTodos((current) => current.filter((_, entryIndex) => entryIndex !== index))} aria-label="Remove Todo task"><Trash2 /></button></div>) : <p>No Todo tasks will be created. That is completely fine.</p>}</div>
          {error && <p className="voice-error" role="alert">{error}</p>}
          <div className="review-actions"><button className="listen-mini" onClick={() => void startListening()}>{listening ? <MicOff /> : <Mic />} {listening ? "Listening…" : "Say yes to save"}</button><button className="manual-edit" onClick={applyToManual}><PencilLine /> Continue in manual form</button><button className="save-reviewed" onClick={() => void saveReviewedLog()} disabled={saving}>{saving ? <Loader2 className="spin" /> : <CheckCircle2 />} Save reviewed log</button></div>
        </div> : <div className="question-stage">
          <div className="prompt-bubble"><Sparkles /><div><span>{"subject" in step ? step.subject.name : "Daily review"}</span><h2>{contextLoading && step.kind === "studySummary" ? "Loading her exact chapter directory…" : prompt}</h2></div></div>
          <div className={`mic-zone ${listening ? "listening" : ""}`}><button onClick={() => void startListening()} disabled={contextLoading && step.kind === "studySummary"} aria-label={listening ? "Stop listening" : "Answer with voice"}>{listening ? <MicOff /> : <Mic />}</button><strong>{listening ? "Listening…" : supportsVoiceRecognition() ? "Speak naturally — no need to rush" : "Voice unavailable—type below"}</strong><small>{interim || heard || "I wait for your natural pause. Every required value is checked before moving on."}</small></div>
          <div className="typed-answer"><input value={typedAnswer} onChange={(event) => setTypedAnswer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") acceptAnswer(typedAnswer); }} placeholder="Or type your answer here…" /><button onClick={() => acceptAnswer(typedAnswer)}><ArrowRight /></button></div>
          {error && <p className="voice-error" role="alert">{error}</p>}
          <button className="repeat-prompt" onClick={() => speakPrompt(prompt, { ...preference, enabled: preference.speechEnabled, clipId: followUpPrompt ? "assistant-clarify-warm" : clipForStep(step, preference.nickname) })}><Volume2 /> Repeat question</button>
        </div>}
      </div>
      {!saved && <footer><span>Step {stepIndex + 1} of {steps.length}</span><button onClick={resetDraft}><RotateCcw /> Start over</button></footer>}
    </section></div>, document.body)}

    <style jsx>{`
      .voice-entry-dock{display:flex;align-items:center;justify-content:space-between;gap:18px;margin:0 0 16px;padding:14px 15px;border:1px solid color-mix(in srgb,#cbc5ff 30%,var(--glass-border));border-radius:17px;background:linear-gradient(115deg,color-mix(in srgb,#b9ddff 9%,transparent),color-mix(in srgb,#cbc5ff 10%,var(--glass-thin)))}.voice-entry-copy>span,.voice-entry-copy>strong,.voice-entry-copy>small{display:block}.voice-entry-copy>span{display:flex;align-items:center;gap:6px;color:#cbc5ff;font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.08em}.voice-entry-copy>strong{margin-top:4px;font-size:13px}.voice-entry-copy>small{margin-top:3px;color:var(--text-muted);font-size:10px}.voice-entry-dock>button{display:flex;align-items:center;gap:7px;flex:none;padding:10px 13px;border:1px solid color-mix(in srgb,#cbc5ff 35%,var(--glass-border));border-radius:12px;background:linear-gradient(135deg,#b9ddff,#cbc5ff);color:#25213d;font:800 11px inherit;cursor:pointer;box-shadow:0 10px 26px color-mix(in srgb,#cbc5ff 16%,transparent)}
      .voice-overlay{position:fixed;inset:0;z-index:1800;display:grid;place-items:center;padding:20px;background:rgba(3,4,9,.76);backdrop-filter:blur(20px)}.onboarding-card,.wizard-card{width:min(760px,100%);max-height:min(92vh,900px);overflow:auto;border:1px solid color-mix(in srgb,#cbc5ff 30%,var(--glass-border));border-radius:27px;background:linear-gradient(155deg,var(--bg-surface),var(--bg-elevated));box-shadow:0 38px 110px rgba(0,0,0,.64),inset 0 1px rgba(255,255,255,.06)}.onboarding-card{width:min(540px,100%);padding:27px;text-align:center}.assistant-orb{position:relative;width:62px;height:62px;display:grid;place-items:center;margin:0 auto 17px;border-radius:21px;background:linear-gradient(145deg,#b9ddff,#cbc5ff);color:#30294d;box-shadow:0 0 36px color-mix(in srgb,#cbc5ff 30%,transparent)}.assistant-orb span{position:absolute;right:2px;bottom:3px;width:13px;height:13px;border:3px solid var(--bg-surface);border-radius:50%;background:var(--success)}.onboarding-kicker{color:#cbc5ff;font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.1em}.onboarding-card h2{margin:8px 0 9px;font-size:25px}.onboarding-card>p{margin:0 auto 15px;max-width:450px;color:var(--text-muted);font-size:12px;line-height:1.7}.device-note{display:grid;gap:3px;margin:0 0 15px;padding:10px 12px;border:1px solid color-mix(in srgb,#b9ddff 24%,var(--glass-border));border-radius:12px;background:color-mix(in srgb,#b9ddff 7%,transparent);text-align:left}.device-note strong{font-size:10px;color:#b9ddff}.device-note span{color:var(--text-muted);font-size:9px;line-height:1.5}.nickname-choice,.interaction-choice{text-align:left}.nickname-choice>span,.interaction-choice>span{color:var(--text-muted);font-size:10px}.nickname-choice>div,.interaction-choice>div{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:7px}.nickname-choice button,.interaction-choice button,.speech-toggle{border:1px solid var(--glass-border);border-radius:13px;background:var(--glass-thin);color:var(--text-secondary);cursor:pointer}.nickname-choice button{padding:11px;font:750 12px inherit}.interaction-choice{margin-top:12px}.interaction-choice button{display:grid;gap:3px;padding:10px;text-align:left}.interaction-choice button strong{font-size:10px}.interaction-choice button small{color:var(--text-muted);font-size:8px;line-height:1.4}.nickname-choice button.active,.interaction-choice button.active{border-color:#cbc5ff;background:color-mix(in srgb,#cbc5ff 13%,transparent);color:#dedaff}.speech-toggle{width:100%;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:11px;margin:12px 0;padding:12px;text-align:left}.speech-toggle svg{width:18px}.speech-toggle span strong,.speech-toggle span small{display:block}.speech-toggle span strong{font-size:11px}.speech-toggle span small{margin-top:3px;color:var(--text-muted);font-size:9px}.speech-toggle .checked{color:var(--success)}.permission-button{width:100%;display:grid;grid-template-columns:auto 1fr;align-items:center;gap:11px;margin:0 0 10px;padding:11px 12px;border:1px solid color-mix(in srgb,#b9ddff 34%,var(--glass-border));border-radius:13px;background:color-mix(in srgb,#b9ddff 8%,var(--glass-thin));color:var(--text-secondary);text-align:left;cursor:pointer}.permission-button:disabled{cursor:wait;opacity:.72}.permission-button>svg{width:19px;color:#b9ddff}.permission-button span strong,.permission-button span small{display:block}.permission-button span strong{font-size:11px}.permission-button span small{margin-top:3px;color:var(--text-muted);font-size:9px}.permission-button.ready{border-color:color-mix(in srgb,var(--success) 38%,var(--glass-border));background:color-mix(in srgb,var(--success) 7%,var(--glass-thin))}.permission-button.ready>svg{color:var(--success)}.permission-message,.device-permission-help{margin:-2px 0 10px;padding:9px 10px;border-radius:10px;color:var(--text-muted);font-size:9px;line-height:1.55;text-align:left}.permission-message{background:color-mix(in srgb,var(--success) 7%,transparent)}.permission-message.blocked,.device-permission-help{border:1px solid color-mix(in srgb,var(--danger) 25%,transparent);background:color-mix(in srgb,var(--danger) 7%,transparent)}.meet-button{width:100%;display:flex;align-items:center;justify-content:center;gap:7px;padding:12px;border:0;border-radius:13px;background:linear-gradient(135deg,#b9ddff,#cbc5ff);color:#28233f;font:850 12px inherit;cursor:pointer}.privacy-note{display:block;margin-top:12px;color:var(--text-muted);font-size:9px;line-height:1.5}
      .wizard-card{overflow:hidden}.wizard-card>header{display:flex;align-items:center;justify-content:space-between;padding:17px 19px}.wizard-card>header span,.wizard-card>header strong{display:flex;align-items:center;gap:6px}.wizard-card>header span{color:#cbc5ff;font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.08em}.wizard-card>header strong{margin-top:4px;font-size:15px}.wizard-card>header button{width:34px;height:34px;display:grid;place-items:center;border:1px solid var(--glass-border);border-radius:10px;background:var(--glass-thin);color:var(--text-muted);cursor:pointer}.wizard-card>header button svg{width:18px}.progress-track{height:3px;background:var(--glass-thin)}.progress-track span{display:block;height:100%;background:linear-gradient(90deg,#b9ddff,#cbc5ff);transition:width .3s ease}.wizard-body{max-height:calc(92vh - 125px);overflow:auto;padding:20px}.question-stage{display:grid;width:100%}.prompt-bubble{display:flex;gap:12px;padding:15px;border:1px solid color-mix(in srgb,#cbc5ff 25%,var(--glass-border));border-radius:17px;background:linear-gradient(120deg,color-mix(in srgb,#b9ddff 9%,transparent),color-mix(in srgb,#cbc5ff 10%,transparent))}.prompt-bubble>svg{flex:none;color:#cbc5ff}.prompt-bubble span{color:#b9ddff;font-size:9px;font-weight:850;text-transform:uppercase}.prompt-bubble h2{margin:5px 0 0;font-size:17px;line-height:1.5}.mic-zone{width:100%;display:grid;place-items:center;align-content:center;padding:28px 10px 18px;text-align:center}.mic-zone>button{position:relative;width:76px;height:76px;display:grid;place-items:center;padding:0;line-height:0;border:1px solid color-mix(in srgb,#cbc5ff 42%,transparent);border-radius:50%;background:linear-gradient(145deg,#b9ddff,#cbc5ff);color:#2a2442;cursor:pointer;box-shadow:0 0 0 9px color-mix(in srgb,#cbc5ff 7%,transparent),0 18px 40px rgba(0,0,0,.28)}.mic-zone>button svg{display:block;width:27px;height:27px;margin:auto}.mic-zone.listening>button{animation:listenPulse 1.35s ease-in-out infinite}.mic-zone>strong{margin-top:16px;font-size:12px}.mic-zone>small{min-height:16px;margin-top:5px;color:var(--text-muted);font-size:10px;text-align:center}.typed-answer{display:grid;grid-template-columns:1fr 42px;gap:8px}.typed-answer input,.review-stage input{min-width:0;border:1px solid var(--glass-border);border-radius:11px;background:color-mix(in srgb,var(--bg-base) 45%,transparent);color:var(--text-primary);outline:0}.typed-answer input{padding:11px 12px}.typed-answer button{display:grid;place-items:center;border:1px solid color-mix(in srgb,#cbc5ff 30%,var(--glass-border));border-radius:11px;background:var(--annotation-wash,#1e2030);color:#cbc5ff;cursor:pointer}.typed-answer button svg{width:17px}.voice-error{margin:10px 0 0;padding:9px 11px;border:1px solid color-mix(in srgb,var(--danger) 30%,transparent);border-radius:10px;background:color-mix(in srgb,var(--danger) 8%,transparent);color:var(--text-secondary);font-size:10px}.repeat-prompt{display:flex;align-items:center;gap:6px;margin:12px auto 0;border:0;background:transparent;color:var(--text-muted);font:700 9px inherit;cursor:pointer}.repeat-prompt svg{width:14px}
      .review-subjects{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:13px}.review-subjects>div{display:grid;grid-template-columns:minmax(150px,1fr) repeat(3,78px);align-items:end;gap:7px;padding:11px;border:1px solid color-mix(in srgb,var(--subject) 22%,var(--glass-border));border-radius:13px;background:var(--glass-thin)}.review-subjects>div.active-study{background:linear-gradient(120deg,color-mix(in srgb,var(--subject) 8%,var(--glass-thin)),var(--glass-thin))}.review-subject-head{display:flex;min-width:0;flex-direction:column;align-self:center;gap:3px}.review-subject-head strong{font-size:11px}.review-subject-head>span{overflow:hidden;color:var(--text-secondary);font-size:10px;font-weight:750;text-overflow:ellipsis;white-space:nowrap}.review-subject-head small{color:var(--text-muted);font-size:8px;line-height:1.35}.review-subject-head em{display:flex;align-items:center;gap:3px;color:var(--success);font-size:8px;font-style:normal;font-weight:750}.review-subjects label,.review-meta label{color:var(--text-muted);font-size:8px;text-transform:uppercase}.review-subjects input,.review-meta input{width:100%;display:block;margin-top:4px;padding:7px;font-size:10px}.review-meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.review-meta label{padding:10px;border:1px solid var(--glass-border);border-radius:12px;background:var(--glass-thin)}.todo-review{margin-top:12px;padding:13px;border:1px solid color-mix(in srgb,#b9ddff 24%,var(--glass-border));border-radius:15px;background:color-mix(in srgb,#b9ddff 6%,transparent)}.todo-review>div:first-child>span{display:flex;align-items:center;gap:6px;color:#b9ddff;font-size:10px;font-weight:800}.todo-review>div:first-child>small{display:block;margin-top:4px;color:var(--text-muted);font-size:9px}.todo-draft{display:grid;grid-template-columns:1fr 86px 31px;gap:7px;margin-top:8px}.todo-draft>input{padding:8px}.todo-draft label{display:flex;align-items:center;gap:4px;color:var(--text-muted);font-size:9px}.todo-draft label input{width:58px;padding:8px}.todo-draft button{display:grid;place-items:center;border:1px solid var(--glass-border);border-radius:9px;background:var(--glass-thin);color:var(--danger);cursor:pointer}.todo-draft button svg{width:14px}.todo-review>p{margin:9px 0 0;color:var(--text-muted);font-size:10px}.review-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px;margin-top:13px}.review-actions button,.save-success button,.save-success a{display:flex;align-items:center;gap:6px;padding:9px 11px;border-radius:10px;font:750 10px inherit;text-decoration:none;cursor:pointer}.review-actions svg{width:15px}.listen-mini,.manual-edit{border:1px solid var(--glass-border);background:var(--glass-thin);color:var(--text-secondary)}.save-reviewed{border:0;background:linear-gradient(135deg,#b9ddff,#cbc5ff);color:#28233f}.save-reviewed:disabled{opacity:.6}.save-success{display:grid;justify-items:center;padding:34px 15px;text-align:center}.save-success>svg{width:48px;height:48px;color:var(--success)}.save-success h2{margin:14px 0 6px}.save-success p{max-width:440px;color:var(--text-muted);font-size:11px;line-height:1.6}.post-log-suggestions{width:min(520px,100%);display:grid;gap:8px;margin:12px 0 2px;padding:13px;border:1px solid color-mix(in srgb,#b9ddff 28%,var(--glass-border));border-radius:15px;background:linear-gradient(125deg,color-mix(in srgb,#b9ddff 8%,transparent),color-mix(in srgb,#cbc5ff 7%,transparent));text-align:left}.post-log-suggestions>span{display:flex;align-items:center;gap:6px;color:#b9ddff;font-size:9px;font-weight:850;text-transform:uppercase}.post-log-suggestions h3{margin:0;font-size:12px}.post-log-suggestions article{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px;border:1px solid var(--glass-border);border-radius:11px;background:var(--glass-thin)}.post-log-suggestions article div{display:grid;gap:3px}.post-log-suggestions article strong{font-size:10px}.post-log-suggestions article small{color:var(--text-muted);font-size:8px;line-height:1.4}.post-log-suggestions article button{flex:none}.post-log-suggestions article button:disabled{opacity:.65}.save-success>div{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:12px}.save-success a{background:linear-gradient(135deg,#b9ddff,#cbc5ff);color:#28233f}.save-success button{border:1px solid var(--glass-border);background:var(--glass-thin);color:var(--text-secondary)}.wizard-card>footer{display:flex;justify-content:space-between;padding:10px 18px;border-top:1px solid var(--glass-border);color:var(--text-muted);font-size:9px}.wizard-card>footer button{display:flex;align-items:center;gap:5px;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer}.wizard-card>footer svg{width:12px}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@keyframes listenPulse{50%{box-shadow:0 0 0 18px color-mix(in srgb,#cbc5ff 11%,transparent),0 18px 44px rgba(0,0,0,.35);transform:scale(1.04)}}
      @media(max-width:720px){.voice-entry-dock{align-items:flex-start}.voice-entry-copy>small{display:none}.voice-overlay{padding:0}.onboarding-card,.wizard-card{width:100%;height:100%;max-height:none;border:0;border-radius:0}.wizard-body{max-height:calc(100vh - 120px)}.review-subjects{grid-template-columns:1fr}.review-subjects>div{grid-template-columns:1fr repeat(3,65px)}.review-actions{display:grid;grid-template-columns:1fr 1fr}.save-reviewed{grid-column:1/-1;justify-content:center}.voice-entry-dock>button{padding:10px}.voice-entry-dock>button{font-size:0}.voice-entry-dock>button svg{width:19px}}@media(max-width:430px){.review-subjects>div{grid-template-columns:repeat(3,1fr)}.review-subject-head{grid-column:1/-1;margin-bottom:5px}}
    `}</style>
  </>;
}
