"use client";

import Link, { type LinkProps } from "next/link";
import { usePathname } from "next/navigation";
import type { AnchorHTMLAttributes, ReactNode } from "react";

type TransitionDirection = "forward" | "back" | "auto";

type SmoothLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    children: ReactNode;
    direction?: TransitionDirection;
  };

function normalizePath(value: string) {
  return value.split("?")[0]?.split("#")[0] || "/";
}

function inferDirection(currentPath: string, nextPath: string) {
  if (currentPath === nextPath) return undefined;
  if (currentPath.startsWith(nextPath) && nextPath !== "/") return "nav-back";
  if (nextPath.startsWith(currentPath) && currentPath !== "/") return "nav-forward";

  const currentDepth = currentPath.split("/").filter(Boolean).length;
  const nextDepth = nextPath.split("/").filter(Boolean).length;

  return nextDepth >= currentDepth ? "nav-forward" : "nav-back";
}

export default function SmoothLink({
  href,
  children,
  direction = "auto",
  prefetch,
  ...props
}: SmoothLinkProps) {
  const pathname = usePathname();
  const targetPath = normalizePath(typeof href === "string" ? href : href.pathname || "/");

  const transitionType =
    direction === "forward"
      ? "nav-forward"
      : direction === "back"
        ? "nav-back"
        : inferDirection(pathname, targetPath);

  return (
    <Link
      href={href}
      prefetch={prefetch ?? true}
      transitionTypes={transitionType ? [transitionType] : undefined}
      {...props}
    >
      {children}
    </Link>
  );
}
