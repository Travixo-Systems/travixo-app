import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { ExpirationPlugin, NetworkFirst, Serwist } from 'serwist'

declare global {
  interface ServiceWorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // GET /api/assets — network-first, fallback to cache, keyed by full URL (includes org_id query param)
    {
      matcher: ({ url, request }) =>
        url.pathname.startsWith('/api/assets') && request.method === 'GET',
      handler: new NetworkFirst({
        cacheName: 'api-assets',
        networkTimeoutSeconds: 10,
        plugins: [
          new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 }),
        ],
      }),
      method: 'GET',
    },
    // GET /api/scan/[qr_code] — network-first, fallback to cache
    {
      matcher: ({ url, request }) =>
        url.pathname.startsWith('/api/scan/') && request.method === 'GET',
      handler: new NetworkFirst({
        cacheName: 'api-scan',
        networkTimeoutSeconds: 10,
        plugins: [
          new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 24 * 60 * 60 }),
        ],
      }),
      method: 'GET',
    },
    // Static Next.js assets + everything else — from @serwist/next defaults (cache-first for static)
    ...defaultCache,
  ],
})

serwist.addEventListeners()
