import { ArrowUpRight, Brain, ChartNoAxesCombined, HeartPulse, NotebookPen, Compass } from "lucide-react";
import SmoothLink from "@/components/layout/smooth-link";
import styles from "./insights.module.css";

const tools = [
  { href: "/ai-insights/neet-guru", icon: Brain, label: "01 / Understand", title: "A little guidance.", name: "NEET-GURU", description: "Talk through a difficult topic or decide what to study next.", color: "gold" },
  { href: "/ai-insights/rank-predictor", icon: ChartNoAxesCombined, label: "02 / Look ahead", title: "Put scores in perspective.", name: "Rank predictor", description: "Explore an estimate from your test history. A direction, not an admission promise.", color: "blue" },
  { href: "/ai-insights/cycle-planner", icon: HeartPulse, label: "03 / Find your pace", title: "Make room for you.", name: "Wellness planner", description: "Bring your energy, mood and cycle notes into your study planning.", color: "pink" },
  { href: "/reviews", icon: NotebookPen, label: "04 / Reflect", title: "See what is changing.", name: "Review cards", description: "Revisit your weekly and monthly records, recognise progress and choose a next step.", color: "green" },
];

export default function AIInsightsPage() {
  return (
    <div className={`studio-page ${styles.page}`} data-studio-native>
      <header className={`studio-heading ${styles.heading}`}>
        <div>
          <span className="studio-eyebrow">The bigger picture</span>
          <h1>Clarity for your next step.</h1>
          <p>Four ways to reflect, find support and move forward.</p>
        </div>
        <Compass className={styles.compass} size={68} strokeWidth={0.8} aria-hidden="true" />
      </header>
      <section className={styles.grid} aria-label="Study insights and support">
        {tools.map((tool) => (
          <SmoothLink href={tool.href} key={tool.href} className={styles.card} data-accent={tool.color}>
            <div className={styles.top}><span>{tool.label}</span><tool.icon size={26} strokeWidth={1.3} aria-hidden="true" /></div>
            <h2>{tool.title}</h2>
            <p>{tool.description}</p>
            <div className={styles.footer}><span>{tool.name}</span><ArrowUpRight size={21} aria-hidden="true" /></div>
          </SmoothLink>
        ))}
      </section>
      <aside className={styles.note}>
        <span>Keep the context.</span>
        <p>Insights depend on the records you save. Check generated advice against your syllabus and trusted sources.</p>
        <SmoothLink href="/daily-goals">Update your study log <ArrowUpRight size={16} aria-hidden="true" /></SmoothLink>
      </aside>
    </div>
  );
}
