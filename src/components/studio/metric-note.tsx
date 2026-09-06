import { Info } from "lucide-react";

export default function MetricNote({ children }: { children: React.ReactNode }) {
  return <details className="metric-note"><summary><Info size={14} /> How to read this</summary><p>{children}</p></details>;
}
