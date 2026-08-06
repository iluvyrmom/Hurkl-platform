import type { Coordinates, MapsProvider, RouteEstimate } from "./types";

const EARTH_RADIUS_MILES = 3958.8;
/** Rough local-roads average, used only as a straight-line-distance fallback. */
const ASSUMED_AVERAGE_SPEED_MPH = 28;
/** Straight-line distance underestimates real road distance; this factor approximates typical road-network detour. */
const ROAD_DETOUR_FACTOR = 1.3;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Haversine great-circle distance in miles. */
function haversineDistanceMiles(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_MILES * c;
}

/**
 * No-API-key fallback: straight-line distance adjusted by a road-detour
 * factor, and drive time from an assumed average speed. Deliberately
 * approximate — the UI must label this as an estimate, not live traffic
 * data, when this provider is active.
 */
export class MockMapsProvider implements MapsProvider {
  readonly name = "mock";

  async estimateRoute(origin: Coordinates, destination: Coordinates): Promise<RouteEstimate> {
    const straightLineMiles = haversineDistanceMiles(origin, destination);
    const distanceMiles = Math.round(straightLineMiles * ROAD_DETOUR_FACTOR * 10) / 10;
    const driveTimeMinutes = Math.round((distanceMiles / ASSUMED_AVERAGE_SPEED_MPH) * 60);
    return { distanceMiles, driveTimeMinutes };
  }

  getDirectionsUrl(origin: Coordinates, destination: Coordinates): string {
    const params = new URLSearchParams({
      api: "1",
      origin: `${origin.latitude},${origin.longitude}`,
      destination: `${destination.latitude},${destination.longitude}`,
      travelmode: "driving",
    });
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }
}
