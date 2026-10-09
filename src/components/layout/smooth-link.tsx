"use client";

import Link, { type LinkProps } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { AnchorHTMLAttributes, ReactNode } from "react";

import { irisGo } from "@/components/iris";

type TransitionDirection = "forward" | "back" | "auto";

type SmoothLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    children: ReactNode;
    direction?: TransitionDirection;
    /** Open the page through the circular iris (rail and menus). */
    iris?: boolean;
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
  iris,
  onClick,
  ...props
}: SmoothLinkProps) {
  const pathname = usePathname();
  const router = useRouter();
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
      onClick={(e) => {
        onClick?.(e);
        if (!iris || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0 || typeof href !== "string" || targetPath === pathname) return;
        e.preventDefault();
        irisGo(() => router.push(href), { x: e.clientX, y: e.clientY }, props["aria-label"]?.replace(/ \(.*\)$/, ""));
      }}
    >
      {children}
    </Link>
  );
}
