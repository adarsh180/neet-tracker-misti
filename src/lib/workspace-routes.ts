/** Shared navigation directory. Labels and destinations are product data, not model output. */
export const WORKSPACE_ROUTES = [
  { href: "/dashboard", label: "Today", group: "Workspace", icon: "home", aliases: ["dashboard", "home", "overview"] },
  { href: "/daily-goals", label: "Daily log", group: "Workspace", icon: "log", aliases: ["daily goals", "study hours", "log my day"] },
  { href: "/todo", label: "Todo", group: "Workspace", icon: "todo", aliases: ["tasks", "tomorrow", "to do"] },
  { href: "/planner", label: "Day planner", group: "Workspace", icon: "calendar", aliases: ["schedule", "morning command"] },
  { href: "/subjects/physics", label: "Physics", group: "Subjects", icon: "physics", aliases: ["physical science"] },
  { href: "/subjects/chemistry", label: "Chemistry", group: "Subjects", icon: "chemistry", aliases: ["organic", "inorganic"] },
  { href: "/subjects/botany", label: "Botany", group: "Subjects", icon: "botany", aliases: ["plants"] },
  { href: "/subjects/zoology", label: "Zoology", group: "Subjects", icon: "zoology", aliases: ["animals", "human biology"] },
  { href: "/practice", label: "Practice Arena", group: "Practice", icon: "practice", aliases: ["custom test", "sectional test", "mock test"] },
  { href: "/tests", label: "Test journal", group: "Practice", icon: "chart", aliases: ["test logging", "test performance", "tests"] },
  { href: "/tests/error-log", label: "Mistake notebook", group: "Practice", icon: "review", aliases: ["error log", "wrong questions", "mistakes"] },
  { href: "/reader", label: "NCERT library", group: "Library", icon: "book", aliases: ["ncert reader", "books", "pdf"] },
  { href: "/pyq", label: "Past papers", group: "Library", icon: "papers", aliases: ["pyq archive", "previous year papers"] },
  { href: "/pyq/questions", label: "PYQ explorer", group: "Library", icon: "search", aliases: ["previous year questions", "question bank"] },
  { href: "/reviews", label: "Review cards", group: "Insights", icon: "review", aliases: ["weekly review", "monthly review"] },
  { href: "/ai-insights", label: "Insights", group: "Insights", icon: "insights", aliases: ["ai insights", "intelligence suite"] },
  { href: "/ai-insights/neet-guru", label: "NEET-GURU", group: "Insights", icon: "mentor", aliases: ["neet guru", "tutor", "doubts"] },
  { href: "/ai-insights/rank-predictor", label: "Rank outlook", group: "Insights", icon: "chart", aliases: ["rank predictor", "prediction"] },
  { href: "/mood", label: "Wellbeing", group: "Personal", icon: "heart", aliases: ["mood", "energy", "mood tracker"] },
  { href: "/ai-insights/cycle-planner", label: "Cycle planner", group: "Personal", icon: "calendar", aliases: ["cycle", "period calendar"] },
] as const;

export function searchWorkspaceRoutes(query: string) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return WORKSPACE_ROUTES.filter((route) => words.every((word) => `${route.label} ${route.aliases.join(" ")}`.toLowerCase().includes(word)));
}
