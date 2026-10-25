import { h, svg } from '../lib/dom';
import { compareWithStation, proximityCaveat, stationProximity, type Delta } from '../lib/compare';
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
import type { Conditions, ModelEstimate, StationObservation } from '../types';
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

/**
 * Temperature leads at display size because it is the one number people check
 * first; humidity sits beside it, and wind gets a full-width row of its own so
 * the compass has room to read. Both sources use this same shape, which is
 * what lets the two cards be compared by glancing down the column.
 */
export function renderMetrics(conditions: Conditions): HTMLElement {
  const gust = gustText(conditions);
  return h('dl', { className: 'metrics' }, [
    h('div', { className: 'metric metric--hero' }, [
      h('dt', { className: 'metric__label', text: 'Temperature' }),
      h('dd', {
        className: 'metric__value metric__value--hero',
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

function ageLabel(date: Date): HTMLElement {
  return h('span', {
    text: formatAge(date),
    attrs: { [AGE_ATTRIBUTE]: date.toISOString(), title: date.toLocaleString('en-US') },
  });
}

/** Small map-pin glyph that gives the distance chip something to anchor on. */
function pinGlyph(): SVGElement {
  return svg(
    'svg',
    { viewBox: '0 0 16 16', width: 13, height: 13, class: 'distance__icon', 'aria-hidden': 'true' },
    [
      svg('path', {
        d: 'M8 1.2a4.6 4.6 0 0 0-4.6 4.6C3.4 9.3 8 14.8 8 14.8s4.6-5.5 4.6-9A4.6 4.6 0 0 0 8 1.2z',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 1.6,
        'stroke-linejoin': 'round',
      }),
      svg('circle', { cx: 8, cy: 5.8, r: 1.7, fill: 'currentColor' }),
    ],
  );
}

/**
 * How far away the station is, which is the single most important caveat on
 * the measured reading and so is given real visual weight rather than being
 * buried in a line of grey detail text.
 */
function distanceChip(distanceMi: number): HTMLElement {
  return h(
    'p',
    {
      className: 'distance',
      attrs: { 'data-proximity': stationProximity(distanceMi) },
    },
    [pinGlyph(), h('span', { text: `${formatDistance(distanceMi)} from your spot` })],
  );
}

export function renderStationObservation(observation: StationObservation): HTMLElement[] {
  const caveat = proximityCaveat(observation.distanceMi);
  const skipped = observation.skippedCloser;
  const timing: (string | HTMLElement)[] = ['Reported ', ageLabel(observation.observedAt)];
  timing.push(` at ${formatClockTime(observation.observedAt)}`);
  if (observation.elevationFt != null) {
    timing.push(` · station at ${formatElevation(observation.elevationFt)}`);
  }

  return [
    h('div', { className: 'card__meta' }, [
      h('p', { className: 'card__source' }, [
        h('span', { className: 'card__source-name', text: observation.stationName }),
        h('span', { className: 'card__source-id', text: observation.stationId }),
      ]),
      distanceChip(observation.distanceMi),
      h('p', { className: 'card__detail' }, timing),
      caveat == null ? null : h('p', { className: 'card__caveat', text: caveat }),
      skipped > 0
        ? h('p', {
            className: 'card__hint',
            text: `Skipped ${skipped} closer ${skipped === 1 ? 'station' : 'stations'} with no recent reading.`,
          })
        : null,
    ]),
    renderMetrics(observation.conditions),
  ];
}

/**
 * The measured-versus-model differences. This is the comparison the app exists
 * to make, so it is stated outright instead of leaving the user to subtract two
 * cards in their head.
 */
function renderComparison(stationName: string, deltas: Delta[]): HTMLElement | null {
  if (deltas.length === 0) return null;
  return h('div', { className: 'compare' }, [
    h('p', { className: 'compare__title', text: `Your spot vs ${stationName}` }),
    h(
      'ul',
      { className: 'compare__list' },
      deltas.map((entry) =>
        h('li', { className: 'compare__item', attrs: { 'data-tone': entry.tone } }, [
          h('span', { className: 'compare__text', text: entry.text }),
        ]),
      ),
    ),
  ]);
}

export function renderModelEstimate(
  estimate: ModelEstimate,
  station: StationObservation | null = null,
): HTMLElement[] {
  const comparison =
    station == null
      ? null
      : renderComparison(
          station.stationName,
          compareWithStation({
            model: estimate.conditions,
            station: station.conditions,
            modelElevationFt: estimate.elevationFt,
            stationElevationFt: station.elevationFt,
          }),
        );

  return [
    h('div', { className: 'card__meta' }, [
      h('p', { className: 'card__detail' }, [
        `Open-Meteo model, valid ${formatClockTime(estimate.validAt)} (`,
        ageLabel(estimate.validAt),
        ')',
      ]),
    ]),
    renderMetrics(estimate.conditions),
    ...(comparison == null ? [] : [comparison]),
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
