const escape = text => text.replace(/[\\()]/g, '\\$&');
const text = (value, x, y, size = 12, font = 'F1') =>
  `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escape(value)}) Tj ET`;

function table(rows, top, widths = [150, 180, 174]) {
  const left = 48;
  const height = 28;
  const commands = [`0.92 g ${left} ${top - height} 504 ${height} re f 0 g`];
  for (let row = 0; row <= rows.length; row++) commands.push(`${left} ${top - row * height} m 552 ${top - row * height} l S`);
  let x = left;
  for (const width of [0, ...widths]) {
    x += width;
    commands.push(`${x} ${top} m ${x} ${top - rows.length * height} l S`);
  }
  rows.forEach((cells, row) => {
    let cellX = left + 8;
    cells.forEach((value, column) => {
      commands.push(text(value, cellX, top - row * height - 18, 12, row === 0 ? 'F2' : 'F1'));
      cellX += widths[column];
    });
  });
  return commands.join('\n');
}

export const structureOracle = {
  title: 'River Sensor Study',
  author: 'Example Research',
  headings: ['Sensor measurements', 'Calibration results', 'Field notes'],
  tables: [
    [['Station', 'Flow', 'Status'], ['North', '18', 'Ready'], ['South', '27', 'Review']],
    [['Instrument', 'Offset', 'Unit'], ['Gauge', '0.4', 'mm'], ['Probe', '1.2', 'C']]
  ],
  paragraphs: ['Measurements were collected at two stations.', 'The first table contains all recorded readings.', 'Calibration followed the measurement survey.', 'The final note remains after both tables.'],
  image: { page: 1, x: 48, y: 84, width: 64, height: 64 }
};

/** A deterministic PDF with Standard 14 fonts, two bordered tables and RGB art. */
export function createStructurePdf({ italicHeading = false } = {}) {
  const stream = [
    text(structureOracle.title, 48, 750, 24, 'F2'),
    text(structureOracle.paragraphs[0], 48, 716),
    text(structureOracle.headings[0], 48, 670, 18, 'F2'),
    text(structureOracle.paragraphs[1], 48, 642),
    table(structureOracle.tables[0], 612),
    text(structureOracle.headings[1], 48, 475, 18, 'F2'),
    text(structureOracle.paragraphs[2], 48, 447),
    table(structureOracle.tables[1], 414),
    text(structureOracle.headings[2], 48, 278, 18, italicHeading ? 'F3' : 'F2'),
    text(structureOracle.paragraphs[3], 48, 250),
    text('Slanted field annotation.', 48, 218, 12, 'F3'),
    'q 64 0 0 64 48 84 cm /Im1 Do Q'
  ].join('\n');
  const image = 'ff000000ff000000ffffffff>';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> /XObject << /Im1 8 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>',
    `<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ${image.length} >>\nstream\n${image}\nendstream`,
    `<< /Title (${structureOracle.title}) /Author (${structureOracle.author}) >>`
  ];
  return encodePdf(objects, 9);
}

/** Raster and vector inserts between text pages, with a truly blank page. */
export function createInterleavedGraphicsPdf({ withText = true } = {}) {
  const page = content => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 13 0 R >> /XObject << /Im1 14 0 R >> >> /Contents ${content} 0 R >>`;
  const stream = commands => `<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`;
  const pixels = 'ff000000ff000000ffffffff>';
  return encodePdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R 9 0 R 11 0 R] /Count 5 >>',
    page(4), stream(withText ? text('Before the specimen', 30, 240, 17) : ''),
    page(6), stream('q 64 0 0 64 48 84 cm /Im1 Do Q'),
    page(8), stream('0.4 0.2 0.7 rg 20 80 120 90 re f'),
    page(10), stream('q 1 0 0 1 10 10 cm Q'),
    page(12), stream(withText ? text('After the specimen', 30, 240, 17) : ''),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ${pixels.length} >>\nstream\n${pixels}\nendstream`,
  ]);
}

function encodePdf(objects, info) {
  let pdf = '%PDF-1.7\n';
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  const metadata = info ? ` /Info ${info} 0 R` : '';
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${metadata} >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

export const mixedLayoutOracle = {
  title: 'Field measurements report',
  introduction: 'A full width introduction explains how all measurements should be interpreted.',
  conclusion: 'A full width conclusion summarizes independent observations and methods.',
  rows: [['Measurement', 'Station'], ['17', 'Station A'], ['34', 'Station B']]
};

export function mixedLayoutLane(region, side, length = 7) {
  return Array.from({ length }, (_, index) => `${region} ${side} ${index + 1} records the measured level.`);
}

/** A full-width ruled table between two independently flowing regions. */
export function createMixedLayoutPdf(lowerRightLength = 7) {
  const { title, introduction, conclusion, rows } = mixedLayoutOracle;
  const drawLanes = (region, top, rightLength) => ['Left', 'Right'].flatMap((side, index) =>
    mixedLayoutLane(region, side, index === 0 ? 7 : rightLength)
      .map((record, row) => text(record, index === 0 ? 48 : 327, top - row * 14, 11))
  );
  const stream = [
    text(title, 48, 776, 21, 'F2'),
    text(introduction, 48, 750, 12),
    ...drawLanes('Upper', 726, 7),
    table(rows, 510, [242, 262]),
    ...drawLanes('Lower', 401, lowerRightLength),
    text(conclusion, 48, 256, 14)
  ].join('\n');
  return encodePdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Title (${title}) >>`
  ], 7);
}
