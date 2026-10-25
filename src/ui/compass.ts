import { svg } from '../lib/dom';
import { normalizeDegrees, toCompassPoint, type CompassPoint } from '../lib/geo';
import { isCalm } from '../lib/format';

const POINT_NAMES: Record<CompassPoint, string> = {
  N: 'north',
  NNE: 'north-northeast',
  NE: 'northeast',
  ENE: 'east-northeast',
  E: 'east',
  ESE: 'east-southeast',
  SE: 'southeast',
  SSE: 'south-southeast',
  S: 'south',
  SSW: 'south-southwest',
  SW: 'southwest',
  WSW: 'west-southwest',
  W: 'west',
  WNW: 'west-northwest',
  NW: 'northwest',
  NNW: 'north-northwest',
};

/** Spoken description used as the compass's accessible name. */
export function describeWindForScreenReader(deg: number | null, speedMph: number | null): string {
  if (isCalm(speedMph)) return 'Wind calm';
  if (deg == null) return 'Wind direction not reported';
  return `Wind from the ${POINT_NAMES[toCompassPoint(deg)]}`;
}

/**
 * Renders a compass rose with an arrow showing where the wind is blowing to.
 * The arrow's tail sits on the side the wind comes from, and a dot marks that
 * side, so "from SW" reads as an arrow travelling from bottom-left to top-right.
 */
export function createCompass(deg: number | null, speedMph: number | null): SVGElement {
  const children: Element[] = [
    svg('circle', { cx: 50, cy: 50, r: 46, class: 'compass__ring' }),
    ...[0, 45, 90, 135, 180, 225, 270, 315].map((angle) =>
      svg('line', {
        x1: 50,
        y1: angle % 90 === 0 ? 7 : 9,
        x2: 50,
        y2: angle % 90 === 0 ? 15 : 13,
        class: 'compass__tick',
        transform: `rotate(${angle} 50 50)`,
      }),
    ),
    ...(
      [
        ['N', 50, 26],
        ['E', 76, 54],
        ['S', 50, 81],
        ['W', 24, 54],
      ] as const
    ).map(([label, x, y]) => {
      const text = svg('text', { x, y, class: 'compass__label', 'text-anchor': 'middle' });
      text.textContent = label;
      return text;
    }),
  ];

  if (deg != null && !isCalm(speedMph)) {
    // Drawn pointing north (downwind = north) and then rotated: a wind FROM
    // `deg` travels toward `deg + 180`.
    const rotation = normalizeDegrees(deg + 180);
    children.push(
      svg('g', { class: 'compass__arrow', transform: `rotate(${rotation} 50 50)` }, [
        svg('line', { x1: 50, y1: 72, x2: 50, y2: 34, class: 'compass__shaft' }),
        svg('path', { d: 'M50 24 L58.5 38 L41.5 38 Z', class: 'compass__head' }),
        svg('circle', { cx: 50, cy: 74, r: 4.5, class: 'compass__tail' }),
      ]),
    );
  } else {
    children.push(svg('circle', { cx: 50, cy: 50, r: 5, class: 'compass__calm' }));
  }

  return svg(
    'svg',
    {
      viewBox: '0 0 100 100',
      width: 76,
      height: 76,
      class: 'compass',
      role: 'img',
      'aria-label': describeWindForScreenReader(deg, speedMph),
    },
    children,
  );
}
