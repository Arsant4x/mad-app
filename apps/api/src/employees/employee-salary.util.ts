import { decryptField, encryptField } from '../common/crypto/field-cipher.util';
import { moneyText } from '../common/money/text';

/** Where an encrypted salary belongs: copied to another row or field, it fails to decrypt. */
export const salaryAad = (companyId: string, employeeId: string) => `${companyId}|employees.baseSalary|${employeeId}`;

/** The salary as stored: its two decimal text, encrypted for its row. */
export function encryptSalary(companyId: string, employeeId: string, amount: number | string): string {
  const text = moneyText(amount);
  if (text === null) throw new TypeError('a salary to encrypt needs a value');
  return encryptField(text, salaryAad(companyId, employeeId));
}

/** The salary as read: its two decimal text, or null when none was entered. */
export function decryptSalary(companyId: string, employeeId: string, cipher: string | null): string | null {
  return cipher === null ? null : decryptField(cipher, salaryAad(companyId, employeeId));
}
