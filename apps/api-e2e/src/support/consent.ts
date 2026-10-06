import axios from 'axios';

/**
 * The version a form would show for a consent purpose (NFR-LEGAL-09): the
 * consent text's current one. The demo config publishes both purposes, so
 * every registration, inquiry and invited customer's first password owes it.
 */
export async function consentVersion(
  purpose: 'contact' | 'account',
): Promise<number> {
  const { data } = await axios.get<{ version: number }>(
    `/pages/consent-${purpose}`,
  );
  return data.version;
}
