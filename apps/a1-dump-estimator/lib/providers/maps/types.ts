export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface RouteEstimate {
  distanceMiles: number;
  driveTimeMinutes: number;
}

export interface GeocodeResult {
  coordinates: Coordinates;
  formattedAddress: string;
}

/**
 * Abstraction over routing/distance, address geocoding, and "launch
 * navigation" — swappable so Google Maps can be replaced (Mapbox, HERE,
 * etc.) without touching the facility-selection engine.
 */
export interface MapsProvider {
  readonly name: string;
  estimateRoute(origin: Coordinates, destination: Coordinates): Promise<RouteEstimate>;
  /**
   * Resolves a typed address to coordinates. Returns null (never a guessed
   * coordinate) when the provider can't geocode — e.g. the mock provider
   * always returns null since GPS capture is the only coordinate source
   * that works without a real provider configured.
   */
  geocodeAddress(address: string): Promise<GeocodeResult | null>;
  /** A URL that opens turn-by-turn navigation in the user's map app — no API key required for this deep-link form. */
  getDirectionsUrl(origin: Coordinates, destination: Coordinates): string;
}
