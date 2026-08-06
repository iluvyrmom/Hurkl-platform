import type { MapsProvider } from "./types";
import { MockMapsProvider } from "./mock-provider";
import { GoogleMapsProvider } from "./google-maps-provider";

export type { MapsProvider, Coordinates, RouteEstimate } from "./types";

export function getMapsProvider(): MapsProvider {
  if (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
    return new GoogleMapsProvider();
  }
  return new MockMapsProvider();
}
