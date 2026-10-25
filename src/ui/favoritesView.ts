import { h, svg } from '../lib/dom';
import {
  formatAge,
  formatCoordinates,
  formatElevation,
  formatHumidity,
  formatTemperature,
  formatWindShort,
} from '../lib/format';
import type { Favorite, ModelEstimate } from '../types';
import { createWindArrow } from './compass';
import { AGE_ATTRIBUTE } from './conditionsView';

export type RowConditions =
  { kind: 'loading' } | { kind: 'ready'; estimate: ModelEstimate } | { kind: 'error' };

export interface FavoritesViewModel {
  favorites: readonly Favorite[];
  conditions: ReadonlyMap<string, RowConditions>;
  /** When the shown conditions were fetched, or null before the first load. */
  updatedAt: Date | null;
  refreshing: boolean;
  /** Set when the whole batch request failed. */
  error: string | null;
  /** True when the browser refused to store the last change. */
  storageWarning: boolean;
  max: number;
}

export interface FavoritesViewOptions {
  onOpen: (favorite: Favorite) => void;
  /** Returns false when the name was rejected, so the input reverts. */
  onRename: (id: string, name: string) => boolean;
  onDelete: (id: string) => void;
  onUndo: () => void;
  onRefresh: () => void;
}

interface Row {
  item: HTMLLIElement;
  open: HTMLButtonElement;
  name: HTMLElement;
  place: HTMLElement;
  temperature: HTMLElement;
  stats: HTMLElement;
  edit: HTMLElement;
  input: HTMLInputElement;
  inputLabel: HTMLLabelElement;
  remove: HTMLButtonElement;
}

const TRASH_ICON = 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3';

/**
 * The Favorites list: every saved spot with its current model conditions.
 * Rows are keyed by favorite id and updated in place, so a refresh or rename
 * never steals focus or resets an input being edited.
 */
export class FavoritesView {
  private readonly meta: HTMLElement;
  private readonly refreshButton: HTMLButtonElement;
  private readonly editButton: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly list: HTMLUListElement;
  private readonly empty: HTMLElement;
  private readonly source: HTMLElement;
  private readonly rows = new Map<string, Row>();
  private editing = false;
  private model: FavoritesViewModel | null = null;
  private undoName: string | null = null;

  constructor(
    root: HTMLElement,
    private readonly options: FavoritesViewOptions,
  ) {
    const find = <T extends HTMLElement>(selector: string): T => {
      const element = root.querySelector<T>(selector);
      if (element == null) throw new Error(`Favorites view is missing ${selector}`);
      return element;
    };
    this.meta = find('[data-favorites-meta]');
    this.refreshButton = find<HTMLButtonElement>('[data-favorites-refresh]');
    this.editButton = find<HTMLButtonElement>('[data-favorites-edit]');
    this.status = find('[data-favorites-status]');
    this.list = find<HTMLUListElement>('[data-favorites-list]');
    this.empty = find('[data-favorites-empty]');
    this.source = find('[data-favorites-source]');

    this.refreshButton.addEventListener('click', () => {
      options.onRefresh();
    });
    this.editButton.addEventListener('click', () => {
      this.setEditing(!this.editing);
    });
  }

  get isEditing(): boolean {
    return this.editing;
  }

  render(model: FavoritesViewModel): void {
    this.model = model;
    const count = model.favorites.length;
    if (count === 0 && this.editing) this.setEditing(false, { render: false });

    this.renderMeta(model);
    this.refreshButton.disabled = model.refreshing || count === 0;
    this.refreshButton.dataset.spinning = String(model.refreshing);
    this.editButton.hidden = count === 0;
    this.source.hidden = count === 0;
    this.empty.hidden = count > 0;
    this.list.hidden = count === 0;
    this.list.dataset.editing = String(this.editing);
    this.renderRows(model);
    this.renderStatus(model);
  }

  /** Offers to undo a deletion until the next change. */
  showUndo(name: string): void {
    this.undoName = name;
    if (this.model != null) this.renderStatus(this.model);
  }

  clearUndo(): void {
    this.undoName = null;
    if (this.model != null) this.renderStatus(this.model);
  }

  /** Leaves edit mode, committing any name still being typed. */
  setEditing(editing: boolean, options: { render?: boolean } = {}): void {
    if (editing === this.editing) return;
    if (!editing) {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement && this.list.contains(active)) active.blur();
    }
    this.editing = editing;
    this.editButton.textContent = editing ? 'Done' : 'Edit';
    this.editButton.setAttribute('aria-pressed', String(editing));
    if (options.render !== false && this.model != null) this.render(this.model);
  }

  /** Moves focus to a favorite's row, used after "Saved" is tapped on the conditions view. */
  focusFavorite(id: string): void {
    const row = this.rows.get(id);
    if (row == null) return;
    row.item.scrollIntoView({ block: 'nearest' });
    (this.editing ? row.input : row.open).focus({ preventScroll: true });
  }

  private renderMeta(model: FavoritesViewModel): void {
    const children: (Node | string)[] = [`${model.favorites.length} of ${model.max} saved`];
    if (model.favorites.length > 0) {
      if (model.refreshing && model.updatedAt == null) {
        children.push(' · Loading conditions');
      } else if (model.updatedAt != null) {
        children.push(
          ' · Updated ',
          h('span', {
            text: formatAge(model.updatedAt),
            attrs: { [AGE_ATTRIBUTE]: model.updatedAt.toISOString() },
          }),
        );
      }
    }
    this.meta.replaceChildren(...children);
  }

  private renderStatus(model: FavoritesViewModel): void {
    const messages: HTMLElement[] = [];
    if (this.undoName != null) {
      messages.push(
        h('div', { className: 'favorites__notice' }, [
          h('p', { text: `Deleted “${this.undoName}”.` }),
          h('button', {
            className: 'button button--secondary',
            text: 'Undo',
            attrs: { type: 'button' },
            on: {
              click: () => {
                this.options.onUndo();
              },
            },
          }),
        ]),
      );
    }
    if (model.error != null) {
      messages.push(
        h(
          'div',
          { className: 'favorites__notice favorites__notice--error', attrs: { role: 'alert' } },
          [
            h('p', { text: `Could not load conditions. ${model.error}` }),
            h('button', {
              className: 'button button--secondary',
              text: 'Try again',
              attrs: { type: 'button' },
              on: {
                click: () => {
                  this.options.onRefresh();
                },
              },
            }),
          ],
        ),
      );
    }
    if (model.storageWarning) {
      messages.push(
        h('p', {
          className: 'favorites__notice favorites__notice--warning',
          text: 'This browser is not letting the app save data, so favorites will be lost when the page closes. Private browsing can cause this.',
        }),
      );
    }
    this.status.replaceChildren(...messages);
  }

  private renderRows(model: FavoritesViewModel): void {
    const ids = new Set(model.favorites.map((favorite) => favorite.id));
    for (const [id, row] of this.rows) {
      if (!ids.has(id)) {
        row.item.remove();
        this.rows.delete(id);
      }
    }
    model.favorites.forEach((favorite, index) => {
      let row = this.rows.get(favorite.id);
      if (row == null) {
        row = this.createRow(favorite.id);
        this.rows.set(favorite.id, row);
      }
      // Only move nodes that are out of place; moving a focused node would blur it.
      const atIndex = this.list.children.item(index);
      if (atIndex !== row.item) this.list.insertBefore(row.item, atIndex);
      this.updateRow(row, favorite, model.conditions.get(favorite.id) ?? { kind: 'loading' });
    });
  }

  private createRow(id: string): Row {
    const inputId = `favorite-name-${id}`;
    const name = h('span', { className: 'favorite__name' });
    const place = h('span', { className: 'favorite__place' });
    const temperature = h('span', { className: 'favorite__temp' });
    const stats = h('span', { className: 'favorite__stats' });
    const open = h('button', { className: 'favorite__open', attrs: { type: 'button' } }, [
      h('span', { className: 'favorite__heading' }, [
        h('span', { className: 'favorite__titles' }, [name, place]),
        temperature,
      ]),
      stats,
    ]);
    const input = h('input', {
      className: 'text-input favorite__input',
      attrs: {
        id: inputId,
        type: 'text',
        maxlength: '60',
        autocomplete: 'off',
        enterkeyhint: 'done',
      },
    });
    const inputLabel = h('label', { className: 'visually-hidden', attrs: { for: inputId } });
    const remove = h(
      'button',
      { className: 'icon-button icon-button--danger', attrs: { type: 'button' } },
      [
        svg(
          'svg',
          {
            viewBox: '0 0 24 24',
            width: 20,
            height: 20,
            'aria-hidden': 'true',
            focusable: 'false',
          },
          [
            svg('path', {
              d: TRASH_ICON,
              fill: 'none',
              stroke: 'currentColor',
              'stroke-width': 2,
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
            }),
          ],
        ),
      ],
    );
    const edit = h('div', { className: 'favorite__edit' }, [inputLabel, input, remove]);
    const item = h('li', { className: 'favorite', attrs: { 'data-id': id } }, [open, edit]);

    open.addEventListener('click', () => {
      const favorite = this.model?.favorites.find((f) => f.id === id);
      if (favorite != null) this.options.onOpen(favorite);
    });
    const commit = (): void => {
      const current = this.model?.favorites.find((f) => f.id === id);
      if (current == null) return;
      if (!this.options.onRename(id, input.value)) input.value = current.name;
    };
    input.addEventListener('change', commit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      } else if (event.key === 'Escape') {
        const current = this.model?.favorites.find((f) => f.id === id);
        if (current != null) input.value = current.name;
        input.blur();
      }
    });
    remove.addEventListener('click', () => {
      this.options.onDelete(id);
    });
    return { item, open, name, place, temperature, stats, edit, input, inputLabel, remove };
  }

  private updateRow(row: Row, favorite: Favorite, conditions: RowConditions): void {
    row.open.hidden = this.editing;
    row.edit.hidden = !this.editing;
    row.name.textContent = favorite.name;
    // The place line repeats nothing: when the name is the place, show coordinates instead.
    const subtitle =
      favorite.place != null && favorite.place !== favorite.name
        ? favorite.place
        : formatCoordinates(favorite.lat, favorite.lon);
    row.place.textContent = subtitle;
    if (document.activeElement !== row.input) row.input.value = favorite.name;
    row.inputLabel.textContent = `Name for ${favorite.name}`;
    row.remove.setAttribute('aria-label', `Delete ${favorite.name}`);
    row.item.dataset.state = conditions.kind;
    row.open.setAttribute('aria-busy', String(conditions.kind === 'loading'));

    switch (conditions.kind) {
      case 'loading':
        row.temperature.replaceChildren(
          h('span', { className: 'skeleton skeleton--temp', attrs: { 'aria-hidden': 'true' } }),
        );
        row.stats.replaceChildren(
          h('span', { className: 'skeleton skeleton--line', attrs: { 'aria-hidden': 'true' } }),
          h('span', { className: 'visually-hidden', text: 'Loading conditions' }),
        );
        break;
      case 'error':
        row.temperature.replaceChildren();
        row.stats.replaceChildren(
          h('span', { className: 'favorite__unavailable', text: 'Conditions unavailable' }),
        );
        break;
      case 'ready': {
        const { conditions: c, elevationFt } = conditions.estimate;
        row.temperature.textContent = formatTemperature(c.temperatureF);
        row.temperature.toggleAttribute('data-unavailable', c.temperatureF == null);
        row.stats.replaceChildren(
          stat('Wind', formatWindShort(c.wind.speedMph, c.wind.directionDeg), 'wind', [
            createWindArrow(c.wind.directionDeg, c.wind.speedMph),
          ]),
          stat('Humidity', formatHumidity(c.relativeHumidity), 'humidity'),
          stat('Elevation', formatElevation(elevationFt), 'elevation'),
        );
        break;
      }
    }
  }
}

function stat(label: string, value: string, modifier: string, icon: Element[] = []): HTMLElement {
  return h('span', { className: `favorite__stat favorite__stat--${modifier}` }, [
    h('span', { className: 'favorite__stat-label', text: label }),
    h('span', { className: 'favorite__stat-value' }, [...icon, value]),
  ]);
}
