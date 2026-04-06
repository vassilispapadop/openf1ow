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
 * (not just flat — must have measurable deceleration).
 *
 * The speedDrop reported is the sum of individual sample-to-sample
 * drops divided by the number of dropping samples, giving the
 * average per-sample loss. This avoids the issue of reporting the
 * entire peak-to-trough range as one giant number.
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
      // End of zone — compute stats from individual drops
      const startPt = telemetry[zoneStart];
      const endPt = telemetry[i - 1];
      const totalDrop = dropSamples.reduce((s, d) => s + d, 0);
      const avgDrop = totalDrop / dropSamples.length;

      if (totalDrop >= MIN_SPEED_DROP && dropSamples.length >= MIN_ZONE_SAMPLES && totalDrop <= MAX_SINGLE_DROP) {
        zones.push({
          distance: startPt.distance || 0,
          endDistance: endPt.distance || startPt.distance || 0,
          speedDrop: Math.round(totalDrop * 10) / 10,
          duration: new Date(endPt.date).getTime() - new Date(startPt.date).getTime(),
          startSpeed: telemetry[zoneStart].speed,
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
    const totalDrop = dropSamples.reduce((s, d) => s + d, 0);
    if (totalDrop >= MIN_SPEED_DROP && totalDrop <= MAX_SINGLE_DROP) {
      zones.push({
        distance: startPt.distance || 0,
        endDistance: endPt.distance || startPt.distance || 0,
        speedDrop: Math.round(totalDrop * 10) / 10,
        duration: new Date(endPt.date).getTime() - new Date(startPt.date).getTime(),
        startSpeed: telemetry[zoneStart].speed,
        endSpeed: endPt.speed,
        throttle: 100,
      });
    }
  }

  return zones;
}
