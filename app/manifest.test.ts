import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { config } from "../proxy";
import manifest from "./manifest";

describe("home-screen install manifest", () => {
  const m = manifest();

  it("opens full-screen at the owner's Overview", () => {
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/dashboard/overview");
  });

  it("has the icons phones require, and each file exists", () => {
    const sizes = (m.icons ?? []).map((i) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect((m.icons ?? []).some((i) => i.purpose === "maskable")).toBe(true);
    for (const icon of m.icons ?? []) {
      expect(existsSync(path.join(process.cwd(), "public", icon.src)), icon.src).toBe(true);
    }
  });

  it("lets the manifest and icons load before sign-in (they bypass the sign-in redirect)", () => {
    const pattern = new RegExp(`^${config.matcher[0]}$`);
    expect(pattern.test("/manifest.webmanifest")).toBe(false);
    expect(pattern.test("/pwa/icon-192.png")).toBe(false);
    expect(pattern.test("/dashboard/overview")).toBe(true);
    expect(pattern.test("/api/leads")).toBe(true);
  });
});
