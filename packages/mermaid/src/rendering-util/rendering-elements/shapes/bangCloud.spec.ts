import { select } from 'd3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Node } from '../../types.js';
import { bang } from './bang.js';
import { cloud } from './cloud.js';
import type * as ShapeUtils from './util.js';
import { labelHelper } from './util.js';

vi.mock('./util.js', async (importOriginal) => ({
  ...(await importOriginal<typeof ShapeUtils>()),
  labelHelper: vi.fn(),
}));

vi.mock('./handDrawnShapeStyles.js', () => ({
  styles2String: () => ({ labelStyles: '', nodeStyles: '' }),
  userNodeOverrides: () => ({}),
}));

// Keep the input outline visible to the test without depending on roughjs's
// stroke perturbations.
vi.mock('roughjs', () => ({
  default: {
    svg: () => ({
      path: (d: string) => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        return path;
      },
    }),
  },
}));

/**
 * The extent of the points an outline made of relative arcs passes through. Both shapes are
 * drawn as `M0 0`, then a run of `a rx,ry rotation large,sweep dx,dy` segments, then `H0 V0 Z`.
 * Arcs can bulge past their endpoints, so this is not the exact outline in general, but it is
 * enough to tell whether the outline is centred and it lets the test stand in for jsdom's missing
 * `getBBox()`.
 */
const outlineExtent = (d: string) => {
  let x = 0;
  let y = 0;
  const xs = [x];
  const ys = [y];
  for (const [, args] of d.matchAll(/a([^HVZa]+)/g)) {
    const numbers = args
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    x += numbers[numbers.length - 2];
    y += numbers[numbers.length - 1];
    xs.push(x);
    ys.push(y);
  }
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
};

const translation = (transform: string | null) => {
  const [, tx, ty] = /translate\(\s*([^\s,]+)[\s,]+([^\s)]+)\s*\)/.exec(transform ?? '')!;
  return { tx: Number(tx), ty: Number(ty) };
};

beforeEach(() => {
  document.body.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
  (SVGElement.prototype as unknown as SVGGraphicsElement).getBBox = function (this: SVGElement) {
    const { minX, maxX, minY, maxY } = outlineExtent(this.getAttribute('d') ?? '');
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY } as DOMRect;
  };
});

afterEach(() => {
  delete (SVGElement.prototype as Partial<SVGGraphicsElement>).getBBox;
});

// An HTML label measured with getBoundingClientRect(), in client coordinates.
const htmlLabelBBox = { x: 500, y: 300, left: 500, top: 300, width: 120, height: 24 } as DOMRect;
// SVG text centred on x=0 by `text-anchor: middle`; SVGRects have no `left`/`top`.
const middleAnchoredSvgLabelBBox = { x: -60, y: -12, width: 120, height: 24 } as DOMRect;
// SVG text starting at x=0, as in mind maps.
const startAnchoredSvgLabelBBox = { x: 0, y: -12, width: 120, height: 24 } as DOMRect;

describe.each([
  { name: 'bang', shape: bang },
  { name: 'cloud', shape: cloud },
])('$name', ({ shape }) => {
  const render = async (bbox: DOMRect, look: string) => {
    const parent = select(document.querySelector<SVGSVGElement>('svg')!);
    const shapeSvg = parent.append('g');
    const label = shapeSvg.append('g');
    vi.mocked(labelHelper).mockResolvedValue({ shapeSvg, bbox, halfPadding: 5, label });
    const node = { id: 'n', look, padding: 10, x: 0, y: 0 } as Node;
    await shape(parent, node);
    const outline = shapeSvg.select<SVGPathElement>('path').node()!;
    return { node, outline, label: label.node()! };
  };

  describe.each([
    { labelKind: 'HTML', bbox: htmlLabelBBox },
    { labelKind: 'middle-anchored SVG', bbox: middleAnchoredSvgLabelBBox },
    { labelKind: 'start-anchored SVG', bbox: startAnchoredSvgLabelBBox },
  ])('with an $labelKind label', ({ bbox }) => {
    it.each(['classic', 'handDrawn'])('centres the %s outline on the node origin', async (look) => {
      const { outline } = await render(bbox, look);
      const { minX, maxX, minY, maxY } = outlineExtent(outline.getAttribute('d')!);
      const { tx, ty } = translation(outline.getAttribute('transform'));

      expect(tx + (minX + maxX) / 2).toBeCloseTo(0, 6);
      expect(ty + (minY + maxY) / 2).toBeCloseTo(0, 6);
    });

    it('centres the label on the node origin', async () => {
      const { label } = await render(bbox, 'classic');
      const { tx } = translation(label.getAttribute('transform'));

      // The label's content starts at bbox.x in its own coordinates for SVG text, and at its
      // origin for an HTML label (whose bbox is in client coordinates).
      const contentLeft = tx + (bbox.left === undefined ? bbox.x : 0);
      expect(contentLeft + bbox.width / 2).toBeCloseTo(0, 6);
    });

    it('sizes the node bounds and edge intersections to the drawn outline', async () => {
      const { node, outline } = await render(bbox, 'classic');
      const { minX, maxX, minY, maxY } = outlineExtent(outline.getAttribute('d')!);
      const { tx } = translation(outline.getAttribute('transform'));

      expect(node.width).toBeCloseTo(maxX - minX, 6);
      expect(node.height).toBeCloseTo(maxY - minY, 6);
      // An edge arriving from the far right meets the node where the outline ends.
      expect(node.intersect!({ x: 1000, y: 0 }).x).toBeCloseTo(tx + maxX, 6);
      expect(node.intersect!({ x: -1000, y: 0 }).x).toBeCloseTo(tx + minX, 6);
    });
  });
});
