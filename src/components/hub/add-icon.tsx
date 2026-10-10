/**
 * Saath's "add" mark: a plus held between two small orbiting dots — one in
 * Adarsh's colour, one in Misti's — joined by a faint arc. On hover the two
 * dots swing round the plus (styles in hub.css, `.sth-add`). Drop-in for a
 * lucide icon: takes `size`. Identical in both repos.
 */
export function SaathAdd({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg className={`sth-add ${className}`.trim()} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path className="arc" d="M4.6 15.6A8.2 8.2 0 0 1 15.6 4.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="0.1 3.1" />
      <path className="plus" d="M12 7.2v9.6M7.2 12h9.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <g className="orbit">
        <circle className="a" cx="18.6" cy="5.4" r="2.3" />
        <circle className="m" cx="5.4" cy="18.6" r="2.3" />
      </g>
    </svg>
  );
}
