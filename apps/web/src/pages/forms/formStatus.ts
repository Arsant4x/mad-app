import type { FormInstance } from '../../api/forms';
import i18n from '../../i18n';

/**
 * A table of code to label whose labels are read through translation on access,
 * so a language switch shows the new text. Unknown codes stay undefined, letting
 * callers fall back to the raw code.
 */
function labels(prefix: string, codes: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const code of codes) {
    Object.defineProperty(out, code, { enumerable: true, get: () => i18n.t(`forms.${prefix}.${code.toLowerCase()}`) });
  }
  return out;
}

const statusEntry = (code: FormInstance['status'], badge: string) => ({
  badge,
  get label() {
    return i18n.t(`forms.status.${code.toLowerCase()}`);
  },
});

/**
 * Form states in the signing flow: a draft is filled, then awaits the party's
 * signature after staff sign and send, then is sealed when the party signs; or it
 * is objected to (a revised copy follows), expires without consent, or ends in a
 * standing dispute when an objection remains at the deadline.
 */
export const FORM_STATUS: Record<FormInstance['status'], { label: string; badge: string }> = {
  DRAFT: statusEntry('DRAFT', 'draft'),
  AWAITING_SIGNATURE: statusEntry('AWAITING_SIGNATURE', 'due'),
  OBJECTED: statusEntry('OBJECTED', 'overdue'),
  SEALED: statusEntry('SEALED', 'paid'),
  EXPIRED: statusEntry('EXPIRED', 'overdue'),
  DISPUTED: statusEntry('DISPUTED', 'overdue'),
};

export const statusOf = (s: FormInstance['status']) => FORM_STATUS[s] ?? { label: s, badge: 'due' };

/** Signature level named by what was done, not by its code. */
export const SIGNATURE_LEVEL: Record<string, string> = labels('signature_level', [
  'DRAWN_STAFF_SESSION',
  'DRAWN_OTP',
  'DRAWN_NAFATH',
  'PAPER_WITNESSED',
]);

export const SIGNER_ROLE: Record<string, string> = labels('signer_role', ['STAFF', 'COUNTERPARTY', 'REPRESENTATIVE', 'SUBSTITUTE']);

export const SIGNATURE_CHANNEL: Record<string, string> = labels('signature_channel', ['LINK', 'STAFF_DEVICE', 'PAPER']);

export const AUTHORITY_TYPE: Record<string, string> = labels('authority_type', ['CR_MANAGER', 'NAJIZ_POA']);

/** Form log events by name. */
export const EVENT_LABEL: Record<string, string> = labels('event', [
  'STAFF_SIGNED',
  'LINK_SENT',
  'LINK_SEND_FAILED',
  'LINK_OPENED',
  'OTP_SENT',
  'OTP_SEND_FAILED',
  'OTP_FAILED',
  'OTP_LOCKED',
  'LOGIN',
  'NAFATH_STARTED',
  'NAFATH_REJECTED',
  'SIGNED',
  'OBJECTED',
  'REVISED',
  'SEALED',
  'FINAL_SENT',
  'FINAL_SEND_FAILED',
  'EXPIRED',
  'DISPUTED',
  'REMINDER_MID',
  'REMINDER_LAST',
  'PAPER_UPLOADED',
  'REPRESENTATIVE_DESIGNATED',
  'DEVICE_LINK',
  'SUBSTITUTE_REQUESTED',
  'SUBSTITUTE_APPROVED',
  'SUBSTITUTE_REJECTED',
]);
