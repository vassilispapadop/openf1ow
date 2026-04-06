export interface ClipEvent {
  distance: number;
  speedDrop: number;
  duration: number;
  startSpeed: number;
  endSpeed: number;
  throttle: number;
}

export const THROTTLE_THRESHOLD = 100;
export const MIN_SPEED_DROP = 2;
const MAX_CLIP_DROP = 30;
const MIN_SPEED = 150;
const MAX_CLIP_DURATION = 3000;

export function detectClipping(telemetry: any[]): ClipEvent[] {
  const events: ClipEvent[] = [];

  for (let i = 1; i < telemetry.length; i++) {
    const prev = telemetry[i - 1];
    const curr = telemetry[i];

    if (curr.throttle < THROTTLE_THRESHOLD || prev.throttle < THROTTLE_THRESHOLD) continue;
    if (curr.brake || prev.brake) continue;
    if (prev.speed < MIN_SPEED) continue;

    const drop = prev.speed - curr.speed;
    if (drop < MIN_SPEED_DROP) continue;

    // Merge with previous event if consecutive (within ~200m)
    const lastEvt = events[events.length - 1];
    if (lastEvt && Math.abs((lastEvt.distance || 0) - (prev.distance || 0)) < 200) {
      const totalDrop = lastEvt.startSpeed - curr.speed;
      if (totalDrop <= MAX_CLIP_DROP) {
        lastEvt.endSpeed = curr.speed;
        lastEvt.speedDrop = totalDrop;
        lastEvt.duration = new Date(curr.date).getTime() - new Date(telemetry[0].date).getTime();
        continue;
      }
    }

    events.push({
      distance: prev.distance || 0,
      speedDrop: Math.min(drop, MAX_CLIP_DROP),
      duration: new Date(curr.date).getTime() - new Date(prev.date).getTime(),
      startSpeed: prev.speed,
      endSpeed: curr.speed,
      throttle: 100,
    });
  }

  return events.filter(e => e.speedDrop >= MIN_SPEED_DROP && e.speedDrop <= MAX_CLIP_DROP && e.duration <= MAX_CLIP_DURATION);
}
