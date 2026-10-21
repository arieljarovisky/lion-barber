/* Service worker: notificaciones push nativas (banner flotante del sistema). */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function parsePayload(raw) {
  if (!raw) {
    return {
      title: 'Lion Barber',
      body: 'Tenés una novedad en la agenda',
      url: '/dashboard',
      tag: 'lion-barber',
    };
  }
  try {
    const data = JSON.parse(raw);
    return {
      title: typeof data.title === 'string' && data.title ? data.title : 'Lion Barber',
      body: typeof data.body === 'string' ? data.body : '',
      url: typeof data.url === 'string' && data.url ? data.url : '/dashboard',
      tag: typeof data.tag === 'string' && data.tag ? data.tag : 'lion-barber',
    };
  } catch {
    return {
      title: 'Lion Barber',
      body: String(raw),
      url: '/dashboard',
      tag: 'lion-barber',
    };
  }
}

self.addEventListener('push', (event) => {
  const raw = event.data ? event.data.text() : '';
  const payload = parsePayload(raw);
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/android-chrome-192x192.png',
      badge: '/android-chrome-192x192.png',
      tag: payload.tag,
      renotify: true,
      data: { url: payload.url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          if (client.url.includes('/dashboard')) {
            return client.focus();
          }
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
