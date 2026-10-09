"use client";

import { useEffect } from "react";

/** On this site the dashboard-switch password is asked by the picker. */
export default function HubUnlock() {
  useEffect(() => window.location.replace("/exam?want=hub"), []);
  return null;
}
