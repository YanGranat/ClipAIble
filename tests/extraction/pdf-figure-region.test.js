import { describe, expect, it, vi } from 'vitest';
import { authoredFigureCaption, findFigureRegion } from '../../scripts/offscreen/pdf/figure-region.js';

const pdfOperators = vi.hoisted(() => ({
  OPS: { constructPath: 1, stroke: 2, closeStroke: 3, fill: 4, eoFill: 5,
    fillStroke: 6, eoFillStroke: 7, closeFillStroke: 8, closeEOFillStroke: 9 },
  AnnotationMode: { DISABLE: 0 }
}));

vi.mock('../../scripts/offscreen/pdf/utils/pdf-loader.js', () => ({
  loadPdfJs: async () => pdfOperators
}));

const width = 600;
const height = 800;
const viewport = { rotation: 0, scale: 1, convertToViewportPoint: (x, y) => [x, height-y] };

function span(str, x, baseline, width, height = 10) {
  return { str, width, height, transform: [height, 0, 0, height, x, 800-baseline] };
}

/** Use distinct painted and text bounds, as in PDF.js recorded page operations. */
function specimen({ curve = true, right = 550 } = {}) {
  const rectangles = [];
  for (let y = 99; y <= 327; y += 12) {
    rectangles.push([52, y, right, y + 5], [53, y + 3, right - 1, y + 9]);
  }
  const commands = curve ? [0, 20, 30, 2, 25, 35, 35, 60, 45, 75] : [0, 0, 0, 1, 10, 0];
  const page = {
    recordedBBoxes: {
      length: rectangles.length, isEmpty: () => false,
      minX: index => rectangles[index][0] / width, minY: index => rectangles[index][1] / height,
      maxX: index => rectangles[index][2] / width, maxY: index => rectangles[index][3] / height
    },
    getOperatorList: vi.fn(async () => ({
      fnArray: rectangles.map(() => pdfOperators.OPS.constructPath),
      argsArray: rectangles.map(() => [pdfOperators.OPS.stroke, [commands]])
    }))
  };
  const caption = span('Figure 2: Observed values for paired measurements', 48, 358, 290, 12);
  const labels = [span('A', 37, 135, 5, 9), span('Reference', 390, 210, 51, 10)];
  const ordinary = [span('The opening heading stays before the figure.', 48, 71, 250),
    span('A later author paragraph stays intact.', 48, 419, 210)];
  return { page, caption, labels, ordinary, source: [ordinary[0], ...labels, caption, ordinary[1]] };
}

function region(source, { tables = [], extra = [] } = {}) {
  return findFigureRegion(source.page, [...source.source, ...extra], source.caption, tables,
    viewport, width, height, { check() {} });
}

describe('Native PDF figure ownership', () => {
  it('preserves one painted region and claims only its labels, including one beyond the paint edge', async () => {
    const source = specimen();
    expect(authoredFigureCaption(source.source, viewport)).toBe(source.caption);

    const figure = await region(source);
    expect(figure).toMatchObject({ sourceTop: expect.any(Number), bottom: expect.any(Number) });
    expect(figure.left).toBeLessThan(source.labels[0].transform[4]);
    expect(figure.bottom).toBeLessThan(358 - source.caption.height);
    expect([...figure.labelSet]).toEqual(source.labels);
    expect(source.page.getOperatorList).toHaveBeenCalledWith({
      intent: 'print', annotationMode: pdfOperators.AnnotationMode.DISABLE
    });
  });

  it('leaves absent, non-caption, ambiguous, and rotated candidates for normal text extraction', () => {
    const source = specimen();
    expect(authoredFigureCaption(source.ordinary, viewport)).toBeNull();
    expect(authoredFigureCaption([span('Figure 2 is discussed in the appendix.', 48, 358, 280)], viewport)).toBeNull();
    expect(authoredFigureCaption([...source.source, span('Figure 3: Second diagram', 48, 640, 145)], viewport)).toBeNull();
    expect(authoredFigureCaption(source.source, { ...viewport, rotation: 90 })).toBeNull();
  });

  it('rejects a region overlapping a confirmed painted table', async () => {
    const source = specimen();
    const table = { paintedBounds: { left: 48, right: 290, top: 115, bottom: 236 } };
    expect(await region(source, { tables: [table] })).toBeNull();
  });

  it('rejects an independent prose column inside the proposed graphical bounds', async () => {
    const source = specimen();
    const prose = [
      span('The measured body text must remain in the document.', 82, 184, 184),
      span('A separate observer keeps these sentences in order.', 82, 198, 177),
      span('Every line belongs to the prose, separate from labels.', 82, 212, 192)
    ];
    expect(await region(source, { extra: prose })).toBeNull();
  });

  it('rejects both ruled lines and narrowly bounded decoration even with a caption-like witness', async () => {
    expect(await region(specimen({ curve: false }))).toBeNull();
    expect(await region(specimen({ right: 215 }))).toBeNull();
  });
});
