import { h } from '../lib/dom';

/**
 * Owns the swappable body of a data card and its four visual states:
 * loading skeleton, content, notice (expected "no data" outcomes) and error.
 */
export class CardView {
  private readonly body: HTMLElement;

  constructor(private readonly root: HTMLElement) {
    const body = root.querySelector<HTMLElement>('[data-card-body]');
    if (body == null) throw new Error('Card is missing a [data-card-body] element');
    this.body = body;
  }

  showPlaceholder(message: string): void {
    this.setState('idle');
    this.body.replaceChildren(h('p', { className: 'card__placeholder', text: message }));
  }

  showLoading(): void {
    this.setState('loading');
    const line = (width: string): HTMLElement =>
      h('span', { className: 'skeleton skeleton--line', attrs: { style: `width:${width}` } });
    const metric = (modifier: string, valueClass: string): HTMLElement =>
      h('div', { className: `metric metric--skeleton ${modifier}` }, [
        line('45%'),
        h('span', { className: `skeleton ${valueClass}` }),
      ]);
    this.body.replaceChildren(
      h('div', { className: 'card__meta', attrs: { 'aria-hidden': 'true' } }, [
        line('70%'),
        line('50%'),
      ]),
      h('div', { className: 'metrics', attrs: { 'aria-hidden': 'true' } }, [
        metric('metric--hero', 'skeleton--value-hero'),
        metric('metric--humidity', 'skeleton--value'),
        h('div', { className: 'metric metric--wind metric--skeleton' }, [
          h('span', { className: 'skeleton skeleton--circle' }),
          h('div', { className: 'metric__stack' }, [line('60%'), line('80%')]),
        ]),
      ]),
      h('span', { className: 'visually-hidden', text: 'Loading' }),
    );
  }

  showContent(...children: HTMLElement[]): void {
    this.setState('ready');
    this.body.replaceChildren(...children);
  }

  showNotice(title: string, message: string): void {
    this.setState('notice');
    this.body.replaceChildren(
      h('div', { className: 'notice', attrs: { role: 'status' } }, [
        h('p', { className: 'notice__title', text: title }),
        h('p', { className: 'notice__text', text: message }),
      ]),
    );
  }

  showError(message: string, onRetry: () => void): void {
    this.setState('error');
    this.body.replaceChildren(
      h('div', { className: 'notice notice--error', attrs: { role: 'alert' } }, [
        h('p', { className: 'notice__title', text: 'Could not load data' }),
        h('p', { className: 'notice__text', text: message }),
        h('button', {
          className: 'button button--secondary',
          text: 'Try again',
          attrs: { type: 'button' },
          on: { click: onRetry },
        }),
      ]),
    );
  }

  private setState(state: 'idle' | 'loading' | 'ready' | 'notice' | 'error'): void {
    this.root.dataset.state = state;
    this.root.setAttribute('aria-busy', String(state === 'loading'));
  }
}
