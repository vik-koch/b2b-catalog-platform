/** Matches the `categories.name` varchar(255). */
export const CATEGORY_NAME_MAX_LENGTH = 255;

/**
 * The name to show where the parent is already on screen: the nickname, or the
 * full name when there is none.
 */
export function categoryDisplayName(category: {
  name: string;
  shortName?: string | null;
}): string {
  return category.shortName || category.name;
}
