import {
  type DeploymentConfig,
  HEX_COLOUR,
} from '@b2b-catalog-platform/shared';

/** The greys a message is drawn in, by the web app's role names. */
export interface MailColours {
  /** Headings and body text. */
  readonly ink: string;
  /** Labels, quantities, the footer. */
  readonly inkSubtle: string;
  /** Rules between lines. */
  readonly edge: string;
  /** Behind the card. */
  readonly surface: string;
  /** The notice band. */
  readonly surfaceSubtle: string;
}

/**
 * The web app's defaults (styles.css) written as hex: a mail client reads
 * neither oklch nor color-mix. `inkSubtle` holds 4.5:1 on `surface`, where
 * the footer sits.
 */
export const DEFAULT_MAIL_COLOURS: MailColours = {
  ink: '#1c1917',
  inkSubtle: '#706963',
  edge: '#e7e5e4',
  surface: '#f5f5f4',
  surfaceSubtle: '#fafaf9',
};

/** The deployment's own greys where it set them as hex, the defaults otherwise. */
export function mailColours(
  theme: DeploymentConfig['branding']['theme'],
): MailColours {
  const pick = (key: keyof MailColours) => {
    const set = theme[key];
    return set && HEX_COLOUR.test(set) ? set : DEFAULT_MAIL_COLOURS[key];
  };
  return {
    ink: pick('ink'),
    inkSubtle: pick('inkSubtle'),
    edge: pick('edge'),
    surface: pick('surface'),
    surfaceSubtle: pick('surfaceSubtle'),
  };
}
