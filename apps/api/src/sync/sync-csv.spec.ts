import { SyncFormatError, parseSyncCsv } from './sync-csv';

describe('parseSyncCsv', () => {
  it('parses the documented columns', () => {
    const { rows, errors } = parseSyncCsv(
      'sourceId,name,category,price\nA-1,Espresso Blend,Coffee Beans,1890\n',
    );

    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        sourceId: 'A-1',
        name: 'Espresso Blend',
        categoryName: 'Coffee Beans',
        prices: { default: 1890 },
      },
    ]);
  });

  it('accepts price:default alongside the bare price alias, in any column order', () => {
    const { rows } = parseSyncCsv('price:default,sourceId\n990,A-1\n');
    expect(rows[0].prices).toEqual({ default: 990 });
  });

  it('tolerates a BOM, quoted fields with commas, and CRLF', () => {
    const { rows, errors } = parseSyncCsv(
      '\uFEFFsourceId,name\r\nA-1,"Beans, whole"\r\n',
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ sourceId: 'A-1', name: 'Beans, whole' }]);
  });

  it('treats an empty cell as absent, never as a value to clear', () => {
    const { rows } = parseSyncCsv('sourceId,name,category,price\nA-1,,,\n');
    expect(rows).toEqual([{ sourceId: 'A-1' }]);
  });

  it('refuses a file with an unknown column rather than ignoring it', () => {
    expect(() => parseSyncCsv('sourceId,Prise\nA-1,1\n')).toThrow(
      SyncFormatError,
    );
  });

  it('refuses a file without a sourceId column', () => {
    expect(() => parseSyncCsv('name,price\nBeans,100\n')).toThrow(
      /Missing the required "sourceId" column/,
    );
  });

  it('refuses a duplicated column', () => {
    expect(() => parseSyncCsv('sourceId,name,NAME\nA-1,a,b\n')).toThrow(
      /Duplicate column/,
    );
  });

  it('refuses an empty file', () => {
    expect(() => parseSyncCsv('   ')).toThrow(/empty/);
  });

  it('reports a decimal price as a row error, not a silent rounding', () => {
    const { rows, errors } = parseSyncCsv('sourceId,price\nA-1,18.90\n');
    expect(rows).toEqual([]);
    expect(errors[0]).toMatchObject({ row: 1, sourceId: 'A-1' });
    expect(errors[0].message).toMatch(/minor units/);
  });

  it('reports a missing sourceId and a duplicate one, keeping the good rows', () => {
    const { rows, errors } = parseSyncCsv(
      'sourceId,name\nA-1,First\n,Nameless\nA-1,Again\nA-2,Second\n',
    );

    expect(rows.map((r) => r.sourceId)).toEqual(['A-1', 'A-2']);
    expect(errors).toEqual([
      { row: 2, sourceId: null, message: 'Missing sourceId' },
      { row: 3, sourceId: 'A-1', message: 'Duplicate sourceId in this file' },
    ]);
  });
});
