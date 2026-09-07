import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Check, ChevronDown, X } from "lucide-react-native";
import { randomUUID } from "expo-crypto";
import * as api from "./api";
import { colors, s, subjectColor } from "./theme";
import { type Subject, type Task } from "./contracts";
import {
  dateKey,
  editableTask,
  numeric,
  screenFields,
  todayKey,
  type DayRecord,
  type ScreenKey,
  type TaskFields,
  type Write,
} from "./forms-contract";

type DraftEntry = {
  active: boolean;
  hours: string;
  questions: string;
  intensity: string;
  notes: string;
};
type Draft = {
  date: string;
  entries: Record<string, DraftEntry>;
  discipline: string;
  completion: string;
  screenEnabled: boolean;
  screen: Record<ScreenKey, string>;
  screenNote: string;
};
type Services = Pick<typeof api, "loadDay" | "saveForm" | "loadWorkspace">;
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Please retry.";
function Action({
  title,
  onPress,
  disabled = false,
  primary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        primary && s.primary,
        disabled && s.disabled,
        pressed && s.pressed,
      ]}
    >
      <Text style={primary ? s.primaryText : s.label}>{title}</Text>
    </Pressable>
  );
}
function Field({
  label,
  value,
  onChange,
  numeric: isNumeric = false,
  multiline = false,
  disabled = false,
  maxLength = 6000,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  numeric?: boolean;
  multiline?: boolean;
  disabled?: boolean;
  maxLength?: number;
}) {
  return (
    <View
      style={{ gap: 8, flexGrow: 1, minWidth: isNumeric ? 100 : undefined }}
    >
      <Text style={s.muted}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        editable={!disabled}
        onChangeText={onChange}
        keyboardType={isNumeric ? "decimal-pad" : "default"}
        multiline={multiline}
        maxLength={maxLength}
        selectionColor={colors.gold}
        style={[
          s.input,
          multiline && { minHeight: 90, textAlignVertical: "top" },
          disabled && s.disabled,
        ]}
      />
    </View>
  );
}
function makeDraft(day: DayRecord, subjects: Subject[]): Draft {
  return {
    date: day.date,
    discipline: String(day.entries[0]?.disciplineScore ?? ""),
    completion: String(day.entries[0]?.completionPercent ?? ""),
    entries: Object.fromEntries(
      subjects.map((subject) => {
        const entry = day.entries.find((e) => e.subjectId === subject.id);
        return [
          subject.id,
          {
            active: !!entry,
            hours: entry ? String(entry.hoursStudied) : "",
            questions: entry ? String(entry.questionsSolved) : "",
            intensity: entry ? String(entry.intensityLevel) : "",
            notes: entry?.notes ?? "",
          },
        ];
      }),
    ),
    screenEnabled: !!day.screen,
    screen: Object.fromEntries(
      screenFields.map(([key]) => [
        key,
        day.screen ? String(day.screen[key]) : "",
      ]),
    ) as Record<ScreenKey, string>,
    screenNote: day.screen?.note ?? "",
  };
}
export function StudyForm({
  mode,
  subjects,
  task,
  onClose,
  onSaved,
  onReload = onSaved,
  services = api,
}: {
  mode: "day" | "task";
  subjects: Subject[];
  task?: Task;
  onClose: () => void;
  onSaved: () => void;
  onReload?: () => void;
  services?: Services;
}) {
  const [loaded, setLoaded] = useState<DayRecord | null>(null),
    [draft, setDraft] = useState<Draft | null>(null);
  const [dateInput, setDateInput] = useState(todayKey);
  const [taskFields, setTaskFields] = useState<TaskFields | null>(null),
    [minutes, setMinutes] = useState("");
  const [busy, setBusy] = useState(mode === "day"),
    [error, setError] = useState(""),
    [review, setReview] = useState<Write | null>(null),
    [attempted, setAttempted] = useState(false);
  const [screenOpen, setScreenOpen] = useState(false),
    [dirty, setDirty] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReducedMotion(value);
    });
    const listener = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReducedMotion,
    );
    return () => {
      mounted = false;
      listener.remove();
    };
  }, []);
  useEffect(() => {
    if (error || review) scroll.current?.scrollTo({ y: 0, animated: false });
  }, [error, review]);
  const lock = useRef(false),
    epoch = useRef(0),
    alive = useRef(true);
  const frozen = busy || attempted || !!review;
  const load = async (date: string) => {
    const version = ++epoch.current;
    setBusy(true);
    setError("");
    setLoaded(null);
    setDraft(null);
    try {
      const day = await services.loadDay(date);
      if (!alive.current || version !== epoch.current) return;
      setLoaded(day);
      setDraft(makeDraft(day, subjects));
      setDirty(false);
      setReview(null);
      setAttempted(false);
    } catch (err) {
      if (alive.current && version === epoch.current) setError(message(err));
    } finally {
      if (alive.current && version === epoch.current) setBusy(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    if (mode === "day") void load(todayKey());
    else {
      try {
        if (task) editableTask(task);
        setTaskFields({
          id: task?.id ?? null,
          expectedUpdatedAt: task?.updatedAt ?? null,
          title: task?.title ?? "",
          description: task?.description ?? null,
          priority: task?.priority ?? "MEDIUM",
          subjectId: task?.subjectId ?? null,
          dueDate: task?.dueDate?.slice(0, 10) ?? null,
          plannedMinutes: task?.plannedMinutes ?? null,
        });
        setMinutes(
          task?.plannedMinutes === null || task?.plannedMinutes === undefined
            ? ""
            : String(task.plannedMinutes),
        );
      } catch (err) {
        setError(message(err));
      }
    }
    return () => {
      alive.current = false;
    };
    // Each modal owns one fixed record. A background refresh cannot replace its draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const close = () => {
    if (busy) return;
    if (!dirty && !attempted) {
      onClose();
      return;
    }
    Alert.alert(
      attempted ? "Leave this save?" : "Discard these edits?",
      attempted
        ? "The request may already be saved. Reload the board or day before starting another edit."
        : "These unsaved edits will be lost.",
      [
        { text: "Keep editing", style: "cancel" },
        { text: "Leave", style: "destructive", onPress: onClose },
      ],
    );
  };
  const change = (patch: Partial<Draft>) => {
    setDraft((previous) => (previous ? { ...previous, ...patch } : null));
    setDirty(true);
  };
  const changeTask = (patch: Partial<TaskFields>) => {
    setTaskFields((previous) => (previous ? { ...previous, ...patch } : null));
    setDirty(true);
  };
  const reload = () =>
    Alert.alert(
      "Load the saved version?",
      "Your unsaved draft will be replaced. An earlier save may already have succeeded.",
      [
        { text: "Keep draft", style: "cancel" },
        {
          text: "Reload",
          onPress: () => {
            if (mode === "day") void load(dateInput);
            else {
              onClose();
              onReload();
            }
          },
        },
      ],
    );
  const prepare = () => {
    try {
      setError("");
      if (mode === "task" && taskFields) {
        const title = taskFields.title.trim();
        if (!title) throw new Error("Give your task a title.");
        setReview({
          kind: "task",
          operationId: randomUUID(),
          task: {
            ...taskFields,
            title,
            description: taskFields.description?.trim() || null,
            dueDate: taskFields.dueDate ? dateKey(taskFields.dueDate) : null,
            plannedMinutes: minutes.trim()
              ? numeric(minutes, 1440, true)
              : null,
          },
        });
      } else if (draft && loaded) {
        if (dateInput !== loaded.date)
          throw new Error("Load the selected date before editing.");
        const entries = subjects
          .filter((subject) => draft.entries[subject.id]?.active)
          .map((subject) => {
            const value = draft.entries[subject.id];
            return {
              subjectId: subject.id,
              expectedUpdatedAt:
                loaded.entries.find((e) => e.subjectId === subject.id)
                  ?.updatedAt ?? null,
              hoursStudied: numeric(value.hours, 24),
              questionsSolved: numeric(value.questions, 2147483647, true),
              intensityLevel: numeric(value.intensity, 5, true),
              disciplineScore: numeric(draft.discipline, 100, true),
              completionPercent: numeric(draft.completion, 100, true),
              notes: value.notes.trim() || null,
            };
          });
        if (entries.reduce((sum, e) => sum + e.hoursStudied, 0) > 24)
          throw new Error("Total study time cannot exceed 24 hours.");
        const screen = draft.screenEnabled
          ? {
              expectedUpdatedAt: loaded.screen?.updatedAt ?? null,
              note: draft.screenNote.trim() || null,
              ...(Object.fromEntries(
                screenFields.map(([key]) => [
                  key,
                  numeric(draft.screen[key], 24),
                ]),
              ) as Record<ScreenKey, number>),
            }
          : null;
        if (!entries.length && !screen)
          throw new Error("Choose a subject or add screen time first.");
        setReview({
          kind: "day",
          operationId: randomUUID(),
          date: loaded.date,
          entries,
          screen,
        });
      }
    } catch (err) {
      setError(message(err));
    }
  };
  const save = async () => {
    if (!review || lock.current) return;
    lock.current = true;
    setBusy(true);
    setAttempted(true);
    setError("");
    try {
      await services.saveForm(review);
      if (alive.current) {
        onSaved();
        onClose();
      }
    } catch (err) {
      if (alive.current) setError(message(err));
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <Modal
      visible
      animationType={reducedMotion ? "none" : "slide"}
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <SafeAreaView style={s.root} edges={["top", "bottom", "left", "right"]}>
        <View style={s.header}>
          <View style={s.grow}>
            <Text style={s.eyebrow}>
              {review ? "CHECK BEFORE SAVING" : "YOUR STUDY STUDIO"}
            </Text>
            <Text style={s.brand}>
              {mode === "day"
                ? "Your day, recorded."
                : task
                  ? "A little refinement."
                  : "Your next small step."}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close editor"
            disabled={busy}
            onPress={close}
            style={[s.iconButton, busy && s.disabled]}
          >
            <X color={colors.cream} size={21} />
          </Pressable>
        </View>
        <KeyboardAvoidingView
          style={s.grow}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            ref={scroll}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[s.scroll, { maxWidth: 800 }]}
          >
            {busy && (
              <ActivityIndicator
                accessibilityLabel="Loading or saving your record"
                color={colors.gold}
              />
            )}
            {!!error && (
              <View accessibilityLiveRegion="polite" style={s.error}>
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}
            {review ? (
              <>
                <View style={s.card}>
                  <Text style={s.sectionTitle}>
                    {review.kind === "day" ? review.date : review.task.title}
                  </Text>
                  {review.kind === "task" ? (
                    <>
                      <Text style={s.text}>
                        {subjects.find((s) => s.id === review.task.subjectId)
                          ?.name ?? "Personal study"}{" "}
                        · {review.task.priority.toLowerCase()}
                      </Text>
                      <Text style={s.muted}>
                        {review.task.dueDate ?? "No due date"} ·{" "}
                        {review.task.plannedMinutes === null
                          ? "No time estimate"
                          : `${review.task.plannedMinutes} minutes`}
                      </Text>
                      {!!review.task.description && (
                        <Text style={s.text}>{review.task.description}</Text>
                      )}
                    </>
                  ) : (
                    <>
                      {review.entries.map((entry) => (
                        <View key={entry.subjectId} style={{ gap: 6 }}>
                          <Text style={s.label}>
                            {
                              subjects.find((s) => s.id === entry.subjectId)
                                ?.name
                            }
                          </Text>
                          <Text style={s.text}>
                            {entry.hoursStudied} hours · {entry.questionsSolved}{" "}
                            questions · intensity {entry.intensityLevel}/5
                          </Text>
                          {entry.notes && (
                            <Text style={s.muted}>{entry.notes}</Text>
                          )}
                        </View>
                      ))}
                      {review.entries.length > 0 && (
                        <Text style={s.text}>
                          Discipline {review.entries[0].disciplineScore}/100 ·
                          Plan completion {review.entries[0].completionPercent}%
                        </Text>
                      )}
                      {review.screen && (
                        <View style={{ gap: 8 }}>
                          <Text style={s.label}>Screen time</Text>
                          {screenFields.map(([key, label]) => (
                            <Text style={s.muted} key={key}>
                              {label}: {review.screen![key]} h
                            </Text>
                          ))}
                          {review.screen.note && (
                            <Text style={s.text}>{review.screen.note}</Text>
                          )}
                        </View>
                      )}
                      <Text style={s.muted}>
                        Unselected subjects stay unchanged. These are daily
                        totals; chapter progress is not changed by this form.
                      </Text>
                    </>
                  )}
                </View>
                <Action
                  primary
                  title={
                    busy
                      ? "Saving…"
                      : attempted
                        ? "Retry this exact save"
                        : "Confirm & save"
                  }
                  disabled={busy}
                  onPress={() => void save()}
                />
                {!attempted && (
                  <Action
                    title="Back to editing"
                    disabled={busy}
                    onPress={() => setReview(null)}
                  />
                )}
                {attempted && (
                  <Action
                    title="Reload saved version"
                    disabled={busy}
                    onPress={reload}
                  />
                )}
              </>
            ) : (
              <>
                {mode === "day" && (
                  <View style={s.card}>
                    <Field
                      label="Study date · YYYY-MM-DD"
                      value={dateInput}
                      maxLength={10}
                      disabled={busy}
                      onChange={(value) => setDateInput(value)}
                    />
                    <Action
                      title={
                        loaded?.date === dateInput
                          ? "Reload this day"
                          : "Load this day"
                      }
                      disabled={busy}
                      onPress={() => {
                        try {
                          dateKey(dateInput);
                          if (dateInput > todayKey())
                            throw new Error("Choose today or an earlier day.");
                          if (dirty) {
                            Alert.alert(
                              "Change the day?",
                              "Unsaved edits will be discarded.",
                              [
                                { text: "Keep editing", style: "cancel" },
                                {
                                  text: "Load day",
                                  onPress: () => void load(dateInput),
                                },
                              ],
                            );
                          } else void load(dateInput);
                        } catch (err) {
                          setError(message(err));
                        }
                      }}
                    />
                  </View>
                )}
                {mode === "day" && draft && loaded?.date === dateInput && (
                  <>
                    <View style={s.card}>
                      <Text style={s.sectionTitle}>How did today feel?</Text>
                      <View style={[s.wrap, { gap: 16 }]}>
                        <Field
                          label="Discipline · 0–100"
                          numeric
                          value={draft.discipline}
                          disabled={frozen}
                          onChange={(discipline) => change({ discipline })}
                        />
                        <Field
                          label="Plan completed · %"
                          numeric
                          value={draft.completion}
                          disabled={frozen}
                          onChange={(completion) => change({ completion })}
                        />
                      </View>
                    </View>
                    {subjects.map((subject) => {
                      const entry = draft.entries[subject.id];
                      if (!entry) return null;
                      return (
                        <View
                          key={subject.id}
                          style={[
                            s.card,
                            entry.active && {
                              borderColor: subjectColor(subject.slug),
                            },
                          ]}
                        >
                          <Pressable
                            accessibilityRole="checkbox"
                            accessibilityState={{
                              checked: entry.active,
                              disabled: frozen,
                            }}
                            disabled={frozen}
                            accessibilityLabel={`Log ${subject.name}`}
                            onPress={() =>
                              change({
                                entries: {
                                  ...draft.entries,
                                  [subject.id]: {
                                    ...entry,
                                    active: !entry.active,
                                  },
                                },
                              })
                            }
                            style={s.row}
                          >
                            <View style={s.grow}>
                              <Text style={s.sectionTitle}>{subject.name}</Text>
                              <Text style={s.muted}>
                                {entry.active
                                  ? "Included in this save"
                                  : loaded.entries.some(
                                        (e) => e.subjectId === subject.id,
                                      )
                                    ? "Skip · keep saved values"
                                    : "Not studied · skip"}
                              </Text>
                            </View>
                            <View
                              style={[
                                s.taskCheck,
                                entry.active && {
                                  borderColor: subjectColor(subject.slug),
                                },
                              ]}
                            >
                              {entry.active && (
                                <Check
                                  color={subjectColor(subject.slug)}
                                  size={20}
                                />
                              )}
                            </View>
                          </Pressable>
                          {entry.active && (
                            <>
                              <View style={[s.wrap, { gap: 16 }]}>
                                {(
                                  [
                                    ["hours", "Study hours"],
                                    ["questions", "Questions solved"],
                                    ["intensity", "Intensity · 0–5"],
                                  ] as const
                                ).map(([key, label]) => (
                                  <Field
                                    key={key}
                                    label={`${subject.name} · ${label}`}
                                    numeric
                                    value={entry[key]}
                                    disabled={frozen}
                                    onChange={(value) =>
                                      change({
                                        entries: {
                                          ...draft.entries,
                                          [subject.id]: {
                                            ...entry,
                                            [key]: value,
                                          },
                                        },
                                      })
                                    }
                                  />
                                ))}
                              </View>
                              <Field
                                label={`${subject.name} · study notes`}
                                value={entry.notes}
                                multiline
                                disabled={frozen}
                                onChange={(notes) =>
                                  change({
                                    entries: {
                                      ...draft.entries,
                                      [subject.id]: { ...entry, notes },
                                    },
                                  })
                                }
                              />
                            </>
                          )}
                        </View>
                      );
                    })}
                    <View style={s.card}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ expanded: screenOpen }}
                        onPress={() => setScreenOpen(!screenOpen)}
                        style={s.row}
                      >
                        <Text style={[s.sectionTitle, s.grow]}>
                          Screen time
                        </Text>
                        <ChevronDown size={20} color={colors.gold} />
                      </Pressable>
                      <Text style={s.muted}>
                        {draft.screenEnabled
                          ? "Included in this save"
                          : "Optional · existing records stay unchanged"}
                      </Text>
                      {screenOpen && (
                        <>
                          <Action
                            title={
                              draft.screenEnabled
                                ? "Skip screen-time update"
                                : "Include screen time"
                            }
                            disabled={frozen}
                            onPress={() =>
                              change({ screenEnabled: !draft.screenEnabled })
                            }
                          />
                          {draft.screenEnabled && (
                            <>
                              <View style={[s.wrap, { gap: 16 }]}>
                                {screenFields.map(([key, label]) => (
                                  <View
                                    key={key}
                                    style={{ flexGrow: 1, flexBasis: 240 }}
                                  >
                                    <Field
                                      label={`${label} · hours`}
                                      numeric
                                      value={draft.screen[key]}
                                      disabled={frozen}
                                      onChange={(value) =>
                                        change({
                                          screen: {
                                            ...draft.screen,
                                            [key]: value,
                                          },
                                        })
                                      }
                                    />
                                  </View>
                                ))}
                              </View>
                              <Field
                                label="Screen-time note"
                                multiline
                                value={draft.screenNote}
                                disabled={frozen}
                                onChange={(screenNote) =>
                                  change({ screenNote })
                                }
                              />
                            </>
                          )}
                        </>
                      )}
                    </View>
                  </>
                )}
                {mode === "task" && taskFields && (
                  <View style={s.card}>
                    <Field
                      label="Task title"
                      maxLength={240}
                      value={taskFields.title}
                      disabled={frozen}
                      onChange={(title) => changeTask({ title })}
                    />
                    <Field
                      label="Notes · optional"
                      value={taskFields.description ?? ""}
                      multiline
                      disabled={frozen}
                      onChange={(description) => changeTask({ description })}
                    />
                    <Text style={s.label}>Subject</Text>
                    <View style={s.wrap}>
                      {[{ id: "", name: "Personal study" }, ...subjects].map(
                        (subject) => (
                          <Action
                            key={subject.id}
                            title={subject.name}
                            primary={
                              (taskFields.subjectId ?? "") === subject.id
                            }
                            disabled={frozen}
                            onPress={() =>
                              changeTask({ subjectId: subject.id || null })
                            }
                          />
                        ),
                      )}
                    </View>
                    <Text style={s.label}>Priority</Text>
                    <View style={s.wrap}>
                      {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((priority) => (
                        <Action
                          key={priority}
                          title={priority[0] + priority.slice(1).toLowerCase()}
                          primary={taskFields.priority === priority}
                          disabled={frozen}
                          onPress={() => changeTask({ priority })}
                        />
                      ))}
                    </View>
                    <Field
                      label="Due date · YYYY-MM-DD · optional"
                      value={taskFields.dueDate ?? ""}
                      maxLength={10}
                      disabled={frozen}
                      onChange={(dueDate) =>
                        changeTask({ dueDate: dueDate || null })
                      }
                    />
                    <Field
                      label="Planned minutes · optional"
                      numeric
                      value={minutes}
                      disabled={frozen}
                      onChange={(value) => {
                        setMinutes(value);
                        setDirty(true);
                      }}
                    />
                  </View>
                )}
                <Action
                  title="Review your changes"
                  primary
                  disabled={
                    busy ||
                    (mode === "day"
                      ? !draft || loaded?.date !== dateInput
                      : !taskFields)
                  }
                  onPress={prepare}
                />
              </>
            )}
            <View style={s.row}>
              <ArrowLeft size={16} color={colors.muted} />
              <Text style={[s.muted, s.grow]}>
                Tomorrow’s plans belong in Todo. Daily logs record what you
                actually studied.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
