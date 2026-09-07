import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  BackHandler,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { useFonts } from "expo-font";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { PlayfairDisplay_600SemiBold } from "@expo-google-fonts/playfair-display/600SemiBold";
import Svg, { Circle } from "react-native-svg";
import {
  ArrowLeft,
  ArrowUpRight,
  Atom,
  Bell,
  BookOpen,
  Check,
  ChevronRight,
  Clock,
  House,
  LayoutGrid,
  ListTodo,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
} from "lucide-react-native";
import * as api from "./api";
import {
  groupChapters,
  SITE_URL,
  type Metrics,
  type Subject,
  type Task,
} from "./contracts";
import {
  disableReminder,
  enableReminder,
  reminderState,
} from "./notifications";
import { colors, s, subjectColor } from "./theme";

type Tab = "today" | "subjects" | "todo" | "more";
type Workspace = Awaited<ReturnType<typeof api.loadWorkspace>>;
const tabs = [
  { id: "today", name: "Today", Icon: House },
  { id: "subjects", name: "Subjects", Icon: BookOpen },
  { id: "todo", name: "Todo", Icon: ListTodo },
  { id: "more", name: "Explore", Icon: LayoutGrid },
] as const;
const readable = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please retry.";

function Button({
  title,
  onPress,
  disabled = false,
  primary = false,
  Icon,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  Icon?: typeof House;
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
      {Icon && <Icon size={18} color={primary ? colors.ink : colors.gold} />}
      <Text style={primary ? s.primaryText : s.label}>{title}</Text>
    </Pressable>
  );
}
function ErrorNotice({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={s.error} accessibilityLiveRegion="polite">
      <Text style={s.errorText}>{message}</Text>
      {onRetry && <Button title="Try again" onPress={onRetry} />}
    </View>
  );
}
function Ring({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.max(0, Math.min(1, completed / total)) : 0,
    circumference = 2 * Math.PI * 52;
  return (
    <View
      accessible
      accessibilityLabel={`${completed} of ${total} topics completed`}
      style={{
        alignItems: "center",
        justifyContent: "center",
        width: 128,
        height: 128,
      }}
    >
      <Svg width={128} height={128} style={{ position: "absolute" }}>
        <Circle
          cx={64}
          cy={64}
          r={52}
          stroke={colors.line}
          strokeWidth={7}
          fill="none"
        />
        <Circle
          cx={64}
          cy={64}
          r={52}
          stroke={colors.gold}
          strokeWidth={7}
          fill="none"
          strokeDasharray={`${circumference * pct} ${circumference}`}
          strokeLinecap="round"
          rotation={-90}
          origin="64,64"
        />
      </Svg>
      <Text style={s.number}>{Math.round(pct * 100)}%</Text>
      <Text style={s.small}>topics complete</Text>
    </View>
  );
}
function Rhythm({ days }: { days: Metrics["pulseDays"] }) {
  const max = Math.max(1, ...days.map((day) => day.hours ?? 0));
  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>Your study rhythm.</Text>
      <Text style={s.muted}>Hours recorded each day · last 14 days</Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          height: 92,
          gap: 5,
        }}
      >
        {days.map((day) => (
          <View
            key={day.date}
            accessible
            accessibilityLabel={`${day.date}: ${day.hours === null ? "no study log" : `${day.hours} hours logged`}`}
            style={{ flex: 1, height: "100%", justifyContent: "flex-end" }}
          >
            <View
              style={{
                height:
                  day.hours === null ? 3 : Math.max(3, (day.hours / max) * 85),
                borderRadius: 5,
                backgroundColor: day.hours === null ? colors.line : colors.blue,
              }}
            />
          </View>
        ))}
      </View>
      <View style={[s.row, { justifyContent: "space-between" }]}>
        <Text style={s.small}>{days[0]?.date.slice(5)}</Text>
        <Text style={s.small}>Short grey mark = no log</Text>
        <Text style={s.small}>{days.at(-1)?.date.slice(5)}</Text>
      </View>
    </View>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    PlayfairDisplay_600SemiBold,
  });
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {!fontsLoaded && !fontError ? (
        <View
          style={[s.root, { alignItems: "center", justifyContent: "center" }]}
        >
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : (
        <Studio />
      )}
    </SafeAreaProvider>
  );
}
function Studio() {
  const [auth, setAuth] = useState<"checking" | "in" | "out">("checking");
  const [data, setData] = useState<Workspace | null>(null),
    [tab, setTab] = useState<Tab>("today"),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const loadVersion = useRef(0),
    loadingRef = useRef(false),
    pendingDestination = useRef<Tab | null>(null);
  const { width } = useWindowDimensions(),
    wide = width >= 1000;
  const opacity = useRef(new Animated.Value(1)).current;
  const reducedMotion = useRef(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      reducedMotion.current = value;
    });
    const listener = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (value) => {
        reducedMotion.current = value;
      },
    );
    return () => listener.remove();
  }, []);
  const refresh = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const version = ++loadVersion.current;
    setBusy(true);
    setError(null);
    try {
      const next = await api.loadWorkspace();
      if (version === loadVersion.current) setData(next);
    } catch (err) {
      if (version === loadVersion.current) {
        setError(readable(err));
        if (err instanceof api.SessionExpired) {
          setAuth("out");
          setData(null);
        }
      }
    } finally {
      loadingRef.current = false;
      if (version === loadVersion.current) setBusy(false);
    }
  }, []);
  const initialise = useCallback(async () => {
    setAuth("checking");
    setError(null);
    try {
      if (await api.restoreSession()) {
        await api.verifySession();
        setAuth("in");
        void refresh();
      } else setAuth("out");
    } catch (err) {
      if (err instanceof api.SessionExpired) setAuth("out");
      setError(readable(err));
    }
  }, [refresh]);
  useEffect(() => {
    void initialise();
  }, [initialise]);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const receive = (response: Notifications.NotificationResponse | null) => {
      if (response?.notification.request.content.data?.destination === "todo") {
        pendingDestination.current = "todo";
        setTab("todo");
        Notifications.clearLastNotificationResponse();
      }
    };
    receive(Notifications.getLastNotificationResponse());
    const listener =
      Notifications.addNotificationResponseReceivedListener(receive);
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (auth === "in" && pendingDestination.current) {
      setTab(pendingDestination.current);
      pendingDestination.current = null;
    }
  }, [auth]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active" && auth === "in") void refresh();
    });
    return () => listener.remove();
  }, [auth, refresh]);
  useEffect(() => {
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (selectedSubject) {
        setSelectedSubject(null);
        return true;
      }
      if (tab !== "today") {
        setTab("today");
        return true;
      }
      return false;
    });
    return () => listener.remove();
  }, [selectedSubject, tab]);
  const navigate = (next: Tab) => {
    setTab(next);
    setSelectedSubject(null);
    opacity.stopAnimation();
    if (!reducedMotion.current) {
      opacity.setValue(0);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();
    } else opacity.setValue(1);
  };
  const openWebsite = (path: string) => {
    void Linking.openURL(`${SITE_URL}${path}`).catch(() =>
      setError("Could not open the website on this device."),
    );
  };
  const logout = () =>
    Alert.alert(
      "Sign out of this device?",
      "Your study records stay in your account. This device’s local reminder will be removed.",
      [
        { text: "Stay signed in", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await disableReminder();
                await api.signOut();
                loadVersion.current++;
                setData(null);
                setError(null);
                setAuth("out");
              } catch (err) {
                setError(readable(err));
              }
            })();
          },
        },
      ],
    );
  if (auth === "checking")
    return (
      <SafeAreaView style={s.root}>
        <View style={s.login}>
          <ShieldCheck color={colors.gold} size={34} />
          <Text style={s.sectionTitle}>Opening your studio…</Text>
          {error ? (
            <ErrorNotice message={error} onRetry={() => void initialise()} />
          ) : (
            <ActivityIndicator color={colors.gold} />
          )}
        </View>
      </SafeAreaView>
    );
  if (auth === "out")
    return (
      <SignIn
        onSuccess={() => {
          setAuth("in");
          setError(null);
          void refresh();
        }}
      />
    );
  return (
    <SafeAreaView style={s.root} edges={["top", "bottom", "left", "right"]}>
      <View style={s.header}>
        <Atom color={colors.gold} size={28} />
        <View style={s.grow}>
          <Text style={s.brand}>Misti’s studio</Text>
          <Text style={s.eyebrow}>A little closer, every day</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open reminder settings"
          onPress={() => navigate("more")}
          style={s.iconButton}
        >
          <Bell color={colors.gold} size={20} />
        </Pressable>
      </View>
      <View style={{ flex: 1, flexDirection: "row" }}>
        {wide && (
          <View style={s.sidebar}>
            {tabs.map(({ id, name, Icon }) => (
              <Pressable
                key={id}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === id }}
                onPress={() => navigate(id)}
                style={[s.sidebarTab, tab === id && s.tabSelected]}
              >
                <Icon
                  size={21}
                  color={tab === id ? colors.gold : colors.muted}
                />
                <Text style={s.label}>{name}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <Animated.View style={[s.body, { opacity }]}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.scroll}
            refreshControl={
              <RefreshControl
                refreshing={busy}
                onRefresh={() => void refresh()}
                tintColor={colors.gold}
              />
            }
          >
            {error && (
              <ErrorNotice message={error} onRetry={() => void refresh()} />
            )}
            {!data && busy && (
              <ActivityIndicator
                color={colors.gold}
                accessibilityLabel="Loading saved study data"
              />
            )}
            {data && tab === "today" && (
              <Today
                data={data}
                navigate={navigate}
                chooseSubject={(slug) => {
                  setTab("subjects");
                  setSelectedSubject(slug);
                }}
              />
            )}
            {data && tab === "subjects" && (
              <Subjects
                subjects={data.subjects}
                selected={selectedSubject}
                onSelect={setSelectedSubject}
                openWebsite={openWebsite}
              />
            )}
            {data && tab === "todo" && (
              <Tasks
                tasks={data.tasks}
                onUpdate={(task) =>
                  setData((previous) =>
                    previous
                      ? {
                          ...previous,
                          tasks: previous.tasks.map((entry) =>
                            entry.id === task.id ? task : entry,
                          ),
                        }
                      : null,
                  )
                }
                onError={(message) => setError(message)}
                openWebsite={openWebsite}
                refresh={() => void refresh()}
              />
            )}
            {tab === "more" && (
              <Explore openWebsite={openWebsite} logout={logout} />
            )}
            {data && (
              <Text style={[s.small, { textAlign: "center" }]}>
                Last loaded{" "}
                {data.loadedAt.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                · same account as your website
              </Text>
            )}
          </ScrollView>
        </Animated.View>
      </View>
      {!wide && (
        <View style={s.tabbar}>
          {tabs.map(({ id, name, Icon }) => (
            <Pressable
              key={id}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === id }}
              onPress={() => navigate(id)}
              style={({ pressed }) => [
                s.tab,
                tab === id && s.tabSelected,
                pressed && s.pressed,
              ]}
            >
              <Icon size={22} color={tab === id ? colors.gold : colors.muted} />
              <Text style={[s.tabLabel, tab === id && { color: colors.gold }]}>
                {name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

function SignIn({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const submit = async () => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      await api.signIn(email, password);
      setPassword("");
      onSuccess();
    } catch (err) {
      setError(readable(err));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView
        style={s.grow}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={s.login}
          keyboardShouldPersistTaps="handled"
        >
          <Atom size={44} color={colors.gold} />
          <View style={{ gap: 12 }}>
            <Text style={s.eyebrow}>YOUR PRIVATE STUDY STUDIO</Text>
            <Text style={s.title}>A place for your{`\n`}next chapter.</Text>
            <Text style={s.muted}>
              Sign in with your existing NEET Tracker account. Your chapters,
              progress and tasks stay together.
            </Text>
          </View>
          <View style={s.card}>
            <Text style={s.label}>Welcome back, Misti.</Text>
            <TextInput
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="username"
              value={email}
              onChangeText={setEmail}
              placeholder="Your email"
              placeholderTextColor={colors.muted}
              style={s.input}
              editable={!busy}
            />
            <TextInput
              accessibilityLabel="Password"
              secureTextEntry
              textContentType="password"
              autoComplete="current-password"
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={colors.muted}
              style={s.input}
              editable={!busy}
              onSubmitEditing={() => void submit()}
            />
            {error && <ErrorNotice message={error} />}
            <Button
              title={busy ? "Signing in…" : "Enter your studio"}
              primary
              disabled={busy || !email.trim() || !password}
              onPress={() => void submit()}
              Icon={ArrowUpRight}
            />
          </View>
          <Text style={[s.small, { textAlign: "center" }]}>
            A private device session. Your password is never saved in the app.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Today({
  data,
  navigate,
  chooseSubject,
}: {
  data: Workspace;
  navigate: (tab: Tab) => void;
  chooseSubject: (slug: string) => void;
}) {
  const { metrics, subjects, tasks } = data;
  const wide = useWindowDimensions().width >= 820;
  return (
    <>
      <View style={s.hero}>
        <View style={s.heroAccent} />
        <View style={s.heroAccentInner} />
        <Text style={s.eyebrow}>YOUR NEXT CHAPTER</Text>
        <View style={[s.row, { alignItems: "flex-start", flexWrap: "wrap" }]}>
          <View style={[s.grow, { minWidth: 190, gap: 14 }]}>
            <Text style={s.title}>
              Welcome back,{`\n`}
              {metrics.studentName}.
            </Text>
            <Text style={s.muted}>One subject. One focused step.</Text>
          </View>
          <Ring
            completed={metrics.completedTopics}
            total={metrics.totalTopics}
          />
        </View>
        <Button
          title="Choose a subject"
          primary
          onPress={() => navigate("subjects")}
          Icon={ArrowUpRight}
        />
      </View>
      <View style={s.stats}>
        {[
          [Clock, "Study hours", metrics.totalStudyHours],
          [Target, "Questions", metrics.totalQuestions],
          [Check, "Tests logged", metrics.testCount],
        ].map(([Icon, label, value]) => {
          const Mark = Icon as typeof Clock;
          return (
            <View key={String(label)} style={s.stat}>
              <Mark size={20} color={colors.gold} />
              <Text style={s.number}>
                {Number(value).toLocaleString("en-IN", {
                  maximumFractionDigits: 1,
                })}
              </Text>
              <Text style={s.small}>{String(label)}</Text>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: wide ? "row" : "column", gap: 18 }}>
        <View style={[s.grow, { gap: 14 }]}>
          <Text style={s.sectionTitle}>Your subjects.</Text>
          {subjects.map((subject) => (
            <Pressable
              key={subject.id}
              accessibilityRole="button"
              onPress={() => chooseSubject(subject.slug)}
              style={({ pressed }) => [
                s.card,
                { padding: 16 },
                pressed && s.pressed,
              ]}
            >
              <View style={s.row}>
                <View
                  style={{
                    width: 6,
                    height: 35,
                    borderRadius: 4,
                    backgroundColor: subjectColor(subject.slug),
                  }}
                />
                <View style={s.grow}>
                  <Text style={s.label}>{subject.name}</Text>
                  <Text style={s.small}>
                    {subject.topics.filter((topic) => topic.isCompleted).length}{" "}
                    / {subject.topics.length} topics completed
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.muted} />
              </View>
            </Pressable>
          ))}
        </View>
        <View style={[s.grow, { gap: 18 }]}>
          <Rhythm days={metrics.pulseDays} />
          <View style={s.card}>
            <Text style={s.sectionTitle}>Keep it manageable.</Text>
            <Text style={s.muted}>
              {
                tasks.filter(
                  (task) =>
                    task.status === "TODO" || task.status === "IN_PROGRESS",
                ).length
              }{" "}
              open tasks on your board.
            </Text>
            <Button
              title="Open Todo"
              onPress={() => navigate("todo")}
              Icon={ListTodo}
            />
          </View>
        </View>
      </View>
    </>
  );
}

export function Subjects({
  subjects,
  selected,
  onSelect,
  openWebsite,
}: {
  subjects: Subject[];
  selected: string | null;
  onSelect: (slug: string | null) => void;
  openWebsite: (path: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [classLevel, setClassLevel] = useState("all"),
    [chapterKey, setChapterKey] = useState<string | null>(null);
  const subject = subjects.find((entry) => entry.slug === selected);
  const chapters = subject ? groupChapters(subject) : [];
  const visible = chapters.filter(
    (chapter) =>
      (classLevel === "all" || chapter.classLevel === classLevel) &&
      `${chapter.name} ${chapter.topics.map((topic) => topic.name).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const current = chapters.find((chapter) => chapter.key === chapterKey);
  useEffect(() => {
    setChapterKey(null);
    setQuery("");
  }, [selected]);
  return (
    <>
      <Text style={s.eyebrow}>YOUR SYLLABUS, IN FOCUS</Text>
      <Text style={s.title}>{subject ? subject.name : "Room to grow."}</Text>
      <View style={s.wrap}>
        {subjects.map((entry) => (
          <Pressable
            key={entry.id}
            accessibilityRole="button"
            accessibilityState={{ selected: entry.slug === selected }}
            onPress={() => onSelect(entry.slug)}
            style={[s.chip, entry.slug === selected && s.chipActive]}
          >
            <Text style={[s.label, { color: subjectColor(entry.slug) }]}>
              {entry.name}
            </Text>
          </Pressable>
        ))}
      </View>
      {!subject ? (
        <View style={s.card}>
          <BookOpen size={30} color={colors.gold} />
          <Text style={s.sectionTitle}>Choose your next subject.</Text>
          <Text style={s.muted}>
            Browse the same chapters, completion and question counts as your
            website.
          </Text>
        </View>
      ) : (
        <>
          <View style={[s.row, s.input]}>
            <Search size={18} color={colors.muted} />
            <TextInput
              accessibilityLabel="Search chapters and topics"
              value={query}
              onChangeText={(text) => {
                setQuery(text);
                setChapterKey(null);
              }}
              placeholder="Find a chapter or topic"
              placeholderTextColor={colors.muted}
              style={[s.text, s.grow]}
            />
          </View>
          <View style={s.wrap}>
            {["all", "11", "12"].map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: classLevel === value }}
                onPress={() => {
                  setClassLevel(value);
                  setChapterKey(null);
                }}
                style={[s.chip, classLevel === value && s.chipActive]}
              >
                <Text style={s.text}>
                  {value === "all" ? "Both classes" : `Class ${value}`}
                </Text>
              </Pressable>
            ))}
          </View>
          {current ? (
            <View style={s.card}>
              <Button
                title="All chapters"
                onPress={() => setChapterKey(null)}
                Icon={ArrowLeft}
              />
              <Text style={s.sectionTitle}>{current.name}</Text>
              <Text style={s.muted}>
                {current.questions} questions recorded · Class{" "}
                {current.classLevel}
              </Text>
              {current.topics.map((topic) => (
                <View key={topic.id} style={s.listRow}>
                  <View style={s.taskCheck}>
                    {topic.isCompleted ? (
                      <Check size={18} color={colors.green} />
                    ) : (
                      <View
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: colors.muted,
                        }}
                      />
                    )}
                  </View>
                  <View style={s.grow}>
                    <Text style={s.label}>{topic.name}</Text>
                    <Text style={s.small}>
                      {topic.isCompleted ? "Completed" : "Not completed"} ·{" "}
                      {topic.questionsSolved} questions ·{" "}
                      {topic._count?.revisions ?? 0} revisions
                    </Text>
                  </View>
                </View>
              ))}
              <Button
                title="Edit chapter on website"
                onPress={() => openWebsite(`/subjects/${subject.slug}`)}
                Icon={ArrowUpRight}
              />
              <Text style={s.small}>
                Chapter editing and voice updates currently open the website.
                Your browser may ask you to sign in separately.
              </Text>
            </View>
          ) : visible.length ? (
            visible.map((chapter) => {
              const completed = chapter.topics.filter(
                (topic) => topic.isCompleted,
              ).length;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={chapter.key}
                  onPress={() => setChapterKey(chapter.key)}
                  style={({ pressed }) => [s.card, pressed && s.pressed]}
                >
                  <View style={s.row}>
                    <View style={s.grow}>
                      <Text style={s.small}>CLASS {chapter.classLevel}</Text>
                      <Text style={s.label}>{chapter.name}</Text>
                    </View>
                    <ChevronRight size={20} color={colors.gold} />
                  </View>
                  <View style={s.progressTrack}>
                    <View
                      style={[
                        s.progressFill,
                        {
                          backgroundColor: subjectColor(subject.slug),
                          width: `${(completed / Math.max(1, chapter.topics.length)) * 100}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={s.small}>
                    {completed} / {chapter.topics.length} topics ·{" "}
                    {chapter.questions} questions recorded
                  </Text>
                </Pressable>
              );
            })
          ) : (
            <Text style={s.muted}>
              No matching chapters. Try another class or search.
            </Text>
          )}
        </>
      )}
    </>
  );
}

export function Tasks({
  tasks,
  onUpdate,
  onError,
  openWebsite,
  refresh,
}: {
  tasks: Task[];
  onUpdate: (task: Task) => void;
  onError: (message: string) => void;
  openWebsite: (path: string) => void;
  refresh: () => void;
}) {
  const [pending, setPending] = useState<string | null>(null),
    [showDone, setShowDone] = useState(false),
    [needsRefresh, setNeedsRefresh] = useState(false);
  const locked = useRef(false);
  const visible = tasks.filter((task) =>
    showDone
      ? task.status === "DONE"
      : task.status === "TODO" || task.status === "IN_PROGRESS",
  );
  useEffect(() => setNeedsRefresh(false), [tasks]);
  const complete = async (task: Task) => {
    if (locked.current || needsRefresh) return;
    locked.current = true;
    setPending(task.id);
    try {
      onUpdate(await api.completeTask(task.id));
    } catch (err) {
      setNeedsRefresh(true);
      onError(readable(err));
    } finally {
      locked.current = false;
      setPending(null);
    }
  };
  return (
    <>
      <Text style={s.eyebrow}>SMALL STEPS, REAL PROGRESS</Text>
      <Text style={s.title}>Make space for{`\n`}what matters.</Text>
      <Text style={s.muted}>
        Your shared Todo board. Mark a task complete here and it updates on the
        website.
      </Text>
      <View style={s.wrap}>
        <Button
          title="To do"
          primary={!showDone}
          onPress={() => setShowDone(false)}
        />
        <Button
          title="Completed"
          primary={showDone}
          onPress={() => setShowDone(true)}
        />
      </View>
      {needsRefresh && (
        <Button
          title="Refresh before another change"
          onPress={refresh}
          Icon={RefreshCw}
        />
      )}
      <View style={s.card}>
        {visible.length === 0 ? (
          <Text style={s.muted}>
            {showDone
              ? "No completed tasks in this board window."
              : "Your board is clear. You can plan the next step when you’re ready."}
          </Text>
        ) : (
          visible.map((task) => (
            <View key={task.id} style={s.listRow}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{
                  checked: task.status === "DONE",
                  disabled: Boolean(pending) || showDone || needsRefresh,
                }}
                accessibilityLabel={`Mark ${task.title} completed`}
                disabled={Boolean(pending) || showDone || needsRefresh}
                onPress={() => void complete(task)}
                style={[
                  s.taskCheck,
                  task.status === "DONE" && { borderColor: colors.green },
                ]}
              >
                {pending === task.id ? (
                  <ActivityIndicator size="small" color={colors.gold} />
                ) : task.status === "DONE" ? (
                  <Check size={19} color={colors.green} />
                ) : null}
              </Pressable>
              <View style={s.grow}>
                <Text style={s.label}>{task.title}</Text>
                <Text style={s.small}>
                  {task.subject?.name || "Personal study"}
                  {task.plannedMinutes ? ` · ${task.plannedMinutes} min` : ""}
                  {task.dueDate ? ` · ${task.dueDate.slice(0, 10)}` : ""}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
      <Button
        title="Plan or edit tasks on website"
        onPress={() => openWebsite("/todo")}
        Icon={ArrowUpRight}
      />
    </>
  );
}

function Explore({
  openWebsite,
  logout,
}: {
  openWebsite: (path: string) => void;
  logout: () => void;
}) {
  const [time, setTime] = useState("20:30"),
    [enabled, setEnabled] = useState(false),
    [allowed, setAllowed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  useEffect(() => {
    const read = () =>
      void reminderState()
        .then((state) => {
          setEnabled(state.scheduled);
          setAllowed(state.allowed);
        })
        .catch(() =>
          setError("Could not read this device’s reminder settings."),
        );
    read();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") read();
    });
    return () => listener.remove();
  }, []);
  const update = async () => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      if (enabled) await disableReminder();
      else await enableReminder(time);
      const state = await reminderState();
      setEnabled(state.scheduled);
      setAllowed(state.allowed);
    } catch (err) {
      setError(readable(err));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <Text style={s.eyebrow}>YOUR STUDIO, YOUR RHYTHM</Text>
      <Text style={s.title}>A gentle nudge.</Text>
      <View style={s.card}>
        <Bell color={colors.gold} size={27} />
        <Text style={s.sectionTitle}>A daily moment to reflect.</Text>
        <Text style={s.muted}>
          One optional reminder on this device. It opens your Todo board. No
          study details appear on the lock screen.
        </Text>
        {!enabled && (
          <>
            <Text style={s.small}>Device-local time · 24-hour clock</Text>
            <TextInput
              accessibilityLabel="Daily reminder time"
              value={time}
              onChangeText={setTime}
              editable={!enabled && !busy}
              placeholder="20:30"
              placeholderTextColor={colors.muted}
              style={s.input}
              maxLength={5}
            />
          </>
        )}
        <Button
          title={
            busy
              ? "Updating…"
              : enabled
                ? "Turn reminder off"
                : "Enable daily reminder"
          }
          primary={!enabled}
          disabled={busy}
          onPress={() => void update()}
          Icon={Bell}
        />
        <Text style={s.small}>
          {enabled
            ? allowed
              ? "Reminder scheduled on this device. Turn it off to change the time."
              : "A reminder is scheduled, but device permission is blocked. Open Settings or turn the reminder off."
            : "Off until you choose to enable it. Device settings can delay alerts."}
        </Text>
        {error && <ErrorNotice message={error} />}
        <Button
          title="Device notification settings"
          onPress={() =>
            void Linking.openSettings().catch(() =>
              setError(
                "Open Settings on your device to change notification permission.",
              ),
            )
          }
        />
      </View>
      <View style={s.card}>
        <Text style={s.sectionTitle}>The rest of your studio.</Text>
        <Text style={s.muted}>
          These open the existing website while their native versions are being
          built. Browser sign-in is separate.
        </Text>
        {[
          ["Daily log", "/daily-goals"],
          ["Practice Arena", "/practice"],
          ["NCERT reader", "/reader"],
          ["Test log & analysis", "/tests"],
          ["Mistake notebook", "/tests/error-log"],
          ["Insights hub", "/ai-insights"],
          ["Study planner", "/planner"],
          ["Rank predictor", "/ai-insights/rank-predictor"],
          ["Cycle planner", "/ai-insights/cycle-planner"],
          ["NEET Guru", "/ai-insights/neet-guru"],
          ["PYQ library", "/pyq/questions"],
          ["Year-wise PYQ tracker", "/pyq"],
          ["Reviews", "/reviews"],
          ["Mood journal", "/mood"],
        ].map(([name, path]) => (
          <Pressable
            key={path}
            accessibilityRole="link"
            onPress={() => openWebsite(path)}
            style={s.listRow}
          >
            <Text style={[s.label, s.grow]}>{name}</Text>
            <Text style={s.small}>Website</Text>
            <ArrowUpRight color={colors.gold} size={18} />
          </Pressable>
        ))}
      </View>
      <View style={s.card}>
        <Text style={s.label}>Bubu’s native voice is next.</Text>
        <Text style={s.muted}>
          This build does not request the microphone or substitute another
          voice. Native recognition, your private cloned clips and reviewed
          actions still need integration and device testing.
        </Text>
        <Button
          title="Use Bubu on the website"
          onPress={() => openWebsite("/dashboard")}
          Icon={ArrowUpRight}
        />
      </View>
      <Button title="Sign out of this device" onPress={logout} Icon={LogOut} />
    </>
  );
}
