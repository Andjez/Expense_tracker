
const CACHE_NAME = "our-expenses-v3.3.10";

const APP_SHELL = [
    "./",
    "./index.html",
    "./style.css",
    "./app.js",
    "./manifest.json"
];

// Install the new version and cache the app shell.
self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
    );

    self.skipWaiting();
});

// Remove older app caches and activate this version.
self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key.startsWith("our-expenses-") &&
                                   key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        )
    );

    self.clients.claim();
});

// Prefer fresh files when online; use the cache when offline.
self.addEventListener("fetch", event => {
    const request = event.request;

    if (request.method !== "GET") {
        return;
    }

    const url = new URL(request.url);

    // Never intercept Supabase or external CDN requests.
    if (url.origin !== self.location.origin) {
        return;
    }

    // Only handle normal web pages and app resources.
    if (
        request.destination === "document" ||
        ["style", "script", "image", "font"].includes(request.destination) ||
        url.pathname.endsWith(".json")
    ) {
        event.respondWith(
            fetch(request)
                .then(response => {
                    if (response.ok) {
                        const copy = response.clone();

                        caches.open(CACHE_NAME).then(cache =>
                            cache.put(request, copy)
                        );
                    }

                    return response;
                })
                .catch(async () => {
                    const cached = await caches.match(request);

                    if (cached) {
                        return cached;
                    }

                    // If offline navigation has no exact cache match,
                    // fall back to the cached app entry page.
                    if (request.mode === "navigate") {
                        const appPage = await caches.match("./index.html");

                        if (appPage) {
                            return appPage;
                        }
                    }

                    return new Response("You are offline and this file is not cached.", {
                        status: 503,
                        statusText: "Offline"
                    });
                })
        );
    }
});
