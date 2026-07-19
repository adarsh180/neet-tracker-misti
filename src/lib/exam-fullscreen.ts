type WebkitFullscreenDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
};

type WebkitFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type StandaloneNavigator = Navigator & { standalone?: boolean };

export function isExamFullscreenActive() {
  if (typeof document === "undefined") return false;
  const legacyDocument = document as WebkitFullscreenDocument;
  const standalone = typeof window !== "undefined"
    && (window.matchMedia("(display-mode: fullscreen)").matches
      || window.matchMedia("(display-mode: standalone)").matches
      || Boolean((navigator as StandaloneNavigator).standalone));
  return Boolean(document.fullscreenElement || legacyDocument.webkitFullscreenElement || standalone);
}

export async function requestExamFullscreen(target?: HTMLElement | null) {
  if (typeof document === "undefined") return false;
  if (isExamFullscreenActive()) return true;
  const element = (target ?? document.documentElement) as WebkitFullscreenElement;
  try {
    if (element.requestFullscreen) {
      await element.requestFullscreen({ navigationUI: "hide" });
    } else if (element.webkitRequestFullscreen) {
      await element.webkitRequestFullscreen();
    } else {
      return isExamFullscreenActive();
    }
  } catch {
    return false;
  }
  return isExamFullscreenActive();
}

export async function exitExamFullscreen() {
  if (typeof document === "undefined") return;
  const legacyDocument = document as WebkitFullscreenDocument;
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    } else if (legacyDocument.webkitFullscreenElement && legacyDocument.webkitExitFullscreen) {
      await legacyDocument.webkitExitFullscreen();
    }
  } catch {
    // The browser owns fullscreen state; a rejected exit should not break saving.
  }
}
