import { buildCsv } from './csv.util';

const cellsOf = (value: string | number | null) => {
  const csv = buildCsv([{ label: 'v', value: (r: { v: string | number | null }) => r.v }], [{ v: value }]);
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  return csv.slice(1).split('\r\n')[1];
};

describe('buildCsv formula cells', () => {
  it.each(['=', '+', '-', '@'])('prefixes a text cell starting with %s', (lead) => {
    expect(cellsOf(`${lead}HYPERLINK("x")`)).toBe(`"'${lead}HYPERLINK(""x"")"`);
    expect(cellsOf(`${lead}SUM(A1)`)).toBe(`'${lead}SUM(A1)`);
  });

  it('prefixes a text cell starting with a tab', () => {
    expect(cellsOf('\t=1+1')).toBe("'\t=1+1");
  });

  it('prefixes and quotes a text cell starting with a carriage return', () => {
    expect(cellsOf('\r=1+1')).toBe(`"'\r=1+1"`);
  });

  it('keeps negative amounts numeric whether given as a number or as money text', () => {
    expect(cellsOf(-12.5)).toBe('-12.5');
    expect(cellsOf('-12.50')).toBe('-12.50');
    expect(cellsOf('-7')).toBe('-7');
  });

  it('leaves ordinary text, dates and empty cells as they are', () => {
    expect(cellsOf('عميل - فرع')).toBe('عميل - فرع');
    expect(cellsOf('2026-10-17')).toBe('2026-10-17');
    expect(cellsOf('a,b')).toBe('"a,b"');
    expect(cellsOf(null)).toBe('');
  });
});
