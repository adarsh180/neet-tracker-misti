export type VoiceDeviceKind = "IPAD" | "ANDROID" | "DESKTOP" | "UNKNOWN";

export type VoiceDeviceProfile = {
  kind: VoiceDeviceKind;
  label: string;
  lowPower: boolean;
  recommendedMode: "TAP" | "WAKE";
  wakeScope: string;
  permissionHelp: string;
};

export function detectVoiceDevice(userAgent: string, maxTouchPoints = 0): VoiceDeviceProfile {
  const value = userAgent.toLowerCase();
  const ipad = value.includes("ipad") || (value.includes("macintosh") && maxTouchPoints > 1);
  if (ipad) {
    return {
      kind: "IPAD",
      label: "iPad",
      lowPower: false,
      recommendedMode: "TAP",
      wakeScope: "Wake phrases work while NEET Tracker is open and visible on iPad.",
      permissionHelp: "If access is blocked, open Settings → Safari → Microphone and allow this site, then return and retry.",
    };
  }
  if (value.includes("android")) {
    return {
      kind: "ANDROID",
      label: "Android phone",
      lowPower: true,
      recommendedMode: "TAP",
      wakeScope: "Tap to speak is recommended for battery life. Foreground wake mode works only while this page stays visible.",
      permissionHelp: "If access is blocked, tap the address-bar site controls → Permissions → Microphone → Allow.",
    };
  }
  if (value.includes("windows") || value.includes("macintosh") || value.includes("linux")) {
    return {
      kind: "DESKTOP",
      label: "Desktop browser",
      lowPower: false,
      recommendedMode: "WAKE",
      wakeScope: "Foreground wake mode can stay active while NEET Tracker remains open.",
      permissionHelp: "If access is blocked, open the lock or site-controls icon beside the address and allow Microphone.",
    };
  }
  return {
    kind: "UNKNOWN",
    label: "This device",
    lowPower: true,
    recommendedMode: "TAP",
    wakeScope: "Tap to speak is the most reliable mode on this device.",
    permissionHelp: "Open this site's browser permissions, allow Microphone, and retry.",
  };
}
