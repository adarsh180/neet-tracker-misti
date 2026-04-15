export default function ProtectedLoading() {
  return (
    <div className="page-content" style={{ display: "flex", flexDirection: "column", gap: 24, minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div className="skeleton" style={{ width: 180, height: 18, borderRadius: 999 }} />
        <div style={{ display: "flex", gap: 12 }}>
          <div className="skeleton" style={{ width: 88, height: 38, borderRadius: 14 }} />
          <div className="skeleton" style={{ width: 88, height: 38, borderRadius: 14 }} />
        </div>
      </div>

      <div className="glass-card" style={{ padding: 28 }}>
        <div className="skeleton" style={{ width: "min(240px, 100%)", height: 28, borderRadius: 14, marginBottom: 16 }} />
        <div className="skeleton" style={{ width: "100%", height: 12, borderRadius: 999 }} />
        <div className="skeleton" style={{ width: "60%", height: 12, borderRadius: 999, marginTop: 12 }} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 20,
        }}
      >
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="glass-card" style={{ padding: 28 }}>
            <div className="skeleton" style={{ width: 46, height: 46, borderRadius: 14, marginBottom: 18 }} />
            <div className="skeleton" style={{ width: "72%", height: 12, borderRadius: 999, marginBottom: 16 }} />
            <div className="skeleton" style={{ width: "100%", height: 12, borderRadius: 999 }} />
            <div className="skeleton" style={{ width: "60%", height: 12, borderRadius: 999, marginTop: 12 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
