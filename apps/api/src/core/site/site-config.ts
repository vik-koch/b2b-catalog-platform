import * as z from 'zod';

import {
  CONSENT_PURPOSES,
  ConsentPurpose,
  SITE_AREA,
  siteConfigShape,
} from '@b2b-catalog-platform/shared/core/site';

import { loadDeploymentConfigBlock } from '../../platform/config/deployment-config';

const loadSiteConfig = () =>
  loadDeploymentConfigBlock(SITE_AREA, z.object(siteConfigShape).strict());

/** Published terms, whose version an order records (NFR-LEGAL-10). */
export const TERMS_PUBLISHED = 'TERMS_PUBLISHED';

export function loadTermsPublished(): boolean {
  return loadSiteConfig().pages.published.includes('terms');
}

/** The consent purposes switched on. */
export const CONSENT_PURPOSES_ASKED = 'CONSENT_PURPOSES_ASKED';

export function loadConsentPurposesAsked(): readonly ConsentPurpose[] {
  const { consent } = loadSiteConfig();
  return CONSENT_PURPOSES.filter((purpose) => consent[purpose]);
}
