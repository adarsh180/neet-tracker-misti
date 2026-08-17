export const PRIVATE_VOICE_CLIP_IDS = [
  "onboarding-bubu", "onboarding-shona", "coverage", "subject-completion", "weakness", "discipline", "plan-completion", "tomorrow", "review-bubu", "review-shona", "saved-bubu", "saved-shona",
  "study-physics-bubu", "study-physics-shona", "study-chemistry-bubu", "study-chemistry-shona", "study-botany-bubu", "study-botany-shona", "study-zoology-bubu", "study-zoology-shona",
  "hours-physics", "hours-chemistry", "hours-botany", "hours-zoology",
  "questions-physics", "questions-chemistry", "questions-botany", "questions-zoology",
  "intensity-physics", "intensity-chemistry", "intensity-botany", "intensity-zoology",
  "assistant-ready-warm", "assistant-ready-mentor", "assistant-ready-buddy",
  "assistant-working-warm", "assistant-working-mentor", "assistant-working-buddy",
  "assistant-done-warm", "assistant-done-mentor", "assistant-done-buddy",
  "assistant-clarify-warm", "assistant-clarify-mentor",
  "assistant-error-warm", "assistant-error-mentor",
] as const;

export const VOICE_ONBOARDING_VERSION = 3;

export type PrivateVoiceClipId = (typeof PRIVATE_VOICE_CLIP_IDS)[number];

const CLIP_SET = new Set<string>(PRIVATE_VOICE_CLIP_IDS);

export function isPrivateVoiceClipId(value: string): value is PrivateVoiceClipId {
  return CLIP_SET.has(value);
}

export function privateVoicePathname(clipId: PrivateVoiceClipId) {
  return `voice/adarsh-v1/${clipId}.mp3`;
}
