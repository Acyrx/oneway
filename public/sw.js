// Lumi service worker — handles push notifications when the app is in the background.
// Registered automatically by usePushNotifications() in use-chat.ts.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'New message', body: event.data.text(), conversationId: null };
  }

  const options = {
    body: data.body ?? '',
    icon: '/apple-icon.png',
    badge: '/icon-dark-32x32.png',
    tag: data.conversationId ?? 'lumi-message',
    renotify: true,
    vibrate: [150, 50, 150],
    data: { url: '/', conversationId: data.conversationId },
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Lumi', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url ?? '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(targetUrl) && 'focus' in c);
      if (existing) return existing.focus();
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
