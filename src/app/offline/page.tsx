import SmoothLink from "@/components/layout/smooth-link";

export const metadata = {
  title: "Offline | Sacred Path",
};

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: "100svh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background:
          "radial-gradient(circle at 16% 12%, rgba(212,168,83,0.15), transparent 28%), radial-gradient(circle at 82% 86%, rgba(91,156,245,0.12), transparent 30%), #020204",
        color: "var(--text-primary)",
      }}
    >
      <section
        className="glass-card"
        style={{
          width: "min(520px, 100%)",
          padding: 28,
          borderRadius: 28,
        }}
      >
        <p
          style={{
            margin: "0 0 10px",
            color: "var(--text-muted)",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          Offline mode
        </p>
        <h1 style={{ margin: 0, fontSize: "clamp(32px, 8vw, 48px)", lineHeight: 1.05 }}>
          Sacred Path is installed. Live study data needs internet.
        </h1>
        <p style={{ margin: "18px 0 24px", color: "var(--text-secondary)", lineHeight: 1.75 }}>
          You can open cached pages and queue study logs while offline. TiDB sync, NEET-GURU, rank analysis, and fresh analytics need internet.
        </p>
        <div
          style={{
            display: "grid",
            gap: 10,
            marginBottom: 24,
            color: "var(--text-secondary)",
            fontSize: 14,
            lineHeight: 1.55,
          }}
        >
          <span>Available offline after first load: app shell, dashboard route, Daily Goals form, cached pages.</span>
          <span>Queued when offline: daily goals, mood, tests, tasks, topics, cycle logs, and error-log edits.</span>
          <span>Synced later: queued writes replay automatically when connection returns.</span>
        </div>
        <SmoothLink
          href="/dashboard"
          className="btn btn-primary"
          style={{
            minHeight: 44,
            padding: "0 18px",
          }}
        >
          Try dashboard again
        </SmoothLink>
      </section>
    </main>
  );
}
