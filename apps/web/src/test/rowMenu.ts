import { fireEvent, screen } from '@testing-library/react';
import i18n from '../i18n';

/** The labels of the row menu at `index`, opened; empty when the row has no menu (no action left). */
export function rowMenuLabels(index = 0): string[] {
  const menus = screen.queryAllByTitle(i18n.t('common.row_menu.options'));
  const menu = menus[index];
  if (!menu) return [];
  fireEvent.click(menu);
  const labels = [...document.querySelectorAll('.action-menu button')].map((b) => (b.textContent ?? '').trim());
  fireEvent.click(menu);
  return labels;
}

/** Whether a button with exactly this text is on the screen. */
export function hasButton(text: string): boolean {
  return screen.queryAllByRole('button').some((b) => (b.textContent ?? '').trim() === text);
}
