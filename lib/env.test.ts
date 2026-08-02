import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { APP_ENVS, getClientEnv, getServerEnv } from "./env";

const ENV_KEYS = [
  "NEXT_PUBLIC_APP_ENV",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
  "ELEVENLABS_API_KEY",
  "DEEPGRAM_API_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TRIGGER_SECRET_KEY",
  "SENTRY_DSN",
  "RESEND_API_KEY",
] as const;

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

describe("getServerEnv", () => {
  it("throws a clear error when NEXT_PUBLIC_APP_ENV is missing", () => {
    expect(() => getServerEnv()).toThrowError(/NEXT_PUBLIC_APP_ENV is required/);
  });

  it("throws a clear error when NEXT_PUBLIC_APP_ENV is invalid", () => {
    process.env.NEXT_PUBLIC_APP_ENV = "production-ish";
    expect(() => getServerEnv()).toThrowError(/NEXT_PUBLIC_APP_ENV is required/);
  });

  it("returns a typed object when NEXT_PUBLIC_APP_ENV is valid", () => {
    process.env.NEXT_PUBLIC_APP_ENV = "local";
    const env = getServerEnv();
    expect(env.APP_ENV).toBe("local");
  });

  it("leaves future-phase server variables undefined when not set, without throwing", () => {
    process.env.NEXT_PUBLIC_APP_ENV = "local";
    const env = getServerEnv();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.ELEVENLABS_API_KEY).toBeUndefined();
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(env.TRIGGER_SECRET_KEY).toBeUndefined();
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it("passes through a future-phase server variable when it is set", () => {
    process.env.NEXT_PUBLIC_APP_ENV = "staging";
    process.env.ANTHROPIC_API_KEY = "test-placeholder-value";
    const env = getServerEnv();
    expect(env.ANTHROPIC_API_KEY).toBe("test-placeholder-value");
  });

  it("accepts every value in the canonical APP_ENVS list, including the CI placeholder 'test'", () => {
    expect(APP_ENVS).toContain("test");
    for (const value of APP_ENVS) {
      process.env.NEXT_PUBLIC_APP_ENV = value;
      expect(() => getServerEnv()).not.toThrow();
    }
  });

  it.each(["", "production-ish", "TEST", "Production", "prod", "0"])(
    "rejects invalid value %j",
    (value) => {
      process.env.NEXT_PUBLIC_APP_ENV = value;
      expect(() => getServerEnv()).toThrowError(/NEXT_PUBLIC_APP_ENV is required/);
    },
  );
});

describe("getClientEnv", () => {
  it("throws the same clear error when NEXT_PUBLIC_APP_ENV is missing", () => {
    expect(() => getClientEnv()).toThrowError(/NEXT_PUBLIC_APP_ENV is required/);
  });

  it("only exposes NEXT_PUBLIC_ prefixed values", () => {
    process.env.NEXT_PUBLIC_APP_ENV = "local";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "should-never-appear-here";
    const env = getClientEnv();
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://example.supabase.co");
    expect(Object.keys(env)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
