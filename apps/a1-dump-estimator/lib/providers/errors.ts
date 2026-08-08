/**
 * Thrown by a "real" provider adapter when it's selected but its required
 * credentials aren't configured. Callers must surface this clearly rather
 * than silently falling back or fabricating a result — per the project's
 * "never claim untested/unconfigured work is working" discipline.
 */
export class ProviderNotConfiguredError extends Error {
  constructor(providerName: string, missingEnvVars: string[]) {
    super(
      `${providerName} is not configured. Missing: ${missingEnvVars.join(", ")}. ` +
        `Set these in .env.local, or leave unset to use the mock provider.`,
    );
    this.name = "ProviderNotConfiguredError";
  }
}
