let registrationPromise: Promise<ServiceWorkerRegistration | null> | null =
  null;

function canUseServiceWorker() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    window.isSecureContext !== false
  );
}

export function ensureNotificationRegistration() {
  if (!canUseServiceWorker()) {
    return null;
  }
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register("/notification-sw.js")
      .catch((error) => {
        console.error("Notification service worker registration failed", error);
        registrationPromise = null;
        return null;
      });
  }
  return registrationPromise;
}

export async function showNotification(
  title: string,
  options?: NotificationOptions,
) {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return;
  }
  try {
    const registration = await ensureNotificationRegistration();
    if (registration) {
      await registration.showNotification(title, options);
      return;
    }
    new window.Notification(title, options);
  } catch (error) {
    console.error("Failed to display notification", error);
  }
}
