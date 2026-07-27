/**
 * Audio & Desktop Notification Utilities for WACRM Inbox.
 */

const SOUND_MUTED_STORAGE_KEY = "wacrm:inbox:sound-muted";

/**
 * Play a soft 2-tone notification chime using Web Audio API (no external MP3 asset needed).
 */
export function playNotificationChime() {
  if (typeof window === "undefined") return;

  // Check if sound is muted in localStorage
  try {
    const isMuted = localStorage.getItem(SOUND_MUTED_STORAGE_KEY) === "true";
    if (isMuted) return;
  } catch {
    // Ignore storage read errors
  }

  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    // Soft two-note melody (D5 -> A5)
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch (err) {
    console.warn("[notifications] Audio chime failed:", err);
  }
}

export function isSoundMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SOUND_MUTED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setSoundMuted(muted: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SOUND_MUTED_STORAGE_KEY, String(muted));
  } catch {
    // Ignore storage write errors
  }
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  if (Notification.permission === "granted") return "granted";
  return await Notification.requestPermission();
}

export function getBrowserNotificationPermission(): NotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  return Notification.permission;
}

export function showDesktopNotification(
  title: string,
  options?: { body?: string; tag?: string; onClick?: () => void }
) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    const notification = new Notification(title, {
      body: options?.body,
      tag: options?.tag,
      icon: "/favicon.ico",
    });

    if (options?.onClick) {
      notification.onclick = () => {
        window.focus();
        options.onClick?.();
        notification.close();
      };
    }
  } catch (err) {
    console.warn("[notifications] Desktop notification failed:", err);
  }
}
