export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface RouteEstimate {
  distanceMiles: number;
  driveTimeMinutes: number;
}

/**
 * Abstraction over routing/distance and "launch navigation" — swappable so
 * Google Maps can be replaced (Mapbox, HERE, etc.) without touching the
 * facility-selection engine.
 */
export interface MapsProvider {
  readonly name: string;
  estimateRoute(origin: Coordinates, destination: Coordinates): Promise<RouteEstimate>;
  /** A URL that opens turn-by-turn navigation in the user's map app — no API key required for this deep-link form. */
  getDirectionsUrl(origin: Coordinates, destination: Coordinates): string;
}
