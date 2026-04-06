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

export interface DrsZone {
  start: number;
  end: number;
}

export const THROTTLE_THRESHOLD = 100;
export const MIN_SPEED_DROP = 2;
const MIN_SPEED = 150;
const MIN_ZONE_SAMPLES = 2;
const RECOVERY_TOLERANCE = 2; // allow brief speed gains up to this (km/h) without breaking zone
const ZONE_BUFFER = 200; // meters buffer around DRS activation points
const ZONE_MERGE_GAP = 300; // merge DRS zones within this distance of each other

/**
 * Build DRS / Straight Mode zone map from aggregate telemetry.
 * Scans ALL provided telemetry arrays, finds distances where any driver
 * had DRS eligible or open, and merges into distance ranges with buffer.
 * Returns empty array if no DRS data found (caller should skip filtering).
 */
export function buildDrsZones(allTelemetry: any[][]): DrsZone[] {
  const activeDists: number[] = [];
  for (const tel of allTelemetry) {
    for (const s of tel) {
      if (s.drs === DRS_ELIGIBLE || DRS_OPEN.includes(s.drs)) {
        if (s.distance) activeDists.push(s.distance);
      }
    }
  }
  if (!activeDists.length) return [];

  activeDists.sort((a, b) => a - b);

  const zones: DrsZone[] = [];
  let start = activeDists[0] - ZONE_BUFFER;
  let end = activeDists[0] + ZONE_BUFFER;

  for (let i = 1; i < activeDists.length; i++) {
    if (activeDists[i] - ZONE_BUFFER <= end + ZONE_MERGE_GAP) {
      end = activeDists[i] + ZONE_BUFFER;
    } else {
      zones.push({ start: Math.max(0, start), end });
      start = activeDists[i] - ZONE_BUFFER;
      end = activeDists[i] + ZONE_BUFFER;
    }
  }
  zones.push({ start: Math.max(0, start), end });

  return zones;
}

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
 * When drsZones is provided and non-empty, only events overlapping those
 * zones are kept. When empty or omitted, no DRS filtering is applied.
 *
 * speedDrop = startSpeed - endSpeed (net speed lost across the zone).
 */
export function detectClipping(telemetry: any[], drsZones?: DrsZone[]): ClipEvent[] {
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
      closeZone(zones, telemetry, zoneStart, i - 1, drsZones);
      zoneStart = -1;
    }
  }

  // Close any open zone at end of telemetry
  if (zoneStart !== -1) {
    closeZone(zones, telemetry, zoneStart, telemetry.length - 1, drsZones);
  }

  return zones;
}

function closeZone(zones: ClipEvent[], telemetry: any[], start: number, end: number, drsZones?: DrsZone[]): void {
  if (end - start < MIN_ZONE_SAMPLES) return;
  const startPt = telemetry[start];
  const endPt = telemetry[end];
  const drop = Math.round((startPt.speed - endPt.speed) * 10) / 10;
  if (drop < MIN_SPEED_DROP) return;

  const evtStart = startPt.distance || 0;
  const evtEnd = endPt.distance || evtStart;

  // If DRS zones provided and non-empty, only keep events overlapping them
  if (drsZones && drsZones.length > 0) {
    const inZone = drsZones.some(z => evtStart <= z.end && evtEnd >= z.start);
    if (!inZone) return;
  }

  zones.push({
    distance: evtStart,
    endDistance: evtEnd,
    speedDrop: drop,
    duration: new Date(endPt.date).getTime() - new Date(startPt.date).getTime(),
    startSpeed: startPt.speed,
    endSpeed: endPt.speed,
    throttle: 100,
  });
}
