import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n, { currentLanguage } from '../i18n';

/**
 * Error boundary: prevents the silent white page.
 *
 * Without it, any render error unmounts the whole React tree and the user sees a blank page with no
 * word of explanation, identical to the blank page of a bundle that failed to load, so neither the
 * reporter nor the person diagnosing can tell two causes with different fixes apart.
 *
 * The aim is to name the failure, not hide it: a readable message and a button out of it. The error
 * details stay in the browser console for the developer, not in front of the merchant.
 *
 * React catches render errors only. Errors in an event handler or an unhandled promise do not reach
 * here; those are handled where they happen.
 *
 * The text uses `i18n.t` directly (no hook): the i18n module loads before React, so the message is
 * available even when the tree below has crashed.
 */
interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The console on purpose: there is no error collection service yet, and swallowing it silently
    // would leave a failure with no trace.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        dir={currentLanguage() === 'en' ? 'ltr' : 'rtl'}
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          textAlign: 'center',
          fontFamily: 'inherit',
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }} aria-hidden="true">
            ⚠️
          </div>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>{i18n.t('common.error_boundary.title')}</h1>
          <p style={{ margin: '0 0 20px', lineHeight: 1.7, color: 'var(--muted, #6b7280)' }}>
            {i18n.t('common.error_boundary.body')}
          </p>
          {/* A full reload, not setState: the state that caused the crash may itself be broken, and
              rendering on it again would bring the page down again. */}
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            {i18n.t('common.error_boundary.reload')}
          </button>
        </div>
      </div>
    );
  }
}
