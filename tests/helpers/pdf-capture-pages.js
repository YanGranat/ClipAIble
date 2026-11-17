export const capturePageOracle = [
  { width: 600, height: 800, title: 'Portrait survey', marker: [255, 128, 0] },
  { width: 800, height: 500, title: 'Landscape survey', marker: [0, 128, 255] },
  { width: 400, height: 1000, title: 'Narrow survey', marker: [128, 0, 255] }
];

/** Pages with distinct identities, corner marks, tables and final records. */
export function createCapturePagesPdf() {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${capturePageOracle.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count 3 >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  capturePageOracle.forEach(({ width, height, title, marker }, index) => {
    const draw = (text, x, y, size = 12) => `BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${text}) Tj ET`;
    const square = (color, x, y, size = 12) => `${color.map(channel => channel / 255).join(' ')} rg ${x} ${y} ${size} ${size} re f`;
    const rows = [['Record', 'Value', 'Flag'], ['A', '8', 'Keep'], ['B', '13', 'Check']];
    const left = 32, top = height - 90, cellWidth = (width - 64) / 3;
    const commands = ['0 0 0 RG 1 w', `1 1 ${width - 2} ${height - 2} re S`,
      square([255, 0, 0], 8, height - 20), square([0, 255, 0], width - 20, height - 20),
      square([0, 0, 255], 8, 8), square([255, 0, 255], width - 20, 8),
      square(marker, 32, 64, 24), '0 0 0 rg', draw(`${index + 1}. ${title}`, 32, height - 42, 18),
      draw(`Final record for page ${index + 1}.`, 32, 32)];
    for (let row = 0; row <= 3; row++) commands.push(`${left} ${top - row * 24} m ${width - left} ${top - row * 24} l S`);
    for (let column = 0; column <= 3; column++) commands.push(`${left + column * cellWidth} ${top} m ${left + column * cellWidth} ${top - 72} l S`);
    rows.forEach((row, r) => row.forEach((cell, c) => commands.push(draw(cell, left + c * cellWidth + 6, top - r * 24 - 16))));
    const stream = commands.join('\n');
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let pdf = '%PDF-1.7\n';
  const offsets = [];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
