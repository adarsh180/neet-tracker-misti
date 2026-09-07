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
import { Check, X } from "lucide-react-native";
import { randomUUID } from "expo-crypto";
import { colors, s, subjectColor } from "./theme";
import { type Subject, type Topic } from "./contracts";
import { todayKey } from "./forms-contract";
import {
  prepareProgress,
  type ProgressSelection,
  type ProgressWrite,
} from "./progress-contract";
import { saveProgress } from "./api";

function Action({
  title,
  onPress,
  selected = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        selected && s.primary,
        disabled && s.disabled,
        pressed && s.pressed,
      ]}
    >
      <Text style={selected ? s.primaryText : s.label}>{title}</Text>
    </Pressable>
  );
}
export function ProgressEditor({
  subject,
  topics,
  onClose,
  onSaved,
  onReload,
  save = saveProgress,
}: {
  subject: Pick<Subject, "id" | "name" | "slug">;
  topics: Topic[];
  onClose: () => void;
  onSaved: () => void;
  onReload: () => void;
  save?: typeof saveProgress;
}) {
  // Freeze the inspected chapter until it is closed/reloaded. Background sync
  // must not quietly rebase the student's selected question increments.
  const [original] = useState(topics);
  const [date] = useState(todayKey);
  const [selection, setSelection] = useState<ProgressSelection>({}),
    [completion, setCompletion] = useState<boolean | null>(null),
    [revision, setRevision] = useState(false),
    [note, setNote] = useState("");
  const [review, setReview] = useState<ProgressWrite | null>(null),
    [busy, setBusy] = useState(false),
    [attempted, setAttempted] = useState(false),
    [error, setError] = useState(""),
    [reduced, setReduced] = useState(true);
  const scroll = useRef<ScrollView>(null),
    alive = useRef(true),
    lock = useRef(false);
  const selected = original.filter((t) => selection[t.id]?.selected),
    color = subjectColor(subject.slug);
  useEffect(() => {
    alive.current = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (alive.current) setReduced(value);
    });
    const listener = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => {
      alive.current = false;
      listener.remove();
    };
  }, []);
  useEffect(() => {
    if (review || error) scroll.current?.scrollTo({ y: 0, animated: false });
  }, [review, error]);
  const close = () => {
    if (busy) return;
    if (!selected.length && !attempted && !note) {
      onClose();
      return;
    }
    Alert.alert(
      attempted ? "Leave this save?" : "Discard these edits?",
      attempted
        ? "This update may already be saved. Reload the chapter before starting another update."
        : "Your unsaved topic updates will be lost.",
      [
        { text: "Keep editing", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: () => {
            if (attempted) onReload();
            onClose();
          },
        },
      ],
    );
  };
  const prepare = () => {
    try {
      setError("");
      setReview(
        prepareProgress(
          subject.id,
          original,
          selection,
          completion,
          revision,
          note,
          date,
          randomUUID(),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check your changes.");
    }
  };
  const submit = async () => {
    if (!review || lock.current) return;
    lock.current = true;
    setBusy(true);
    setAttempted(true);
    setError("");
    try {
      await save(review);
      if (alive.current) {
        onSaved();
        onClose();
      }
    } catch (err) {
      if (alive.current)
        setError(
          err instanceof Error ? err.message : "Could not confirm this update.",
        );
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <Modal
      visible
      animationType={reduced ? "none" : "slide"}
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <SafeAreaView style={s.root} edges={["top", "bottom", "left", "right"]}>
        <View style={s.header}>
          <View style={s.grow}>
            <Text style={[s.eyebrow, { color }]}>
              {subject.name} · CLASS {original[0]?.classLevel ?? "—"}
            </Text>
            <Text style={s.brand}>
              {review ? "A quick check." : "Make your progress count."}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close progress editor"
            disabled={busy}
            onPress={close}
            style={s.iconButton}
          >
            <X size={21} color={colors.cream} />
          </Pressable>
        </View>
        <KeyboardAvoidingView
          style={s.grow}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            ref={scroll}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[s.scroll, { maxWidth: 820 }]}
          >
            {!!error && (
              <View style={s.error} accessibilityLiveRegion="polite">
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}
            {busy && (
              <ActivityIndicator
                color={color}
                accessibilityLabel="Saving topic progress"
              />
            )}
            <Text style={s.sectionTitle}>
              {original[0]?.chapter ?? "General topics"}
            </Text>
            <Text style={s.muted}>
              {date} · Topic totals only. Daily Goals hours and questions stay
              unchanged.
            </Text>
            {review ? (
              <>
                {review.entries.map((entry) => (
                  <View key={entry.topicId} style={s.card}>
                    <Text style={s.label}>
                      {original.find((t) => t.id === entry.topicId)?.name}
                    </Text>
                    <Text style={s.text}>
                      Questions: {entry.expectedQuestions} →{" "}
                      {entry.expectedQuestions + entry.questionsDelta} (+
                      {entry.questionsDelta})
                    </Text>
                    <Text style={s.text}>
                      Status:{" "}
                      {(entry.completed ?? entry.expectedCompleted)
                        ? "Completed"
                        : "Not completed"}
                    </Text>
                    {entry.fullRevision && (
                      <Text style={s.text}>
                        Full topic revisions: {entry.expectedRevisions} →{" "}
                        {entry.expectedRevisions + 1}
                      </Text>
                    )}
                  </View>
                ))}
                {!!note.trim() && <Text style={s.text}>{note.trim()}</Text>}
                <Action
                  title={
                    busy
                      ? "Saving…"
                      : attempted
                        ? "Retry this exact update"
                        : "Confirm progress update"
                  }
                  selected
                  disabled={busy}
                  onPress={() => void submit()}
                />
                {!attempted && (
                  <Action
                    title="Back to editing"
                    onPress={() => setReview(null)}
                  />
                )}
                {attempted && (
                  <Action
                    title="Reload chapter"
                    disabled={busy}
                    onPress={() =>
                      Alert.alert(
                        "Reload saved progress?",
                        "This draft will close. Check the latest totals before creating another update.",
                        [
                          { text: "Keep review", style: "cancel" },
                          {
                            text: "Reload",
                            onPress: () => {
                              onClose();
                              onReload();
                            },
                          },
                        ],
                      )
                    }
                  />
                )}
              </>
            ) : (
              <>
                <View style={s.row}>
                  <Text style={[s.label, s.grow]}>
                    {selected.length} topics selected
                  </Text>
                  <Action
                    title={
                      selected.length === original.length
                        ? "Clear selection"
                        : "Select all"
                    }
                    onPress={() =>
                      setSelection(
                        Object.fromEntries(
                          original.map((t) => [
                            t.id,
                            {
                              selected: selected.length !== original.length,
                              questions: selection[t.id]?.questions ?? "",
                            },
                          ]),
                        ),
                      )
                    }
                  />
                </View>
                {original.map((topic) => (
                  <View
                    key={topic.id}
                    style={[
                      s.card,
                      selection[topic.id]?.selected && { borderColor: color },
                    ]}
                  >
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityLabel={`Select ${topic.name}`}
                      accessibilityState={{
                        checked: !!selection[topic.id]?.selected,
                      }}
                      onPress={() =>
                        setSelection({
                          ...selection,
                          [topic.id]: {
                            selected: !selection[topic.id]?.selected,
                            questions: selection[topic.id]?.questions ?? "",
                          },
                        })
                      }
                      style={s.row}
                    >
                      <View style={s.grow}>
                        <Text style={s.label}>{topic.name}</Text>
                        <Text style={s.muted}>
                          {topic.questionsSolved} questions ·{" "}
                          {topic._count?.revisions ?? 0} revisions ·{" "}
                          {topic.isCompleted ? "Completed" : "Not completed"}
                        </Text>
                      </View>
                      <View style={s.taskCheck}>
                        {selection[topic.id]?.selected && (
                          <Check size={20} color={color} />
                        )}
                      </View>
                    </Pressable>
                    {selection[topic.id]?.selected && (
                      <View style={{ gap: 8 }}>
                        <Text style={s.muted}>New questions solved</Text>
                        <TextInput
                          accessibilityLabel={`New questions for ${topic.name}`}
                          style={s.input}
                          keyboardType="number-pad"
                          maxLength={6}
                          placeholder="0"
                          placeholderTextColor={colors.muted}
                          value={selection[topic.id].questions}
                          onChangeText={(questions) =>
                            setSelection({
                              ...selection,
                              [topic.id]: { selected: true, questions },
                            })
                          }
                        />
                      </View>
                    )}
                  </View>
                ))}
                <View style={s.card}>
                  <Text style={s.label}>Selected topics</Text>
                  <View style={s.wrap}>
                    {(
                      [
                        [null, "Keep status"],
                        [true, "Completed"],
                        [false, "Not completed"],
                      ] as const
                    ).map(([value, label]) => (
                      <Action
                        key={label}
                        title={label}
                        selected={completion === value}
                        onPress={() => setCompletion(value)}
                      />
                    ))}
                  </View>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel="Confirm full topic revision"
                    accessibilityState={{ checked: revision }}
                    onPress={() => setRevision(!revision)}
                    style={s.row}
                  >
                    <View style={s.taskCheck}>
                      {revision && <Check size={20} color={color} />}
                    </View>
                    <Text style={[s.text, s.grow]}>
                      I revised every selected topic end to end. Add one full
                      revision to each.
                    </Text>
                  </Pressable>
                  <Text style={s.muted}>
                    For a partial revision, leave this off and describe it in
                    your note alongside a question or status update.
                  </Text>
                  <TextInput
                    accessibilityLabel="Progress note"
                    placeholder="A short study note (optional)"
                    placeholderTextColor={colors.muted}
                    style={[
                      s.input,
                      { minHeight: 90, textAlignVertical: "top" },
                    ]}
                    multiline
                    maxLength={6000}
                    value={note}
                    onChangeText={setNote}
                  />
                </View>
                <Action
                  title="Review topic updates"
                  selected
                  onPress={prepare}
                />
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
