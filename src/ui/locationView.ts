import { h } from '../lib/dom';
import { formatCoordinates, formatElevation, formatZip } from '../lib/format';
import type { ChosenLocation, PlaceSummary } from '../types';

/** Label given to a spot picked on the map until its place name is known. */
export const DROPPED_PIN_LABEL = 'Dropped pin';

export type ElevationState =
  { kind: 'loading' } | { kind: 'ready'; feet: number | null } | { kind: 'unavailable' };

export type PlaceState =
  { kind: 'loading' } | { kind: 'ready'; place: PlaceSummary } | { kind: 'unavailable' };

/** The "Selected spot" summary: place label, ZIP, coordinates and ground elevation. */
export class LocationView {
  private readonly name: HTMLElement;
  private readonly region: HTMLElement;
  private readonly zip: HTMLElement;
  private readonly coordinates: HTMLElement;
  private readonly announcer: HTMLElement;
  private readonly elevation: HTMLElement;
  private readonly refreshButton: HTMLButtonElement;
  private location: ChosenLocation | null = null;

  constructor(
    private readonly root: HTMLElement,
    onRefresh: () => void,
  ) {
    this.name = this.find('[data-location-name]');
    this.region = this.find('[data-location-region]');
    this.zip = this.find('[data-location-zip]');
    this.coordinates = this.find('[data-location-coords]');
    this.announcer = this.find('[data-location-announce]');
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
    this.location = location;
    this.root.hidden = false;
    this.name.textContent = location.label;
    // Dropped pins use the coordinates as their detail, which is already shown below.
    this.setRegion(isDroppedPin(location) ? '' : (location.detail ?? ''));
    this.coordinates.textContent = formatCoordinates(location.lat, location.lon);
    this.announcer.textContent = '';
  }

  /**
   * Shows the reverse lookup result. A dropped pin takes the place name as its
   * title; a searched place keeps its own name and only gains the ZIP (and the
   * area, if search gave none).
   */
  setPlace(state: PlaceState): void {
    const location = this.location;
    switch (state.kind) {
      case 'loading':
        this.zip.hidden = false;
        delete this.zip.dataset.empty;
        this.zip.replaceChildren(
          h('span', { className: 'skeleton skeleton--chip', attrs: { 'aria-hidden': 'true' } }),
          h('span', { className: 'visually-hidden', text: 'Looking up ZIP code' }),
        );
        break;
      case 'ready': {
        const { label, zip } = state.place;
        this.zip.hidden = false;
        if (zip == null) this.zip.dataset.empty = 'true';
        else delete this.zip.dataset.empty;
        this.zip.textContent = formatZip(zip);
        if (location != null && label != null) {
          if (isDroppedPin(location)) this.name.textContent = label;
          else if (this.region.hidden) this.setRegion(label);
        }
        this.announcer.textContent = [label, formatZip(zip)].filter(Boolean).join(', ');
        break;
      }
      case 'unavailable':
        // The place name is a nice-to-have: hide it quietly and keep the coordinates.
        this.zip.hidden = true;
        this.zip.replaceChildren();
        break;
    }
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

  private setRegion(text: string): void {
    this.region.textContent = text;
    this.region.hidden = text === '';
  }
}

export function isDroppedPin(location: ChosenLocation): boolean {
  return location.label === DROPPED_PIN_LABEL;
}
