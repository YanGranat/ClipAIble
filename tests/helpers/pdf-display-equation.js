export const equationOracle = {
  first: 'The measured rate is computed from the ratio below.',
  middle: 'The second reading uses a separate pair of values.',
  last: 'The remaining measurements are stored for review.',
  right: 'The eastern station recorded its own observations.'
};

export function createDisplayEquationPdf({ tagged = false, withTextLine = false } = {}) {
  const draw = (text, x, y, size = 10) => `BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${text.replace(/[()]/g, '\\$&')}) Tj ET`;
  const fraction = (name, numerator, denominator, y) => [
    draw(`${name} =`, 130, y),
    draw(numerator, 160, y + 7), draw(denominator, 160, y - 8), draw('+ z', 193, y),
    `158 ${y + 2} m 181 ${y + 2} l S`
  ];
  const lines = [
    draw(equationOracle.first, 44, 715),
    ...fraction('r', '9.84', '12.6', 691),
    draw('(3)', 235, 691),
    ...(withTextLine ? [draw('Additional counts are logged.', 120, 693)] : []),
    draw(equationOracle.middle, 44, 665),
    ...fraction('s', '2.37', '8.5', 641),
    draw(equationOracle.last, 44, 615),
    draw('The instrument remains stored in the same cabinet.', 44, 600),
    ...Array.from({ length: 11 }, (_, index) => draw(
      index === 0 ? equationOracle.right : `Record ${index} documents stable readings for this station.`, 340, 715 - index * 13)),
    draw('The temperature reading x was recorded at interval 6.', 44, 585),
    draw('2', 157, 588, 6),
    draw('The signed record accompanies the closing note.', 44, 570),
    draw('A stable reading confirms the equipment is healthy.', 44, 557),
    draw('The log closes after both stations finish recording.', 44, 544)
  ].join('\n');
  const content = tagged ? '/P <</MCID 0>> BDC\n' + lines + '\nEMC' : lines;
  const objects = [
    tagged ? '<< /Type /Catalog /Pages 2 0 R /MarkInfo << /Marked true >> /StructTreeRoot 6 0 R >>' : '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 640 800] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R' +
      (tagged ? ' /StructParents 0' : '') + ' >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...(tagged ? ['<< /Type /StructTreeRoot /K [7 0 R] /ParentTree 8 0 R /ParentTreeNextKey 1 >>',
      '<< /Type /StructElem /S /Document /P 6 0 R /Pg 3 0 R /K [9 0 R] >>',
      '<< /Nums [0 [9 0 R]] >>',
      '<< /Type /StructElem /S /P /P 7 0 R /Pg 3 0 R /K 0 >>'] : [])
  ];
  let pdf = '%PDF-1.7\n';
  const offsets = [];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
