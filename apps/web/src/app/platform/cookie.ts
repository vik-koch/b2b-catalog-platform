/** One cookie's decoded value, or ''. The visitor can edit it: check it. */
export function cookieValue(cookies: string | undefined, name: string): string {
  const match = cookies?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}
