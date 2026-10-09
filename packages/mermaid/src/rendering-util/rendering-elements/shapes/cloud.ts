import rough from 'roughjs';
import { log } from '../../../logger.js';
import type { Bounds, D3Selection, Point } from '../../../types.js';
import { handleUndefinedAttr } from '../../../utils.js';
import type { Node } from '../../types.js';
import intersect from '../intersect/index.js';
import { styles2String, userNodeOverrides } from './handDrawnShapeStyles.js';
import { centerOnBoundingBox, getNodeClasses, labelHelper, updateNodeBounds } from './util.js';

export async function cloud<T extends SVGGraphicsElement>(parent: D3Selection<T>, node: Node) {
  const { labelStyles, nodeStyles } = styles2String(node);
  node.labelStyle = labelStyles;

  const { shapeSvg, bbox, halfPadding, label } = await labelHelper(
    parent,
    node,
    getNodeClasses(node)
  );

  const w = bbox.width + 2 * halfPadding;
  const h = bbox.height + 2 * halfPadding;

  // Cloud radii
  const r1 = 0.15 * w;
  const r2 = 0.25 * w;
  const r3 = 0.35 * w;
  const r4 = 0.2 * w;

  const { cssStyles } = node;
  let cloudElem;

  // Cloud path
  const path = `M0 0 
    a${r1},${r1} 0 0,1 ${w * 0.25},${-1 * w * 0.1}
    a${r3},${r3} 1 0,1 ${w * 0.4},${-1 * w * 0.1}
    a${r2},${r2} 1 0,1 ${w * 0.35},${w * 0.2}

    a${r1},${r1} 1 0,1 ${w * 0.15},${h * 0.35}
    a${r4},${r4} 1 0,1 ${-1 * w * 0.15},${h * 0.65}

    a${r2},${r1} 1 0,1 ${-1 * w * 0.25},${w * 0.15}
    a${r3},${r3} 1 0,1 ${-1 * w * 0.5},0
    a${r1},${r1} 1 0,1 ${-1 * w * 0.25},${-1 * w * 0.15}

    a${r1},${r1} 1 0,1 ${-1 * w * 0.1},${-1 * h * 0.35}
    a${r4},${r4} 1 0,1 ${w * 0.1},${-1 * h * 0.65}
  H0 V0 Z`;

  if (node.look === 'handDrawn') {
    // @ts-expect-error -- Passing a D3.Selection seems to work for some reason
    const rc = rough.svg(shapeSvg);
    const options = userNodeOverrides(node, {});
    const roughNode = rc.path(path, options);
    cloudElem = shapeSvg.insert(() => roughNode, ':first-child');
    cloudElem.attr('class', 'basic label-container').attr('style', handleUndefinedAttr(cssStyles));
  } else {
    cloudElem = shapeSvg
      .insert('path', ':first-child')
      .attr('class', 'basic label-container')
      .attr('style', nodeStyles)
      .attr('d', path);
  }

  // Centre the label horizontally whether it is an HTML label (whose box starts at x=0) or SVG
  // text, which may already be centred on x=0 by `text-anchor: middle` (see withMinWidth).
  label.attr(
    'transform',
    `translate(${-bbox.width / 2 - (bbox.x - (bbox.left ?? 0))}, ${-bbox.height / 2})`
  );

  // Centre the shape on the label. The bumps stick out past the nominal w x h box by different
  // amounts on each side (e.g. -0.1w on the left but +0.15w on the right), so translating by
  // half the nominal size would leave the outline off centre.
  updateNodeBounds(node, cloudElem, centerOnBoundingBox(cloudElem));

  node.calcIntersect = function (bounds: Bounds, point: Point) {
    return intersect.rect(bounds, point);
  };
  node.intersect = function (point) {
    log.info('Cloud intersect', node, point);
    return intersect.rect(node, point);
  };

  return shapeSvg;
}
