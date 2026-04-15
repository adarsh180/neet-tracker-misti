"use client";

import { ViewTransition, type ReactNode } from "react";
import { usePathname } from "next/navigation";

export default function RouteTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <ViewTransition
      enter={{
        "nav-forward": "nav-forward",
        "nav-back": "nav-back",
        default: "route-fade",
      }}
      exit={{
        "nav-forward": "nav-forward",
        "nav-back": "nav-back",
        default: "route-fade",
      }}
      default="route-fade"
    >
      <div key={pathname} className={className}>
        {children}
      </div>
    </ViewTransition>
  );
}
