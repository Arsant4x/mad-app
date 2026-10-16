import { dayStartOf, zoneOffsetMin } from './wall-clock.util';

describe('zoneOffsetMin reads the offset from the time zone itself', () => {
  // 22:30 UTC on the last day of October is 01:30 on 1 November three hours east of UTC.
  const lateNight = new Date('2026-10-31T22:30:00.000Z');

  it('gives a zone three hours east of UTC +180, so the day after midnight is the new day and month', () => {
    expect(zoneOffsetMin(lateNight, 'Asia/Riyadh')).toBe(180);
    expect(dayStartOf(lateNight, zoneOffsetMin(lateNight, 'Asia/Riyadh')).toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  it('gives UTC zero, so the same instant stays on the UTC day', () => {
    expect(zoneOffsetMin(lateNight, 'UTC')).toBe(0);
    expect(dayStartOf(lateNight, zoneOffsetMin(lateNight, 'UTC')).toISOString()).toBe('2026-10-31T00:00:00.000Z');
  });

  it('follows a zone west of UTC and its daylight saving change', () => {
    expect(zoneOffsetMin(new Date('2026-07-01T12:00:00.000Z'), 'America/New_York')).toBe(-240);
    expect(zoneOffsetMin(new Date('2026-12-01T12:00:00.000Z'), 'America/New_York')).toBe(-300);
    // 02:00 UTC on 1 July is still 30 June in New York.
    const early = new Date('2026-07-01T02:00:00.000Z');
    expect(dayStartOf(early, zoneOffsetMin(early, 'America/New_York')).toISOString()).toBe('2026-06-30T00:00:00.000Z');
  });

  it('keeps half hour zones and ignores the milliseconds of the instant', () => {
    expect(zoneOffsetMin(new Date('2026-10-31T22:30:00.999Z'), 'Asia/Kolkata')).toBe(330);
  });
});
