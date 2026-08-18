import { ProviderNotConfiguredError } from "../errors";
import { MockMapsProvider } from "./mock-provider";
import type { Coordinates, GeocodeResult, MapsProvider, RouteEstimate } from "./types";

/**
 * Google Distance Matrix-backed implementation. Requires
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. Directions deep-links never need a key,
 * so getDirectionsUrl reuses the same logic as the mock provider.
 *
 * IMPORTANT: not executed against a live API key in this environment — see
 * the same caveat in openai-vision-provider.ts. Verify against current
 * Google Maps Platform docs and billing setup before relying on it.
 */
export class GoogleMapsProvider implements MapsProvider {
  readonly name = "google-maps";

  private readonly apiKey: string;
  private readonly fallback = new MockMapsProvider();

  constructor() {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      throw new ProviderNotConfiguredError("GoogleMapsProvider", [
        "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
      ]);
    }
    this.apiKey = apiKey;
  }

  async estimateRoute(origin: Coordinates, destination: Coordinates): Promise<RouteEstimate> {
    const params = new URLSearchParams({
      origins: `${origin.latitude},${origin.longitude}`,
      destinations: `${destination.latitude},${destination.longitude}`,
      units: "imperial",
      key: this.apiKey,
    });

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`,
    );
    if (!response.ok) {
      throw new Error(`Google Distance Matrix request failed (${response.status})`);
    }

    const payload = await response.json();
    const element = payload?.rows?.[0]?.elements?.[0];
    if (!element || element.status !== "OK") {
      // Degrade to the estimate-only fallback rather than failing the whole quote.
      return this.fallback.estimateRoute(origin, destination);
    }

    return {
      distanceMiles: Math.round((element.distance.value / 1609.34) * 10) / 10,
      driveTimeMinutes: Math.round(element.duration.value / 60),
    };
  }

  /**
   * Resolves a typed address via Google's Geocoding API. Returns null (not
   * a guessed coordinate) on a non-OK status, a zero-result response, or a
   * request failure — the caller (New Estimate form) falls back to
   * requiring GPS capture rather than silently using an unresolved address.
   */
  async geocodeAddress(address: string): Promise<GeocodeResult | null> {
    const params = new URLSearchParams({ address, key: this.apiKey });

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
    );
    if (!response.ok) {
      throw new Error(`Google Geocoding request failed (${response.status})`);
    }

    const payload = await response.json();
    const result = payload?.results?.[0];
    if (!result || payload.status !== "OK") {
      return null;
    }

    return {
      coordinates: {
        latitude: result.geometry.location.lat,
        longitude: result.geometry.location.lng,
      },
      formattedAddress: result.formatted_address,
    };
  }

  getDirectionsUrl(origin: Coordinates, destination: Coordinates): string {
    return this.fallback.getDirectionsUrl(origin, destination);
  }
}
