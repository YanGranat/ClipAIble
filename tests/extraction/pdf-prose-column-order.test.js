import {describe, expect, it} from 'vitest';
import { processLinesByColumns } from '../../scripts/offscreen/pdf/analyzers/column-detector.js';

function line(text, x, y, width) {
  return { text, x, y, fontSize: 10, pageNum: 1, items: [{ x, width }] };
}

const viewport = { width: 600, height: 800, convertToViewportPoint: (x, y) => [x, y] };

describe('Reading order when the x clusters contain inline fragments', () => {
  it('keeps both prose lanes between the spanning title and the trailing note', () => {
    const heading = line('Long title of an environmental survey', 42, 80, 505);
    const footer = line('Survey period and participating offices', 42, 735, 505);
    const west = Array.from({ length: 15 }, (_, i) =>
      line('Along the western trail the crew recorded temperature '+i, 42, 175+12*i, 235));
    const east = Array.from({ length: 15 }, (_, i) =>
      line('Along the eastern trail the crew recorded humidity '+i, 303, 176+12*i, 235));
    const references = Array.from({length: 14},(_, i) => line(String(i+1), 63+17*i, 178+i*10, 3));
    const source = [heading, ...west, ...east, ...references, footer].sort((a, b) => a.y - b.y);
    const result = processLinesByColumns(source, viewport, { baseFontSize: 11 }, rows => rows.map(row => ({
      text: row.text, minY: row.y, lines: [row]
    })));
    const uniqueOutput = result.map(item => item.text);
    expect(uniqueOutput).toHaveLength(source.length);
    expect(new Set(uniqueOutput).size).toBe(source.length);
    expect(uniqueOutput[0]).toBe(heading.text);
    expect(uniqueOutput.at(-1)).toBe(footer.text);
    expect(result[0].recoveredProseRegion).toBe('spanning');
    expect(result.at(-1).recoveredProseRegion).toBe('spanning');
    expect(result.find(item => item.text === west[0].text).recoveredProseRegion).toBe('lane');
    expect(uniqueOutput.indexOf(west.at(-1).text)).toBeLessThan(uniqueOutput.indexOf(east[0].text));
  });
});
