import { MSG } from '../i18n/messages';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordPolicyViolation } from './password-policy';

describe('passwordPolicyViolation', () => {
  it('accepts twelve characters and refuses eleven', () => {
    expect(passwordPolicyViolation('Abcdefgh123!')).toBeNull();
    expect(passwordPolicyViolation('Abcdefgh12!')).toContain(MSG.password_too_short);
    expect(PASSWORD_MIN_LENGTH).toBe(12);
  });

  it('accepts 128 characters and refuses 129', () => {
    expect(passwordPolicyViolation(`Ab1!${'xy'.repeat(62)}`)).toBeNull();
    expect(passwordPolicyViolation(`Ab1!${'xy'.repeat(62)}z`)).toContain(MSG.password_too_long);
    expect(PASSWORD_MAX_LENGTH).toBe(128);
  });

  it('counts characters, not UTF-16 units', () => {
    expect(passwordPolicyViolation('كلمة-سر-طويلة')).toBeNull();
    expect(passwordPolicyViolation('\u{1F600}'.repeat(6) + 'abcde')).toContain(MSG.password_too_short);
  });

  it('refuses one repeated character but not two', () => {
    expect(passwordPolicyViolation('a'.repeat(20))).toBe(MSG.password_single_character);
    expect(passwordPolicyViolation('ab'.repeat(10))).toBeNull();
  });

  it('refuses the username in any letter case', () => {
    expect(passwordPolicyViolation('my-SALEM-shop-2026', { username: 'Salem' })).toBe(MSG.password_contains_username);
    expect(passwordPolicyViolation('my-other-shop-2026', { username: 'Salem' })).toBeNull();
  });

  it('refuses the e-mail local part, and ignores names under three letters', () => {
    expect(passwordPolicyViolation('noura.store-2026', { email: 'noura.store@example.com' })).toBe(MSG.password_contains_email);
    expect(passwordPolicyViolation('a-quiet-river-2026', { email: 'a@example.com', username: 'ab' })).toBeNull();
  });
});
