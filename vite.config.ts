import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "合规助手",
        short_name: "合规助手",
        description: "个人合规流程指引工具",
        theme_color: "#173b35",
        display: "standalone",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any"
          }
        ]
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/(?:[^/]+\.)?[^/]*\.aliyuncs\.com\/.*\.json(?:\?.*)?$/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "oss-json",
              networkTimeoutSeconds: 10,
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 100, maxAgeSeconds: 24 * 60 * 60 }
            }
          },
          {
            urlPattern: /^https?:\/\/(?:[^/]+\.)?[^/]*\.aliyuncs\.com\/.*\/attachments\/.*$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "oss-attachments",
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 50, maxAgeSeconds: 30 * 24 * 60 * 60 }
            }
          }
        ],
        navigateFallbackDenylist: [/^\/(?:templates|tasks)(?:\/|$)/]
      }
    })
  ]
});
