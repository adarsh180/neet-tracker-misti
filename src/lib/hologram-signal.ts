import type { AssistantState } from "../../shared/hologram/geometry";
let state: AssistantState = "idle",
  sample = () => 0;
const listeners = new Set<() => void>();
export const readAssistantState = () => state;
export const readAssistantAudio = () => sample();
export const subscribeAssistantState = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
/** Visual-only bridge to the existing assistant. It never starts a microphone or changes assistant behavior. */
export function publishAssistantSignal(
  next: AssistantState,
  audio: () => number = () => 0,
) {
  sample = audio;
  if (next !== state) {
    state = next;
    listeners.forEach((listener) => listener());
  }
}
