// Isolated visual-QA entry. Not imported by the production app.
import React, { useRef, useState } from "react";
import { Text, View, Pressable } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { PlayfairDisplay_600SemiBold } from "@expo-google-fonts/playfair-display/600SemiBold";
import { StudyForm } from "../src/StudyForms";
import { ProgressEditor } from "../src/ProgressEditor";
import { parseProgressReceipt, type ProgressWrite } from "../src/progress-contract";
import { s } from "../src/theme";
import { type Subject } from "../src/contracts";
import { type DayRecord, type Write } from "../src/forms-contract";
const subjects: Subject[] = ["Physics", "Chemistry", "Botany", "Zoology"].map(
  (name) => ({
    id: name.toLowerCase(),
    slug: name.toLowerCase(),
    name,
    topics: [],
  }),
);
const topic = { id: "nlm", subjectId: "physics", name: "Newton’s laws", chapter: "Laws of Motion", classLevel: "11", updatedAt: "2026-01-01T12:00:00.000Z", questionsSolved: 20, isCompleted: false, _count: { revisions: 2 } };
export default function FormsPreview() {
  const [fonts] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    PlayfairDisplay_600SemiBold,
  });
  const [mode, setMode] = useState<"day" | "task" | "progress" | null>(null),
    [saved, setSaved] = useState(false);
  const attempts = useRef(new Map<string, string>());
  const saveProgress = async (write: ProgressWrite) => {
    const previous = attempts.current.get(write.operationId);
    if (!previous) { attempts.current.set(write.operationId, JSON.stringify(write)); throw new Error("Fixture connection interrupted. Retry the exact update."); }
    if (previous !== JSON.stringify(write)) throw new Error("Retry payload changed.");
    const entry = write.entries[0];
    return parseProgressReceipt({ kind: "progress", operationId: write.operationId, result: { topics: [{ ...topic, isCompleted: entry.completed ?? entry.expectedCompleted, questionsSolved: entry.expectedQuestions + entry.questionsDelta, _count: { revisions: entry.expectedRevisions + Number(entry.fullRevision) } }] } }, write);
  };
  const services = {
    loadDay: async (date: string): Promise<DayRecord> => ({
      date,
      entries: [],
      screen: null,
    }),
    loadWorkspace: async () => {
      throw new Error("Preview does not access private data.");
    },
    saveForm: async (write: Write) => {
      if (write.kind === "day")
        return { date: write.date, entries: [], screen: null };
      return {
        id: "fixture",
        title: write.task.title,
        priority: "MEDIUM",
        status: "TODO" as const,
        dueDate: null,
        plannedMinutes: null,
      };
    },
  };
  return (
    <SafeAreaProvider>
      <View style={[s.root, { padding: 30, gap: 20 }]}>
        <Text style={s.title}>Form preview · fixture data</Text>
        {saved && <Text style={s.label}>Fixture save confirmed</Text>}
        {fonts &&
          (["day", "task", "progress"] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              onPress={() => {
                setSaved(false);
                setMode(value);
              }}
              style={s.button}
            >
              <Text style={s.label}>Open {value} editor</Text>
            </Pressable>
          ))}
        {mode === "progress" && <ProgressEditor subject={subjects[0]} topics={[topic]} onClose={() => setMode(null)} onSaved={() => setSaved(true)} onReload={() => {}} save={saveProgress} />}
        {mode && mode !== "progress" && (
          <StudyForm
            mode={mode}
            subjects={subjects}
            onClose={() => setMode(null)}
            onSaved={() => setSaved(true)}
            services={services}
          />
        )}
      </View>
    </SafeAreaProvider>
  );
}
