import { describe, expect, it } from "vitest";
import {
  contentMatches,
  declaredPhotoType,
  friendlyError,
  IpLimiter,
  isSecretShaped,
  isUuid,
  publicMessage,
  sniffPhotoType,
} from "./job_rooms_core";

const bytes = (...b: number[]) => new Uint8Array(b);
const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const heic = (brand: string) => new Uint8Array([0, 0, 0, 24, ...ascii("ftyp"), ...ascii(brand)]);

describe("photo type checks", () => {
  it("accepts only JPG, PNG and HEIC/HEIF as declared types", () => {
    expect(declaredPhotoType("image/jpeg")).toBe("image/jpeg");
    expect(declaredPhotoType("image/JPG")).toBe("image/jpeg");
    expect(declaredPhotoType("image/png")).toBe("image/png");
    expect(declaredPhotoType("image/heic")).toBe("image/heic");
    expect(declaredPhotoType("image/heif")).toBe("image/heif");
    expect(declaredPhotoType("image/gif")).toBeNull();
    expect(declaredPhotoType("application/pdf", "x.jpg")).toBeNull();
    expect(declaredPhotoType("image/svg+xml")).toBeNull();
  });

  it("falls back to the file name only when the phone reports no type", () => {
    expect(declaredPhotoType("", "IMG_1234.HEIC")).toBe("image/heic");
    expect(declaredPhotoType("application/octet-stream", "photo.jpeg")).toBe("image/jpeg");
    expect(declaredPhotoType("", "notes.txt")).toBeNull();
  });

  it("reads the real type from the file's first bytes", () => {
    expect(sniffPhotoType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffPhotoType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffPhotoType(heic("heic"))).toBe("image/heic");
    expect(sniffPhotoType(heic("mif1"))).toBe("image/heic");
    expect(sniffPhotoType(ascii("%PDF-1.7 ......"))).toBeNull();
    expect(sniffPhotoType(ascii("<svg xmlns="))).toBeNull();
    expect(sniffPhotoType(heic("isom"))).toBeNull(); // an MP4 video, not a photo
    expect(sniffPhotoType(bytes())).toBeNull();
  });

  it("refuses a file whose contents don't match what it claims to be", () => {
    expect(contentMatches("image/jpeg", "image/jpeg")).toBe(true);
    expect(contentMatches("image/heif", "image/heic")).toBe(true);
    expect(contentMatches("image/png", "image/jpeg")).toBe(false);
    expect(contentMatches("image/jpeg", null)).toBe(false);
  });
});

describe("input shapes", () => {
  it("only accepts long random link tokens", () => {
    expect(isSecretShaped("a".repeat(43))).toBe(true);
    expect(isSecretShaped("abc")).toBe(false);
    expect(isSecretShaped("a".repeat(42) + "'")).toBe(false);
    expect(isSecretShaped(null)).toBe(false);
  });

  it("validates ids", () => {
    expect(isUuid("00000000-0000-0000-0000-00000000000a")).toBe(true);
    expect(isUuid("1; drop table")).toBe(false);
  });
});

describe("errors shown to people", () => {
  it("turns database codes into plain words without leaking internals", () => {
    expect(friendlyError(new Error("rate_limited")).status).toBe(429);
    expect(friendlyError("link_unavailable").message).toMatch(/turned off or has expired/);
    const unknown = friendlyError(new Error('relation "secret_table" does not exist'));
    expect(unknown).toEqual({
      status: 500,
      code: "server_error",
      message: "Something went wrong. Please try again.",
    });
  });
});

describe("messages sent to browsers", () => {
  it("never include the storage path, only a signed URL", () => {
    const out = publicMessage(
      {
        id: "m1",
        author_kind: "guest",
        author_name: "Sarah",
        body: null,
        photo_path: "company/room/m1",
        photo_mime: "image/jpeg",
        created_at: "2026-11-25T00:00:00Z",
        mine: true,
      },
      new Map([["company/room/m1", "https://signed.example/abc"]]),
    );
    expect(out.photo_url).toBe("https://signed.example/abc");
    expect(JSON.stringify(out)).not.toContain("company/room");
  });
});

describe("IP limiter", () => {
  it("blocks after the limit and resets after the window", () => {
    const l = new IpLimiter(2, 1000);
    expect(l.allow("ip", 0)).toBe(true);
    expect(l.allow("ip", 10)).toBe(true);
    expect(l.allow("ip", 20)).toBe(false);
    expect(l.allow("other", 20)).toBe(true);
    expect(l.allow("ip", 1001)).toBe(true);
  });
});
