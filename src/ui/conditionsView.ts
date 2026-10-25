import { h } from '../lib/dom';
import {
  formatAge,
  formatClockTime,
  formatDistance,
  formatElevation,
  formatHumidity,
  formatSpeed,
  formatTemperature,
  formatWindDirection,
  isCalm,
} from '../lib/format';
import { STATION_KIND_LABELS } from '../services/synopticNetworks';
import type { Conditions, ElevationCheck, ModelEstimate, StationObservation } from '../types';
import { createCompass } from './compass';

/** Data attribute used by the age ticker to refresh "x min ago" labels. */
export const AGE_ATTRIBUTE = 'data-age-since';

function windSummary(conditions: Conditions): string {
  const { speedMph } = conditions.wind;
  return isCalm(speedMph) ? 'Calm' : formatSpeed(speedMph);
}

function gustText(conditions: Conditions): string | null {
  const { gustMph, speedMph } = conditions.wind;
  if (gustMph == null || (speedMph != null && gustMph <= speedMph)) return null;
  return `Gusts ${formatSpeed(gustMph)}`;
}

/** Marks a value that the source left empty so it can be styled as secondary text. */
function unavailableAttrs(value: number | null): Record<string, string> {
  return value == null ? { 'data-unavailable': 'true' } : {};
}

/** Temperature, humidity and wind, shared by both data sources so they compare at a glance. */
export function renderMetrics(conditions: Conditions): HTMLElement {
  const gust = gustText(conditions);
  return h('dl', { className: 'metrics' }, [
    h('div', { className: 'metric metric--temperature' }, [
      h('dt', { className: 'metric__label', text: 'Temperature' }),
      h('dd', {
        className: 'metric__value',
        text: formatTemperature(conditions.temperatureF),
        attrs: unavailableAttrs(conditions.temperatureF),
      }),
    ]),
    h('div', { className: 'metric metric--humidity' }, [
      h('dt', { className: 'metric__label', text: 'Humidity' }),
      h('dd', {
        className: 'metric__value',
        text: formatHumidity(conditions.relativeHumidity),
        attrs: unavailableAttrs(conditions.relativeHumidity),
      }),
    ]),
    h('div', { className: 'metric metric--wind' }, [
      h('dt', { className: 'metric__label', text: 'Wind' }),
      h('dd', { className: 'wind' }, [
        createCompass(conditions.wind.directionDeg, conditions.wind.speedMph),
        h('span', {
          className: 'metric__value wind__speed',
          text: windSummary(conditions),
          attrs: unavailableAttrs(conditions.wind.speedMph),
        }),
        h('span', {
          className: 'wind__direction',
          text: formatWindDirection(conditions.wind.directionDeg, conditions.wind.speedMph),
        }),
        gust == null ? null : h('span', { className: 'wind__gust', text: gust }),
      ]),
    ]),
  ]);
}

export function ageLabel(date: Date): HTMLElement {
  return h('span', {
    text: formatAge(date),
    attrs: { [AGE_ATTRIBUTE]: date.toISOString(), title: date.toLocaleString('en-US') },
  });
}

/** Elevation differences smaller than this are described as "about the same height". */
const SAME_HEIGHT_FT = 100;

/** "800 ft below your spot", relative to the chosen spot's terrain height. */
export function describeElevationDifference(stationFt: number, spotFt: number): string {
  const difference = Math.round(stationFt - spotFt);
  if (Math.abs(difference) < SAME_HEIGHT_FT) return 'about the same height as your spot';
  return `${formatElevation(Math.abs(difference))} ${difference > 0 ? 'above' : 'below'} your spot`;
}

/** Station type with its network, for example "Mesonet · NV-ENERGY" or "Fire weather (RAWS)". */
export function stationTypeLabel(
  observation: Pick<StationObservation, 'kind' | 'network'>,
): string {
  const label = STATION_KIND_LABELS[observation.kind];
  const showNetwork =
    observation.network != null && (observation.kind === 'mesonet' || observation.kind === 'other');
  return showNetwork ? `${label} · ${observation.network ?? ''}` : label;
}

/** A colored dot plus the station type. The color matches the stations map layer. */
export function renderStationType(
  observation: Pick<StationObservation, 'kind' | 'network'>,
): HTMLElement {
  return h('span', { className: 'station-type', attrs: { 'data-kind': observation.kind } }, [
    h('span', { className: 'station-type__dot', attrs: { 'aria-hidden': 'true' } }),
    stationTypeLabel(observation),
  ]);
}

/** Explains why the elevation shown differs from the station's listing. */
export function elevationCheckNote(check: ElevationCheck): string {
  const terrain = formatElevation(check.terrainFt);
  switch (check.kind) {
    case 'meters':
      return `Listed elevation (${formatElevation(check.listedFt)}) looks like meters; terrain there is ${terrain}.`;
    case 'mismatch':
      return `Listed elevation (${formatElevation(check.listedFt)}) disagrees with terrain; using ${terrain}.`;
    case 'terrain':
      return `No listed elevation; using terrain height ${terrain}.`;
  }
}

export interface StationRenderOptions {
  /** Terrain elevation at the chosen spot, for the height comparison. */
  spotElevationFt?: number | null;
  /** Synoptic is configured but could not be reached, so only NWS stations were searched. */
  synopticUnavailable?: boolean;
}

const plural = (count: number, word: string): string =>
  `${count} closer ${count === 1 ? word : `${word}s`}`;

function hint(text: string): HTMLElement {
  return h('p', { className: 'card__hint', text });
}

export function renderStationObservation(
  observation: StationObservation,
  options: StationRenderOptions = {},
): HTMLElement[] {
  const { elevationFt, elevationCheck, skippedCloser, passedOverCloser } = observation;
  const spotFt = options.spotElevationFt ?? null;

  const hints: HTMLElement[] = [];
  if (elevationCheck != null) hints.push(hint(elevationCheckNote(elevationCheck)));
  if (passedOverCloser > 0) {
    hints.push(
      hint(`Chosen over ${plural(passedOverCloser, 'station')} at a less similar elevation.`),
    );
  }
  if (skippedCloser > 0) {
    hints.push(hint(`Skipped ${plural(skippedCloser, 'station')} with no recent reading.`));
  }
  for (const note of observation.qcNotes) hints.push(hint(note));
  if (options.synopticUnavailable === true) {
    hints.push(hint('Extra stations (Synoptic) are unavailable right now; showing NWS only.'));
  }

  return [
    h('div', { className: 'card__meta' }, [
      h('p', { className: 'card__source' }, [
        h('span', { className: 'card__source-name', text: observation.stationName }),
        h('span', { className: 'card__source-id', text: observation.stationId }),
      ]),
      h('p', { className: 'card__detail' }, [renderStationType(observation)]),
      h('p', {
        className: 'card__detail',
        text: `${formatDistance(observation.distanceMi)} away`,
      }),
      elevationFt == null
        ? null
        : h('p', {
            className: 'card__detail',
            text:
              spotFt == null
                ? `Station at ${formatElevation(elevationFt)}`
                : `Station at ${formatElevation(elevationFt)}, ${describeElevationDifference(elevationFt, spotFt)}`,
          }),
      h('p', { className: 'card__detail' }, [
        'Reported ',
        ageLabel(observation.observedAt),
        ` at ${formatClockTime(observation.observedAt)}`,
      ]),
      ...hints,
    ]),
    renderMetrics(observation.conditions),
  ];
}

export function renderModelEstimate(estimate: ModelEstimate): HTMLElement[] {
  return [
    h('div', { className: 'card__meta' }, [
      h('p', { className: 'card__detail' }, [
        `Open-Meteo, valid ${formatClockTime(estimate.validAt)} (`,
        ageLabel(estimate.validAt),
        ')',
      ]),
    ]),
    renderMetrics(estimate.conditions),
  ];
}

/** Refreshes every relative age label on the page. Called on a timer and on tab focus. */
export function refreshAgeLabels(root: ParentNode = document): void {
  const now = new Date();
  for (const element of root.querySelectorAll<HTMLElement>(`[${AGE_ATTRIBUTE}]`)) {
    const since = element.getAttribute(AGE_ATTRIBUTE);
    if (since != null) element.textContent = formatAge(new Date(since), now);
  }
}
