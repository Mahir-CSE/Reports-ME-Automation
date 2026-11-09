import { test, type Page } from '@playwright/test';

/**
 * Base for all page objects.
 * `this.step()` = test.step() + an on-screen banner in the browser showing the current step.
 */
export class BasePage {
  constructor(readonly page: Page) {}

  async step<T>(name: string, body: () => Promise<T>): Promise<T> {
    return test.step(name, async () => {
      await showStepBanner(this.page, name);
      return body();
    });
  }
}

/** Draws (or updates) a banner at the top of the page with the current step name. */
export async function showStepBanner(page: Page, text: string) {
  await page
    .evaluate((t) => {
      // Text lives inside a CLOSED shadow root so test locators (getByText etc.) never match the banner
      const w = window as unknown as { __pwStepLabel?: HTMLElement };
      if (!w.__pwStepLabel || !document.getElementById('pw-step-banner')) {
        const host = document.createElement('div');
        host.id = 'pw-step-banner';
        host.setAttribute('aria-hidden', 'true');
        const root = host.attachShadow({ mode: 'closed' });
        const el = document.createElement('div');
        Object.assign(el.style, {
          position: 'fixed', top: '8px', left: '50%', transform: 'translateX(-50%)',
          zIndex: '2147483647', pointerEvents: 'none', maxWidth: '90vw',
          background: 'rgba(17, 94, 89, 0.95)', color: '#fff', padding: '8px 16px',
          borderRadius: '8px', font: '600 14px/1.4 system-ui, sans-serif',
          boxShadow: '0 4px 12px rgba(0,0,0,.3)',
        });
        root.appendChild(el);
        document.body.appendChild(host);
        w.__pwStepLabel = el;
      }
      w.__pwStepLabel.textContent = `▶ ${t}`;
    }, text)
    .catch(() => {}); // page may be mid-navigation; the banner is cosmetic
}
