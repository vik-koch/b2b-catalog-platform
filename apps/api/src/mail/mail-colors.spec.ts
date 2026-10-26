import { DEFAULT_MAIL_COLORS, mailColors } from './mail-colors';

const brand = { primary: '#1f5f9e', secondary: '#4a86c5', accent: '#0e7c86' };

describe('mailColors', () => {
  it('draws in the app’s defaults when the theme sets no grey', () => {
    expect(mailColors(brand)).toEqual(DEFAULT_MAIL_COLORS);
  });

  it('takes the deployment’s own greys', () => {
    expect(
      mailColors({ ...brand, ink: '#0f172a', surface: '#f1f5f9' }),
    ).toEqual({
      ...DEFAULT_MAIL_COLORS,
      ink: '#0f172a',
      surface: '#f1f5f9',
    });
  });

  it('keeps the default where a grey is written in a form mail cannot read', () => {
    expect(
      mailColors({ ...brand, inkSubtle: 'oklch(50% 0.02 250)' }).inkSubtle,
    ).toBe(DEFAULT_MAIL_COLORS.inkSubtle);
  });
});
