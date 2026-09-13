// OpenF1 `drs` status codes. 0/1 closed, 8 eligible (within a second of the
// car ahead in a detection zone), 10/12/14 open.

/** DRS status values that indicate the flap is open. */
export const DRS_OPEN = [10, 12, 14];

/** DRS status value indicating eligibility (within 1 s). */
export const DRS_ELIGIBLE = 8;
