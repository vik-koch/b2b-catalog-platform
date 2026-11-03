/** A run of a line, `value` where a placeholder stood. */
export interface PlaceholderRun {
  readonly text: string;
  readonly value: boolean;
}

/**
 * A line cut at its placeholders, so each value can be kept on one line: a
 * number broken across two no longer reads as one. Each run must render as an
 * element of its own, or template line breaks become spaces between them.
 */
export function placeholderRuns(
  line: string,
  values: Record<string, string>,
): PlaceholderRun[] {
  return line
    .split(/(\{\w+\})/)
    .filter(Boolean)
    .map((part) => {
      const key = /^\{(\w+)\}$/.exec(part)?.[1];
      return key && key in values
        ? { text: values[key], value: true }
        : { text: part, value: false };
    });
}
