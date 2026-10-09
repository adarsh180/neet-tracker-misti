"use client";

import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Target,
  BarChart2,
  Sparkles,
  SmilePlus,
  Leaf,
  Zap,
  Microscope,
  Atom,
  LogOut,
  Brain,
  Heart,
  TrendingUp,
  ListTodo,
  FolderOpen,
  Sunrise,
  ClipboardCheck,
  Swords,
  BookOpen,
  Search,
} from "lucide-react";

import { clearAuth } from "@/lib/auth";
import { PageDial, type DialItem } from "@/components/page-dial";

/* Doing pages on the inner ring; subjects, library and AI tools outside. */
const ITEMS: DialItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard", short: "Home" },
  { href: "/planner", icon: Sunrise, label: "Day Planner", short: "Planner" },
  { href: "/todo", icon: ListTodo, label: "Todo Deck", short: "Todo" },
  { href: "/daily-goals", icon: Target, label: "Daily Goals", short: "Goals" },
  { href: "/tests", icon: BarChart2, label: "Tests", short: "Tests" },
  { href: "/practice", icon: Swords, label: "Practice Arena", short: "Practice" },
  { href: "/visual-lab", icon: Atom, label: "Visual Lab", short: "Lab" },
  { href: "/mood", icon: SmilePlus, label: "Mood Tracker", short: "Mood" },
  { href: "/subjects/botany", icon: Leaf, label: "Botany", group: "Subjects", ring: 1 },
  { href: "/subjects/zoology", icon: Microscope, label: "Zoology", group: "Subjects", ring: 1 },
  { href: "/subjects/physics", icon: Zap, label: "Physics", group: "Subjects", ring: 1 },
  { href: "/subjects/chemistry", icon: Atom, label: "Chemistry", group: "Subjects", ring: 1 },
  { href: "/pyq", icon: FolderOpen, label: "PYQ Library", short: "PYQ", group: "Library", ring: 1 },
  { href: "/pyq/questions", icon: Search, label: "PYQ Explorer", short: "Explorer", group: "Library", ring: 1 },
  { href: "/reader", icon: BookOpen, label: "NCERT Reader", short: "NCERT", group: "Library", ring: 1 },
  { href: "/ai-insights", icon: Sparkles, label: "AI Insights", short: "AI hub", group: "AI tools", ring: 1 },
  { href: "/ai-insights/neet-guru", icon: Brain, label: "NEET-GURU", short: "Guru", group: "AI tools", ring: 1 },
  { href: "/reviews", icon: ClipboardCheck, label: "Review Cards", short: "Reviews", group: "AI tools", ring: 1 },
  { href: "/todo?focus=mission", icon: Target, label: "Mission Planner", short: "Mission", group: "AI tools", ring: 1 },
  { href: "/todo?focus=copilot", icon: Brain, label: "Task Copilot", short: "Copilot", group: "AI tools", ring: 1 },
  { href: "/ai-insights/rank-predictor", icon: TrendingUp, label: "Rank Predictor", short: "Rank", group: "AI tools", ring: 1 },
  { href: "/ai-insights/cycle-planner", icon: Heart, label: "Cycle Planner", short: "Cycle", group: "AI tools", ring: 1 },
];

/** NEET UG page menu: the circular dial (components/page-dial.tsx), bottom-right on every screen. */
export default function QuickNav() {
  const router = useRouter();
  return (
    <div className="ql-dial">
      <PageDial
        items={ITEMS}
        title="NEET UG"
        label="All pages"
        actions={[
          {
            label: "Sign out",
            icon: LogOut,
            onClick: () => {
              clearAuth();
              router.push("/signin");
            },
          },
        ]}
      />
    </div>
  );
}
