// Minimal service worker so phones offer "Install app".
// It does not cache anything; the app always loads fresh from the internet.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
