/** One cookie's decoded value out of a `Cookie` header or `document.cookie`,
 * or '' where the jar has none. The value is the visitor's to edit, so a
 * caller checks it before trusting it. */
export function cookieValue(cookies: string | undefined, name: string): string {
  const match = cookies?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}
