export function NeetLogoMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/brand/neet-doctor-logo-mark.png"
      alt="NEET Doctor Logo"
      className={className}
      width={size}
      height={size}
      style={{
        display: "inline-block",
        borderRadius: "50%",
        verticalAlign: "middle",
        objectFit: "contain",
      }}
    />
  );
}

