import { applyDecorators } from '@nestjs/common';
import { IsISO8601, Matches } from 'class-validator';

/**
 * A calendar date, optionally with a time and a zone. ISO 8601 alone also admits week, ordinal and basic forms
 * (`2026-W01`, `2026001`, `20260101`) that a JavaScript date cannot read.
 */
const READABLE_ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

/** A `from` or `to` list filter: a real calendar date (strict, so 2026-02-30 is refused), with an optional time. */
export function IsDateFilter(): PropertyDecorator {
  return applyDecorators(IsISO8601({ strict: true }), Matches(READABLE_ISO_DATE));
}

/** The upper bound of a `to` filter: a date alone includes the whole day, a date and time is that moment. */
export function dateFilterEnd(to: string): Date {
  return new Date(to.length === 10 ? `${to}T23:59:59.999Z` : to);
}
