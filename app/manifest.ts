import type { MetadataRoute } from "next";

/**
 * Lets the owner add the dashboard to a phone's home screen so it opens
 * full-screen like an app. Deliberately NOT a service worker / offline app:
 * this dashboard shows live, private customer information, and nothing
 * private should ever be stored on the phone for offline use.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HURKL",
    short_name: "HURKL",
    description: "Your business at a glance: leads, bookings, calendar, and Mason.",
    start_url: "/dashboard/overview",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0d0c0a",
    theme_color: "#0d0c0a",
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/pwa/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
