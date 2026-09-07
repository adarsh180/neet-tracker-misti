// Isolated visual-QA entry. Not imported by the production app.
import React, { useState } from "react";
import { Text, View, Pressable } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { PlayfairDisplay_600SemiBold } from "@expo-google-fonts/playfair-display/600SemiBold";
import { StudyForm } from "../src/StudyForms";
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
export default function FormsPreview() {
  const [fonts] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    PlayfairDisplay_600SemiBold,
  });
  const [mode, setMode] = useState<"day" | "task" | null>(null),
    [saved, setSaved] = useState(false);
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
          (["day", "task"] as const).map((value) => (
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
        {mode && (
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
