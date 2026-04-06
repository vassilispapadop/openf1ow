export interface ClipEvent {
  distance: number;
  endDistance: number;
  speedDrop: number;
  duration: number;
  startSpeed: number;
  endSpeed: number;
  throttle: number;
}

export const THROTTLE_THRESHOLD = 100;
export const MIN_SPEED_DROP = 2;
const MIN_SPEED = 150;
const MIN_ZONE_SAMPLES = 2;

/**
 * Detect super clipping zones: contiguous regions where throttle=100%,
 * brake=off, speed >= 150 km/h, and speed is NOT increasing.
 *
 * Returns zones with their full distance extent so the overlay covers
 * the entire clipping region, not just individual drop samples.
 */
export function detectClipping(telemetry: any[]): ClipEvent[] {
  if (telemetry.length < 3) return [];

  const zones: ClipEvent[] = [];
  let zoneStart = -1;
  let peakSpeed = 0;
  let lowestSpeed = Infinity;

  for (let i = 1; i < telemetry.length; i++) {
    const prev = telemetry[i - 1];
    const curr = telemetry[i];
    const fullThrottle = curr.throttle >= THROTTLE_THRESHOLD && prev.throttle >= THROTTLE_THRESHOLD;
    const noBrake = !curr.brake && !prev.brake;
    const highSpeed = curr.speed >= MIN_SPEED;
    // Speed is not gaining (dropping or flat)
    const notGaining = curr.speed <= prev.speed + 0.5;

    if (fullThrottle && noBrake && highSpeed && notGaining) {
      if (zoneStart === -1) {
        // Start a new zone
        zoneStart = i - 1;
        peakSpeed = prev.speed;
        lowestSpeed = curr.speed;
      } else {
        // Extend zone
        if (prev.speed > peakSpeed) peakSpeed = prev.speed;
        if (curr.speed < lowestSpeed) lowestSpeed = curr.speed;
      }
    } else if (zoneStart !== -1) {
      // End of zone
      const startPt = telemetry[zoneStart];
      const endPt = telemetry[i - 1];
      const drop = peakSpeed - lowestSpeed;
      const samples = i - zoneStart;

      if (drop >= MIN_SPEED_DROP && samples >= MIN_ZONE_SAMPLES) {
        zones.push({
          distance: startPt.distance || 0,
          endDistance: endPt.distance || startPt.distance || 0,
          speedDrop: drop,
          duration: new Date(endPt.date).getTime() - new Date(startPt.date).getTime(),
          startSpeed: peakSpeed,
          endSpeed: lowestSpeed,
          throttle: 100,
        });
      }
      zoneStart = -1;
      peakSpeed = 0;
      lowestSpeed = Infinity;
    }
  }

  // Close any open zone at end of lap
  if (zoneStart !== -1) {
    const startPt = telemetry[zoneStart];
    const endPt = telemetry[telemetry.length - 1];
    const drop = peakSpeed - lowestSpeed;
    if (drop >= MIN_SPEED_DROP && (telemetry.length - zoneStart) >= MIN_ZONE_SAMPLES) {
      zones.push({
        distance: startPt.distance || 0,
        endDistance: endPt.distance || startPt.distance || 0,
        speedDrop: drop,
        duration: new Date(endPt.date).getTime() - new Date(startPt.date).getTime(),
        startSpeed: peakSpeed,
        endSpeed: lowestSpeed,
        throttle: 100,
      });
    }
  }

  return zones;
}
