import { SyncFormatError } from './csv-file';
import { parseCustomerSyncCsv } from './customer-sync-csv';

describe('parseCustomerSyncCsv', () => {
  it('parses the documented columns', () => {
    const { rows, errors } = parseCustomerSyncCsv(
      'sourceId,email,access,tierKey,customerType,companyName,companyRegistrationId,firstName,lastName,phone,sendPasswordLink\n' +
        'C-1,Ada@Example.com,enabled,wholesale,company,Lovelace Ltd,HRB12345,Ada,Lovelace,+49 30 111,yes\n',
    );

    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        sourceId: 'C-1',
        // Lowercased by the contract's own field, which is what the sign-in
        // form does to what somebody types.
        email: 'ada@example.com',
        access: 'enabled',
        tierKey: 'wholesale',
        customerType: 'company',
        companyName: 'Lovelace Ltd',
        companyRegistrationId: 'HRB12345',
        firstName: 'Ada',
        lastName: 'Lovelace',
        phone: '+49 30 111',
        sendPasswordLink: true,
      },
    ]);
  });

  it('reads a file carrying the key and one column, in any order', () => {
    // The go-live case: the tiers are settled over there, nothing else is.
    const { rows, errors } = parseCustomerSyncCsv(
      'tierKey,sourceId\nwholesale,C-1\n',
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { sourceId: 'C-1', tierKey: 'wholesale', sendPasswordLink: false },
    ]);
  });

  it('leaves an empty cell out rather than clearing the field', () => {
    // The rule the whole encoding rests on: a spreadsheet cannot tell an empty
    // cell from an absent one, and of the two readings only this one cannot
    // quietly strip somebody's company off their invoices.
    const { rows } = parseCustomerSyncCsv(
      'sourceId,email,tierKey,companyName\nC-1,,,\n',
    );
    expect(rows).toEqual([{ sourceId: 'C-1', sendPasswordLink: false }]);
  });

  it('tolerates a BOM, quoted fields with commas, and CRLF', () => {
    const { rows, errors } = parseCustomerSyncCsv(
      '﻿sourceId,companyName\r\nC-1,"Lovelace, Ltd"\r\n',
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        sourceId: 'C-1',
        companyName: 'Lovelace, Ltd',
        sendPasswordLink: false,
      },
    ]);
  });

  it('matches headers case-insensitively', () => {
    const { rows } = parseCustomerSyncCsv('SourceID,EMAIL\nC-1,a@b.de\n');
    expect(rows[0]).toMatchObject({ sourceId: 'C-1', email: 'a@b.de' });
  });

  it('refuses a file with no sourceId column', () => {
    expect(() =>
      parseCustomerSyncCsv('email,tierKey\na@b.de,wholesale\n'),
    ).toThrow(SyncFormatError);
  });

  it('refuses a column nobody recognises, listing it', () => {
    // Almost certainly a converter bug, and ignoring it would import a file
    // that silently did less than it says.
    expect(() =>
      parseCustomerSyncCsv('sourceId,password\nC-1,hunter2\n'),
    ).toThrow(/Unknown columns password/);
  });

  it('refuses a duplicated column rather than picking one', () => {
    expect(() =>
      parseCustomerSyncCsv('sourceId,tierKey,TIERKEY\nC-1,a,b\n'),
    ).toThrow(/Duplicate column/);
  });

  describe('rows it skips', () => {
    it('skips a row with no key and one that repeats a key', () => {
      const { rows, errors } = parseCustomerSyncCsv(
        'sourceId,tierKey\n,wholesale\nC-1,wholesale\nC-1,retail\n',
      );

      expect(rows).toHaveLength(1);
      expect(errors).toEqual([
        { row: 1, sourceId: null, code: 'missing-source-id' },
        { row: 3, sourceId: 'C-1', code: 'duplicate-source-id' },
      ]);
    });

    it('skips a cell the field cannot hold, naming the column and the value', () => {
      const { rows, errors } = parseCustomerSyncCsv(
        'sourceId,email\nC-1,not-an-address\nC-2,ada@example.com\n',
      );

      expect(rows).toHaveLength(1);
      expect(errors).toEqual([
        {
          row: 1,
          sourceId: 'C-1',
          code: 'invalid-value',
          params: { column: 'email', value: 'not-an-address' },
        },
      ]);
    });

    it('skips an access cell that says something else', () => {
      // `refused` in particular: there is no such state, and reading it as
      // either of the two would be a guess about somebody's sign-in.
      const { errors } = parseCustomerSyncCsv('sourceId,access\nC-1,refused\n');
      expect(errors[0]).toMatchObject({
        code: 'invalid-value',
        params: { column: 'access', value: 'refused' },
      });
    });

    it('skips a yes/no cell that is neither', () => {
      const { errors } = parseCustomerSyncCsv(
        'sourceId,sendPasswordLink\nC-1,maybe\n',
      );
      expect(errors[0]).toMatchObject({
        code: 'invalid-value',
        params: { column: 'sendPasswordLink', value: 'maybe' },
      });
    });

    it('reads the words a spreadsheet writes for yes and no', () => {
      const { rows } = parseCustomerSyncCsv(
        'sourceId,sendPasswordLink\nC-1,TRUE\nC-2,0\nC-3,No\n',
      );
      expect(rows.map((row) => row.sendPasswordLink)).toEqual([
        true,
        false,
        false,
      ]);
    });

    it('carries no password column at all', () => {
      // FR-ADM-13, enforced by the header check rather than by ignoring it:
      // a file offering one is refused, so nobody believes it was honoured.
      expect(() =>
        parseCustomerSyncCsv('sourceId,password\nC-1,secret\n'),
      ).toThrow(SyncFormatError);
    });
  });
});
