/* ----------------------------------------------------------------------
   Trevora's service worker.

   Hand-written rather than generated. `vite-plugin-pwa` is the usual answer
   and it is a good one, but it brings Workbox with it, and what this app needs
   is about forty lines: keep the shell available offline, never touch the API.

   WHAT IT DOES NOT DO, ON PURPOSE

   It does not cache anything from the API or from Supabase. A mechanic reading
   a service history needs the record as it is now, not as it was on their last
   visit, and a stale odometer reading is worse than an error message. Only
   Trevora's own static files are cached; everything else goes to the network
   untouched and this worker never sees the response.

   It is also registered only in a production build — Vite's dev server serves
   modules that change on every keystroke, and caching those means editing a
   file and watching the old one render.

   IF THIS EVER NEEDS TO GO

   A service worker outlives the deploy that installed it. Deleting this file
   does NOT remove it from anyone's browser — the browser keeps running the
   copy it already has, and a 404 on the script is not treated as "uninstall".
   Removing the registration line in main.jsx does not help either: it only
   stops *new* visitors getting one.

   The way out is to replace the contents of this file — same path, same name —
   with a worker that removes itself, and deploy that:

     self.addEventListener('install', () => self.skipWaiting());
     self.addEventListener('activate', (event) => {
       event.waitUntil(
         caches.keys()
           .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
           .then(() => self.registration.unregister())
           .then(() => self.clients.matchAll())
           .then((clients) => clients.forEach((c) => c.navigate(c.url))),
       );
     });

   Browsers check for a new version of this script on navigation, so everyone
   picks that up on their next visit and is clean afterwards. This is the one
   piece of knowledge worth keeping with the file, because the day it is needed
   is the day the site is broken for people you cannot contact.
   ---------------------------------------------------------------------- */

const VERSION = 'trevora-v1';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;

/* The document that boots the app. Everything else is reachable from it, and
   React Router owns the paths, so one entry covers every route. */
const SHELL_URL = '/index.html';

/* NO `skipWaiting()` HERE, DELIBERATELY.
 *
 * It is the usual thing to write and it is the one way this file can break a
 * page that was working. Taking over immediately means a new worker activates
 * under tabs that are already open, and `activate` below then deletes the
 * previous asset cache. That tab is still running the previous build: the next
 * lazy-loaded route asks for a chunk whose name Vite changed on this deploy,
 * the cache that held it is gone, and the network no longer has it either. A
 * reader who did nothing but leave a tab open gets a broken screen.
 *
 * Waiting instead means a new worker sits idle until every tab for this origin
 * is closed, which is the browser's default and is dull in exactly the right
 * way. The cost is that worker changes land one session late. Since navigations
 * are network-first, the HTML and assets are already current regardless — only
 * this file's own logic lags, and it changes about never.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.add(SHELL_URL))
      /* An install that fails on a bad connection should not leave the old
         worker wedged; the next visit tries again. */
      .catch(() => undefined),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

/* Lets the page tell a waiting worker to take over immediately, which is how
   the "a new version is ready" reload works without a second refresh. */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only GET. A POST is someone saving something, and it must reach the server.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Another origin — Supabase, Google Fonts, the API. Not ours to cache.
  if (url.origin !== self.location.origin) return;

  // Our own API, if it is ever served from this origin. Same rule.
  if (url.pathname.startsWith('/api/')) return;

  /* Navigations: network first, because a served-from-cache index.html means
     the app boots at the version it was last time. The cache is the fallback
     for a phone with no signal, which is the case this exists for. */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put(SHELL_URL, copy));
          return response;
        })
        .catch(() => caches.match(SHELL_URL).then((cached) => cached || Response.error())),
    );
    return;
  }

  /* Built assets: cache first. Vite fingerprints these filenames, so a given
     URL's contents can never change — a new build produces a new name. That is
     what makes serving from cache safe here and unsafe for the document above. */
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(ASSETS).then((cache) => cache.put(request, copy));
        }
        return response;
      })),
    );
  }

  /* Everything else on this origin — the icons, the landing images — falls
     through to the network with no interference. */
});
