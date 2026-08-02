// Next.js's officially-supported startup hook (stable since Next.js 15, no
// config flag needed): register() runs once when a server instance starts,
// and must complete before the server accepts requests. We use it to fail
// fast and clearly if required environment variables are missing, instead
// of failing confusingly deep inside a feature the first time it's used.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getServerEnv, getClientEnv } = await import("./lib/env");
    getServerEnv();
    getClientEnv();
  }
}
