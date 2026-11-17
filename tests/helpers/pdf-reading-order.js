export const readingOrderOracle = {
  title: 'Water Survey Notes',
  headings: ['Opening survey', 'Western reach', 'Eastern reach'],
  paragraphs: [
    ['The opening survey records water depth.', 'A second reading verifies the first value.', 'The equipment remains in the same position.'],
    ['The western reach has a shallow bank.', 'Regular measurements follow the channel.', 'Each result belongs to the western log.', 'The final western note closes this column.'],
    ['The eastern reach has a steep bank.', 'A separate instrument records the level.', 'Each result belongs to the eastern log.', 'The final eastern note closes this column.']
  ]
};

/** Three pages, including a blank page and independently ordered text columns. */
export function createReadingOrderPdf() {
  const draw = (text, x, y, size = 11, font = 'F1') => `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${text}) Tj ET`;
  const first = [draw(readingOrderOracle.title, 48, 750, 24, 'F2'), draw(readingOrderOracle.headings[0], 48, 700, 18, 'F2'),
    ...readingOrderOracle.paragraphs[0].map((text, index) => draw(text, 48, 650 - 16 * index))].join('\n');
  const last = [
    ...[48, 326].flatMap((x, column) => [draw(readingOrderOracle.headings[column + 1], x, 730, 18, 'F2'),
      ...readingOrderOracle.paragraphs[column + 1].map((text, index) => draw(text, x, 690 - 16 * index))])
  ].join('\n');
  const page = content => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 9 0 R /F2 10 0 R >> >> /Contents ${content} 0 R >>`;
  const stream = content => `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>',
    page(4), stream(first), page(6), stream(''), page(8), stream(last),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Title (${readingOrderOracle.title}) /Author (Example Research) >>`];
  let pdf = '%PDF-1.7\n';
  const offsets = [];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 11 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
