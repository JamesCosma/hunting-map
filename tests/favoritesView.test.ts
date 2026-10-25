// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Favorite, ModelEstimate } from '../src/types';
import {
  FavoritesView,
  type FavoritesViewModel,
  type FavoritesViewOptions,
  type RowConditions,
} from '../src/ui/favoritesView';

const MARKUP = `
  <section id="favorites">
    <p data-favorites-meta></p>
    <button data-favorites-refresh></button>
    <button data-favorites-edit>Edit</button>
    <p data-favorites-source></p>
    <div data-favorites-status></div>
    <ul data-favorites-list></ul>
    <div data-favorites-empty></div>
  </section>`;

const CAMP: Favorite = {
  id: 'a',
  name: 'Monitor Valley camp',
  lat: 38.5,
  lon: -116.5,
  place: 'Nye County, NV',
  zip: null,
  createdAt: 1,
};
const TOWN: Favorite = {
  id: 'b',
  name: 'Near Indian Springs, Clark County, NV',
  lat: 36.57,
  lon: -115.67,
  place: 'Near Indian Springs, Clark County, NV',
  zip: '89018',
  createdAt: 2,
};

const ESTIMATE: ModelEstimate = {
  elevationFt: 6562,
  validAt: new Date('2026-10-25T18:00:00Z'),
  conditions: {
    temperatureF: 31.4,
    relativeHumidity: 79,
    wind: { speedMph: 12.2, gustMph: 20, directionDeg: 225 },
  },
};

function model(overrides: Partial<FavoritesViewModel> = {}): FavoritesViewModel {
  return {
    favorites: [CAMP, TOWN],
    conditions: new Map<string, RowConditions>([
      ['a', { kind: 'ready', estimate: ESTIMATE }],
      ['b', { kind: 'loading' }],
    ]),
    updatedAt: null,
    refreshing: false,
    error: null,
    storageWarning: false,
    max: 25,
    ...overrides,
  };
}

let options: { [K in keyof FavoritesViewOptions]: ReturnType<typeof vi.fn> };
let view: FavoritesView;
const root = (): HTMLElement => document.getElementById('favorites') as HTMLElement;
const rows = (): HTMLElement[] => Array.from(root().querySelectorAll<HTMLElement>('.favorite'));

beforeEach(() => {
  document.body.innerHTML = MARKUP;
  options = {
    onOpen: vi.fn(),
    onRename: vi.fn(() => true),
    onDelete: vi.fn(),
    onUndo: vi.fn(),
    onRefresh: vi.fn(),
  };
  view = new FavoritesView(root(), options as unknown as FavoritesViewOptions);
});

describe('FavoritesView', () => {
  it('shows the empty state and hides list tools without favorites', () => {
    view.render(model({ favorites: [], conditions: new Map() }));
    expect(root().querySelector<HTMLElement>('[data-favorites-empty]')?.hidden).toBe(false);
    expect(root().querySelector<HTMLElement>('[data-favorites-edit]')?.hidden).toBe(true);
    expect(root().querySelector<HTMLButtonElement>('[data-favorites-refresh]')?.disabled).toBe(
      true,
    );
    expect(root().querySelector('[data-favorites-meta]')?.textContent).toBe('0 of 25 saved');
  });

  it('renders conditions per row, with loading rows marked busy', () => {
    view.render(model());
    const [camp, town] = rows();
    expect(camp?.dataset.state).toBe('ready');
    expect(camp?.querySelector('.favorite__name')?.textContent).toBe('Monitor Valley camp');
    expect(camp?.querySelector('.favorite__place')?.textContent).toBe('Nye County, NV');
    expect(camp?.querySelector('.favorite__temp')?.textContent).toBe('31°F');
    expect(camp?.querySelector('.favorite__stat--wind')?.textContent).toContain('12 mph SW');
    expect(camp?.querySelector('.favorite__stat--humidity')?.textContent).toContain('79%');
    expect(camp?.querySelector('.favorite__stat--elevation')?.textContent).toContain('6,562 ft');
    expect(town?.dataset.state).toBe('loading');
    expect(town?.querySelector('.favorite__open')?.getAttribute('aria-busy')).toBe('true');
  });

  it('shows coordinates instead of repeating a name that equals the place', () => {
    view.render(model());
    expect(rows()[1]?.querySelector('.favorite__place')?.textContent).toBe(
      '36.5700° N, 115.6700° W',
    );
  });

  it('shows a per-row error and a retryable batch error', () => {
    view.render(
      model({
        conditions: new Map<string, RowConditions>([['a', { kind: 'error' }]]),
        error: 'The request timed out.',
      }),
    );
    expect(rows()[0]?.textContent).toContain('Conditions unavailable');
    const alert = root().querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Could not load conditions. The request timed out.');
    alert?.querySelector('button')?.click();
    expect(options.onRefresh).toHaveBeenCalledOnce();
  });

  it('opens a favorite when its row is tapped', () => {
    view.render(model());
    rows()[0]?.querySelector<HTMLButtonElement>('.favorite__open')?.click();
    expect(options.onOpen).toHaveBeenCalledWith(CAMP);
  });

  it('keeps row elements across renders so focus is not lost', () => {
    view.render(model());
    const button = rows()[0]?.querySelector<HTMLButtonElement>('.favorite__open');
    button?.focus();
    view.render(model({ refreshing: true }));
    expect(rows()[0]?.querySelector('.favorite__open')).toBe(button);
    expect(document.activeElement).toBe(button);
  });

  it('removes and reorders rows by id', () => {
    view.render(model());
    view.render(model({ favorites: [TOWN] }));
    expect(rows().map((row) => row.dataset.id)).toEqual(['b']);
    view.render(model({ favorites: [TOWN, CAMP] }));
    expect(rows().map((row) => row.dataset.id)).toEqual(['b', 'a']);
  });

  describe('edit mode', () => {
    function enterEdit(): HTMLInputElement {
      view.render(model());
      root().querySelector<HTMLButtonElement>('[data-favorites-edit]')?.click();
      return rows()[0]?.querySelector('input') as HTMLInputElement;
    }

    it('swaps rows for labelled name inputs and delete buttons', () => {
      const input = enterEdit();
      const edit = root().querySelector('[data-favorites-edit]');
      expect(edit?.textContent).toBe('Done');
      expect(edit?.getAttribute('aria-pressed')).toBe('true');
      expect(rows()[0]?.querySelector<HTMLElement>('.favorite__open')?.hidden).toBe(true);
      expect(input.value).toBe('Monitor Valley camp');
      expect(input.labels?.[0]?.textContent).toBe('Name for Monitor Valley camp');
      expect(rows()[0]?.querySelector('.icon-button--danger')?.getAttribute('aria-label')).toBe(
        'Delete Monitor Valley camp',
      );
    });

    it('commits a rename on change and reverts when rejected', () => {
      const input = enterEdit();
      input.value = 'Upper camp';
      input.dispatchEvent(new Event('change'));
      expect(options.onRename).toHaveBeenCalledWith('a', 'Upper camp');

      options.onRename.mockReturnValueOnce(false);
      input.value = '   ';
      input.dispatchEvent(new Event('change'));
      expect(input.value).toBe('Monitor Valley camp');
    });

    it('reverts the typed name on Escape', () => {
      const input = enterEdit();
      input.value = 'Typo';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(input.value).toBe('Monitor Valley camp');
      expect(options.onRename).not.toHaveBeenCalled();
    });

    it('deletes and offers undo', () => {
      enterEdit();
      rows()[0]?.querySelector<HTMLButtonElement>('.icon-button--danger')?.click();
      expect(options.onDelete).toHaveBeenCalledWith('a');
      view.showUndo('Monitor Valley camp');
      const notice = root().querySelector('.favorites__notice');
      expect(notice?.textContent).toContain('Deleted “Monitor Valley camp”.');
      notice?.querySelector('button')?.click();
      expect(options.onUndo).toHaveBeenCalledOnce();
      view.clearUndo();
      expect(root().querySelector('.favorites__notice')).toBeNull();
    });

    it('leaves edit mode when the last favorite is gone', () => {
      enterEdit();
      view.render(model({ favorites: [], conditions: new Map() }));
      expect(view.isEditing).toBe(false);
    });
  });

  it('warns when favorites cannot be stored', () => {
    view.render(model({ storageWarning: true }));
    expect(root().querySelector('.favorites__notice--warning')?.textContent).toContain(
      'favorites will be lost',
    );
  });

  it('shows how fresh the list is', () => {
    view.render(model({ refreshing: true }));
    expect(root().querySelector('[data-favorites-meta]')?.textContent).toBe(
      '2 of 25 saved · Loading conditions',
    );
    view.render(model({ updatedAt: new Date() }));
    expect(root().querySelector('[data-favorites-meta]')?.textContent).toMatch(
      /^2 of 25 saved · Updated /,
    );
  });
});
