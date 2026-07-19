import { VestingScheduleEntity } from './vesting.entity';

/**
 * Mirrors the frontend's vestPct helper (src/app/vesting/page.tsx), but
 * returns a token amount instead of a percentage: nothing is vested before
 * the cliff, it vests linearly between the cliff and the end date, and it's
 * fully vested from the end date onward.
 *
 * A revoked schedule stops vesting any further — it's frozen at whatever has
 * already been claimed.
 */
export function vestedAmount(schedule: VestingScheduleEntity, now: number): bigint {
  if (schedule.revoked) return schedule.claimed;
  if (now < schedule.cliffTime) return 0n;
  if (now >= schedule.endTime) return schedule.totalAmount;
  if (schedule.endTime === schedule.cliffTime) return schedule.totalAmount;

  const elapsed  = BigInt(now - schedule.cliffTime);
  const duration = BigInt(schedule.endTime - schedule.cliffTime);
  return (schedule.totalAmount * elapsed) / duration;
}

/** Vested but not yet claimed — never negative. */
export function claimableAmount(schedule: VestingScheduleEntity, now: number): bigint {
  const vested = vestedAmount(schedule, now);
  const claimable = vested - schedule.claimed;
  return claimable > 0n ? claimable : 0n;
}
