import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { REMINDER_ID, parseReminderTime } from "./contracts";
const CHANNEL = "study-reminders";
if (Platform.OS !== "web")
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
export async function reminderState() {
  if (Platform.OS === "web")
    return { scheduled: false, enabled: false, allowed: false };
  const [permission, scheduled] = await Promise.all([
    Notifications.getPermissionsAsync(),
    Notifications.getAllScheduledNotificationsAsync(),
  ]);
  const allowed =
    permission.granted ||
    permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  return {
    scheduled: scheduled.some((entry) => entry.identifier === REMINDER_ID),
    enabled:
      allowed && scheduled.some((entry) => entry.identifier === REMINDER_ID),
    allowed,
  };
}
export async function enableReminder(time: string) {
  if (Platform.OS === "web")
    throw new Error("Reminders need the Android/iOS app.");
  const { hour, minute } = parseReminderTime(time);
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: "Study reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain)
    permission = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
  if (
    !permission.granted &&
    permission.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL
  )
    throw new Error(
      "Notifications are not allowed. Enable them in your device settings, then try again.",
    );
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: "A moment for your study day",
      body: "Your study studio is ready when you are.",
      sound: "default",
      data: { destination: "todo" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: CHANNEL,
    },
  });
  if (!(await reminderState()).enabled)
    throw new Error("The reminder could not be confirmed on this device.");
}
export async function disableReminder() {
  if (Platform.OS === "web") return;
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  if (scheduled.some((entry) => entry.identifier === REMINDER_ID))
    throw new Error("Could not remove the reminder. Please retry.");
}
