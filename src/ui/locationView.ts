import { h } from '../lib/dom';
import { formatCoordinates, formatElevation } from '../lib/format';
import type { ChosenLocation } from '../types';

export type ElevationState =
  { kind: 'loading' } | { kind: 'ready'; feet: number | null } | { kind: 'unavailable' };

/** The "Selected spot" summary: place label, coordinates and ground elevation. */
export class LocationView {
  private readonly name: HTMLElement;
  private readonly region: HTMLElement;
  private readonly coordinates: HTMLElement;
  private readonly elevation: HTMLElement;
  private readonly refreshButton: HTMLButtonElement;

  constructor(
    private readonly root: HTMLElement,
    onRefresh: () => void,
  ) {
    this.name = this.find('[data-location-name]');
    this.region = this.find('[data-location-region]');
    this.coordinates = this.find('[data-location-coords]');
    this.elevation = this.find('[data-location-elevation]');
    this.refreshButton = this.find<HTMLButtonElement>('[data-refresh]');
    this.refreshButton.addEventListener('click', onRefresh);
  }

  private find<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (element == null) throw new Error(`Location summary is missing ${selector}`);
    return element;
  }

  showLocation(location: ChosenLocation): void {
    this.root.hidden = false;
    this.name.textContent = location.label;
    // Dropped pins use the coordinates as their detail, which is already shown below.
    const region = location.detail ?? '';
    this.region.textContent = region;
    this.region.hidden = region === '' || location.label === 'Dropped pin';
    this.coordinates.textContent = formatCoordinates(location.lat, location.lon);
  }

  setElevation(state: ElevationState): void {
    switch (state.kind) {
      case 'loading':
        delete this.elevation.dataset.unavailable;
        this.elevation.replaceChildren(
          h('span', { className: 'skeleton skeleton--inline', attrs: { 'aria-hidden': 'true' } }),
          h('span', { className: 'visually-hidden', text: 'Loading' }),
        );
        break;
      case 'ready':
        if (state.feet == null) this.elevation.dataset.unavailable = 'true';
        else delete this.elevation.dataset.unavailable;
        this.elevation.textContent = formatElevation(state.feet);
        break;
      case 'unavailable':
        this.elevation.dataset.unavailable = 'true';
        this.elevation.textContent = 'Not available';
        break;
    }
  }

  setRefreshing(refreshing: boolean): void {
    this.refreshButton.disabled = refreshing;
    this.refreshButton.dataset.spinning = String(refreshing);
  }
}
