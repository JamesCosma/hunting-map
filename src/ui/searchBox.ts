import { h } from '../lib/dom';
import { describeError, isAbortError } from '../lib/http';
import { classifyQuery, searchPlaces } from '../services/geocoding';
import type { PlaceResult } from '../types';

export interface SearchBoxOptions {
  onSelect: (place: PlaceResult) => void;
}

/**
 * Place and ZIP search. Search runs on submit only (no type-ahead), which
 * keeps request volume low on weak connections and respects Nominatim's
 * usage policy for the fallback geocoder.
 */
export class SearchBox {
  private readonly input: HTMLInputElement;
  private readonly submitButton: HTMLButtonElement;
  private readonly results: HTMLUListElement;
  private readonly status: HTMLElement;
  private controller: AbortController | null = null;

  constructor(
    private readonly form: HTMLFormElement,
    private readonly options: SearchBoxOptions,
  ) {
    this.input = this.find<HTMLInputElement>('input[type="search"]');
    this.submitButton = this.find<HTMLButtonElement>('button[type="submit"]');
    this.results = this.find<HTMLUListElement>('[data-search-results]');
    this.status = this.find<HTMLElement>('[data-search-status]');

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.runSearch();
    });
    this.input.addEventListener('keydown', (event) => {
      this.handleInputKey(event);
    });
    this.results.addEventListener('keydown', (event) => {
      this.handleResultsKey(event);
    });
  }

  private find<T extends Element>(selector: string): T {
    const element = this.form.querySelector<T>(selector);
    if (element == null) throw new Error(`Search form is missing ${selector}`);
    return element;
  }

  private async runSearch(): Promise<void> {
    const text = this.input.value;
    if (classifyQuery(text).kind === 'empty') {
      this.clearResults();
      this.setStatus('Enter a place name or a 5 digit ZIP code.', 'error');
      this.input.focus();
      return;
    }

    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.setBusy(true);
    this.setStatus('Searching...');

    try {
      const places = await searchPlaces(text, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (places.length === 0) {
        this.clearResults();
        this.setStatus(
          `No US places found for "${text.trim()}". Try a nearby town or ZIP.`,
          'error',
        );
      } else if (places.length === 1 && places[0] != null) {
        this.choose(places[0]);
      } else {
        this.renderResults(places);
        this.setStatus(`${places.length} matches. Choose one below.`);
      }
    } catch (error) {
      if (isAbortError(error)) return;
      this.clearResults();
      this.setStatus(describeError(error), 'error');
    } finally {
      if (this.controller === controller) {
        this.controller = null;
        this.setBusy(false);
      }
    }
  }

  private renderResults(places: PlaceResult[]): void {
    this.results.replaceChildren(
      ...places.map((place) =>
        h('li', {}, [
          h(
            'button',
            {
              className: 'search-result',
              attrs: { type: 'button' },
              on: {
                click: () => {
                  this.choose(place);
                },
              },
            },
            [
              h('span', { className: 'search-result__name', text: place.name }),
              place.region === ''
                ? null
                : h('span', { className: 'search-result__region', text: place.region }),
            ],
          ),
        ]),
      ),
    );
    this.results.hidden = false;
  }

  private choose(place: PlaceResult): void {
    this.clearResults();
    this.setStatus('');
    this.input.value = place.name;
    this.input.blur();
    this.options.onSelect(place);
  }

  private clearResults(): void {
    this.results.replaceChildren();
    this.results.hidden = true;
  }

  private setBusy(busy: boolean): void {
    this.submitButton.disabled = busy;
    this.form.setAttribute('aria-busy', String(busy));
  }

  private setStatus(message: string, tone: 'info' | 'error' = 'info'): void {
    this.status.textContent = message;
    this.status.dataset.tone = tone;
    this.status.hidden = message === '';
  }

  private resultButtons(): HTMLButtonElement[] {
    return Array.from(this.results.querySelectorAll<HTMLButtonElement>('button'));
  }

  private handleInputKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' && !this.results.hidden) {
      event.preventDefault();
      this.resultButtons()[0]?.focus();
    } else if (event.key === 'Escape') {
      this.clearResults();
      this.setStatus('');
    }
  }

  private handleResultsKey(event: KeyboardEvent): void {
    const buttons = this.resultButtons();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      buttons[Math.min(index + 1, buttons.length - 1)]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (index <= 0) this.input.focus();
      else buttons[index - 1]?.focus();
    } else if (event.key === 'Escape') {
      this.clearResults();
      this.input.focus();
    }
  }
}
