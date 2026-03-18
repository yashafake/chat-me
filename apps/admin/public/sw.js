self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  let payload = null;

  try {
    payload = event.data.json();
  } catch {
    payload = null;
  }

  if (!payload || typeof payload !== "object") {
    return;
  }

  const title = typeof payload.title === "string" ? payload.title : "New chat message";
  const body = typeof payload.body === "string" ? payload.body : "Open operator console";
  const path = typeof payload.path === "string" ? payload.path : "/admin/chat";
  const tag = typeof payload.tag === "string" ? payload.tag : "chat-me";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      renotify: true,
      badge: "/admin/pwa-badge.svg",
      icon: "/admin/pwa-icon.svg",
      data: {
        path
      }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path =
    event.notification &&
    event.notification.data &&
    typeof event.notification.data.path === "string"
      ? event.notification.data.path
      : "/admin/chat";
  const targetUrl = new URL(path, self.registration.scope).toString();

  event.waitUntil(
    self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then(async (clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          if ("navigate" in client) {
            await client.navigate(targetUrl);
          }
          return client.focus();
        }
      }

      return self.clients.openWindow(targetUrl);
    })
  );
});
