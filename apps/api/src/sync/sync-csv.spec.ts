import { SyncFormatError, parseSyncCsv } from './sync-csv';

describe('parseSyncCsv', () => {
  it('parses the documented columns', () => {
    const { rows, errors } = parseSyncCsv(
      'sourceId,name,categorySourceId,categoryName,price\nA-1,Espresso Blend,C-1,Coffee Beans,1890\n',
    );

    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        sourceId: 'A-1',
        name: 'Espresso Blend',
        categorySourceId: 'C-1',
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

  it('reads a fully quoted file, doubled quotes and all', () => {
    const { rows, errors } = parseSyncCsv(
      '"sourceId","name","price"\n"A-1","Beans, ""whole""","1890"\n',
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { sourceId: 'A-1', name: 'Beans, "whole"', prices: { default: 1890 } },
    ]);
  });

  it('reads a semicolon-separated export, quotes and all', () => {
    // Which is what a spreadsheet in a comma-decimal locale writes.
    const { rows, errors } = parseSyncCsv(
      '"sourceId";"name"\n"A-1";"Beans, whole"\n',
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ sourceId: 'A-1', name: 'Beans, whole' }]);
  });

  it('refuses a file with a quote nobody closed, naming the line', () => {
    // The rows after the break would otherwise be swallowed into one field and
    // vanish without a word — the worst possible outcome for an import.
    expect(() =>
      parseSyncCsv('sourceId,name\n"A-1","Beans\n"A-2","Rice"\n'),
    ).toThrow(/Unclosed quote at line 3/);
  });

  it('treats an empty cell as absent, never as a value to clear', () => {
    const { rows } = parseSyncCsv(
      'sourceId,name,categorySourceId,categoryName,price\nA-1,,,,\n',
    );
    expect(rows).toEqual([{ sourceId: 'A-1' }]);
  });

  it('fails a row carrying only half of the category pair', () => {
    const idOnly = parseSyncCsv(
      'sourceId,categorySourceId,categoryName\nA-1,C-1,\n',
    );
    expect(idOnly.rows).toEqual([]);
    expect(idOnly.errors[0]).toMatchObject({
      code: 'category-id-without-name',
      params: { category: 'C-1' },
    });

    const nameOnly = parseSyncCsv(
      'sourceId,categorySourceId,categoryName\nA-1,,Coffee Beans\n',
    );
    expect(nameOnly.rows).toEqual([]);
    expect(nameOnly.errors[0]).toMatchObject({
      code: 'category-name-without-id',
      params: { category: 'Coffee Beans' },
    });
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
    expect(errors[0]).toMatchObject({
      row: 1,
      sourceId: 'A-1',
      code: 'price-not-an-integer',
      // The canonical column name: a bare `price` header is an alias for the
      // base list, and the parser has already resolved it.
      params: { price: '18.90', column: 'price:default' },
    });
  });

  it('reports a missing sourceId and a duplicate one, keeping the good rows', () => {
    const { rows, errors } = parseSyncCsv(
      'sourceId,name\nA-1,First\n,Nameless\nA-1,Again\nA-2,Second\n',
    );

    expect(rows.map((r) => r.sourceId)).toEqual(['A-1', 'A-2']);
    expect(errors).toEqual([
      { row: 2, sourceId: null, code: 'missing-source-id' },
      { row: 3, sourceId: 'A-1', code: 'duplicate-source-id' },
    ]);
  });

  describe('the stock column (FR-STOCK-01)', () => {
    it('reads a whole number of pieces', () => {
      const { rows, errors } = parseSyncCsv('sourceId,stock\nA-1,120\n');

      expect(errors).toEqual([]);
      expect(rows[0].stockPieces).toBe(120);
    });

    it('accepts a negative figure — a stocktake correction is not a typo', () => {
      const { rows } = parseSyncCsv('sourceId,stock\nA-1,-3\n');
      expect(rows[0].stockPieces).toBe(-3);
    });

    it('leaves an empty cell out, so a blank never untracks a product', () => {
      const { rows, errors } = parseSyncCsv('sourceId,stock\nA-1,\n');

      expect(errors).toEqual([]);
      expect(rows[0]).not.toHaveProperty('stockPieces');
    });

    it('skips a row whose stock is not a whole number', () => {
      const { rows, errors } = parseSyncCsv('sourceId,stock\nA-1,12.5\n');

      expect(rows).toEqual([]);
      expect(errors).toEqual([
        {
          row: 1,
          sourceId: 'A-1',
          code: 'stock-not-an-integer',
          params: { stock: '12.5' },
        },
      ]);
    });
  });

  describe('tier price columns (FR-AUTH-05)', () => {
    it('accepts any price:<key> column — the keys are deployment data', () => {
      const { rows, errors } = parseSyncCsv(
        'sourceId,price,price:wholesale,price:trade\nA-1,1890,1500,1600\n',
      );

      expect(errors).toEqual([]);
      // Whether these keys name real price lists is the validator's question;
      // the parser only settles the shape, so a deployment can add a list
      // without a release.
      expect(rows[0].prices).toEqual({
        default: 1890,
        wholesale: 1500,
        trade: 1600,
      });
    });

    it('lower-cases the key, so one list cannot arrive as two columns', () => {
      expect(() =>
        parseSyncCsv('sourceId,price:Wholesale,price:wholesale\nA-1,1,2\n'),
      ).toThrow(SyncFormatError);
    });

    it('reads a header case-insensitively, key included', () => {
      const { rows } = parseSyncCsv('sourceId,PRICE:Wholesale\nA-1,1500\n');
      expect(rows[0].prices).toEqual({ wholesale: 1500 });
    });

    it('refuses a price: column with no key at all', () => {
      expect(() => parseSyncCsv('sourceId,price:\nA-1,1500\n')).toThrow(
        SyncFormatError,
      );
    });

    it('skips a row whose tier price is not whole minor units, naming the column', () => {
      const { rows, errors } = parseSyncCsv(
        'sourceId,price:wholesale\nA-1,15.00\nA-2,1500\n',
      );

      expect(errors[0]).toMatchObject({
        row: 1,
        sourceId: 'A-1',
        code: 'price-not-an-integer',
        params: { column: 'price:wholesale' },
      });
      // One bad line never fails the whole catalog.
      expect(rows).toEqual([{ sourceId: 'A-2', prices: { wholesale: 1500 } }]);
    });

    it('still refuses a column that is not a price column at all', () => {
      expect(() => parseSyncCsv('sourceId,pricewholesale\nA-1,1\n')).toThrow(
        SyncFormatError,
      );
    });
  });
});
