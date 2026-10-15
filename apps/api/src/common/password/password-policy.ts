import { BadRequestException } from '@nestjs/common';
import { formatMessage, MSG } from '../i18n/messages';

/** OWASP ASVS V2.1.1 and V2.1.2. Applies to passwords being set, never to signing in with a stored one. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
/** Shorter names are not searched for: a one or two letter mailbox would rule out most passwords. */
const MIN_NAME_LENGTH = 3;

export interface PasswordContext {
  username?: string | null;
  email?: string | null;
}

/** The message key of the first rule a new password breaks, or null when it breaks none. */
export function passwordPolicyViolation(password: string, context: PasswordContext = {}): string | null {
  const characters = [...password];
  if (characters.length < PASSWORD_MIN_LENGTH) return formatMessage(MSG.password_too_short, { min: PASSWORD_MIN_LENGTH });
  if (characters.length > PASSWORD_MAX_LENGTH) return formatMessage(MSG.password_too_long, { max: PASSWORD_MAX_LENGTH });
  if (new Set(characters).size === 1) return MSG.password_single_character;
  const lower = password.toLowerCase();
  const contains = (name: string | undefined) => !!name && name.length >= MIN_NAME_LENGTH && lower.includes(name);
  if (contains(context.username?.trim().toLowerCase())) return MSG.password_contains_username;
  if (contains(context.email?.split('@')[0]?.trim().toLowerCase())) return MSG.password_contains_email;
  return null;
}

export function assertPasswordPolicy(password: string, context: PasswordContext = {}): void {
  const violation = passwordPolicyViolation(password, context);
  if (violation) throw new BadRequestException(violation);
}
