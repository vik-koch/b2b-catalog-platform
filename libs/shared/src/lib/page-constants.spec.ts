import { consentLabelParts } from './page-constants';

describe('consentLabelParts', () => {
  it('splits the wording around the bracketed part', () => {
    expect(consentLabelParts('I [consent] to the processing.')).toEqual({
      before: 'I ',
      link: 'consent',
      after: ' to the processing.',
    });
  });

  it('takes a wording that is all link', () => {
    expect(consentLabelParts('[I consent]')).toEqual({
      before: '',
      link: 'I consent',
      after: '',
    });
  });

  it('refuses a wording with no linked part, or more than one', () => {
    expect(consentLabelParts('I consent.')).toBeNull();
    expect(consentLabelParts('I [consent] and [agree].')).toBeNull();
  });

  it('refuses an empty or broken pair of brackets', () => {
    expect(consentLabelParts('I [ ] consent.')).toBeNull();
    expect(consentLabelParts('I [con[sent] to it.')).toBeNull();
    expect(consentLabelParts('I ]consent[ to it.')).toBeNull();
  });
});
