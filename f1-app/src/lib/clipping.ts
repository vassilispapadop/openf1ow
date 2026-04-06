export interface ClipEvent {
  distance: number;
  endDistance: number;
  speedDrop: number;
  duration: number;
  startSpeed: number;
  endSpeed: number;
  throttle: number;
  color?: string;
}

export const THROTTLE_THRESHOLD = 100;
export const MIN_SPEED_DROP = 2;
const MIN_SPEED = 150;
const MIN_ZONE_SAMPLES = 2;
const MAX_SINGLE_DROP = 25; // max plausible per-zone drop — real clipping is 2-20 km/h

/**
 * Detect super clipping zones: contiguous regions where throttle=100%,
 * brake=off, speed >= 150 km/h, and speed is actively DROPPING
 * (>= 1 km/h per sample).
 *
 * Zone ends when throttle lifts, brake applied, or speed stops dropping.
 * speedDrop = startSpeed - endSpeed (total speed lost across the zone).
 * Capped at 2-25 km/h to filter noise and non-clipping deceleration.
 */
export function detectClipping(telemetry: any[]): ClipEvent[] {
  if (telemetry.length < 3) return [];

  const zones: ClipEvent[] = [];
  let zoneStart = -1;
  let dropSamples: number[] = [];

  for (let i = 1; i < telemetry.length; i++) {
    const prev = telemetry[i - 1];
    const curr = telemetry[i];
    const fullThrottle = curr.throttle >= THROTTLE_THRESHOLD && prev.throttle >= THROTTLE_THRESHOLD;
    const noBrake = !curr.brake && !prev.brake;
    const highSpeed = curr.speed >= MIN_SPEED && prev.speed >= MIN_SPEED;
    const speedDrop = prev.speed - curr.speed;
    // Must be actively losing speed (not just flat)
    const dropping = speedDrop >= 1;

    if (fullThrottle && noBrake && highSpeed && dropping) {
      if (zoneStart === -1) {
        zoneStart = i - 1;
        dropSamples = [speedDrop];
      } else {
        dropSamples.push(speedDrop);
      }
    } else if (zoneStart !== -1) {
      // End of zone — speed drop is start-to-end difference
      const startPt = telemetry[zoneStart];
      const endPt = telemetry[i - 1];
      const drop = Math.round((startPt.speed - endPt.speed) * 10) / 10;

      if (drop >= MIN_SPEED_DROP && dropSamples.length >= MIN_ZONE_SAMPLES && drop <= MAX_SINGLE_DROP) {
        zones.push({
          distance: startPt.distance || 0,
          endDistance: endPt.distance || startPt.distance || 0,
          speedDrop: drop,
          duration: new Date(endPt.date).getTime() - new Date(startPt.date).getTime(),
          startSpeed: startPt.speed,
          endSpeed: endPt.speed,
          throttle: 100,
        });
      }
      zoneStart = -1;
      dropSamples = [];
    }
  }

  // Close any open zone at end of lap
  if (zoneStart !== -1 && dropSamples.length >= MIN_ZONE_SAMPLES) {
    const startPt = telemetry[zoneStart];
    const endPt = telemetry[telemetry.length - 1];
    const drop = Math.round((startPt.speed - endPt.speed) * 10) / 10;
    if (drop >= MIN_SPEED_DROP && drop <= MAX_SINGLE_DROP) {
      zones.push({
        distance: startPt.distance || 0,
        endDistance: endPt.distance || startPt.distance || 0,
        speedDrop: drop,
        duration: new Date(endPt.date).getTime() - new Date(startPt.date).getTime(),
        startSpeed: startPt.speed,
        endSpeed: endPt.speed,
        throttle: 100,
      });
    }
  }

  return zones;
}
