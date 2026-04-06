import { DRS_OPEN, DRS_ELIGIBLE } from "./constants";

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
const RECOVERY_TOLERANCE = 2; // allow brief speed gains up to this (km/h) without breaking zone

/**
 * Detect super clipping zones: regions where the car loses speed despite
 * full throttle and no braking in a DRS / Straight Mode zone — indicates
 * energy harvesting (MGU-K), power delivery limits, or aero drag
 * exceeding available power.
 *
 * A zone starts when speed drops >= 1 km/h at full throttle, no brake,
 * and speed >= 150 km/h. It continues through brief flat spots or minor
 * recoveries (< 2 km/h gain per sample). Zone ends when throttle lifts,
 * brake is applied, or speed clearly recovers.
 *
 * Only zones where at least one sample shows DRS eligible or open are
 * kept — this restricts detection to Straight Mode / DRS zones.
 *
 * speedDrop = startSpeed - endSpeed (net speed lost across the zone).
 */
export function detectClipping(telemetry: any[]): ClipEvent[] {
  if (telemetry.length < 3) return [];

  const zones: ClipEvent[] = [];
  let zoneStart = -1;

  for (let i = 1; i < telemetry.length; i++) {
    const prev = telemetry[i - 1];
    const curr = telemetry[i];
    const fullThrottle = curr.throttle >= THROTTLE_THRESHOLD && prev.throttle >= THROTTLE_THRESHOLD;
    const noBrake = !curr.brake && !prev.brake;
    const speedDrop = prev.speed - curr.speed;

    if (zoneStart === -1) {
      // Not in a zone — start one when speed actively drops at high speed
      const highSpeed = curr.speed >= MIN_SPEED && prev.speed >= MIN_SPEED;
      if (fullThrottle && noBrake && highSpeed && speedDrop >= 1) {
        zoneStart = i - 1;
      }
    } else if (fullThrottle && noBrake && speedDrop >= -RECOVERY_TOLERANCE) {
      // Zone continues: still full throttle + no brake, speed not clearly recovering
    } else {
      // Zone ends: throttle lifted, brake applied, or speed clearly recovering
      closeZone(zones, telemetry, zoneStart, i - 1);
      zoneStart = -1;
    }
  }

  // Close any open zone at end of telemetry
  if (zoneStart !== -1) {
    closeZone(zones, telemetry, zoneStart, telemetry.length - 1);
  }

  return zones;
}

function closeZone(zones: ClipEvent[], telemetry: any[], start: number, end: number): void {
  if (end - start < MIN_ZONE_SAMPLES) return;
  const startPt = telemetry[start];
  const endPt = telemetry[end];
  const drop = Math.round((startPt.speed - endPt.speed) * 10) / 10;
  if (drop < MIN_SPEED_DROP) return;

  // Only keep zones that overlap with a DRS / Straight Mode zone
  let inDrsZone = false;
  for (let j = start; j <= end; j++) {
    const drs = telemetry[j].drs;
    if (drs === DRS_ELIGIBLE || DRS_OPEN.includes(drs)) {
      inDrsZone = true;
      break;
    }
  }
  if (!inDrsZone) return;

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
