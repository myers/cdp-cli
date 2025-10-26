/**
 * NDJSON output formatter for LLM-friendly CLI output
 * Each line is a complete JSON object for easy parsing and grep compatibility
 */

export interface OutputOptions {
  pretty?: boolean;
}

/**
 * Output a single line of NDJSON
 */
export function outputLine(data: any, options: OutputOptions = {}): void {
  const json = options.pretty
    ? JSON.stringify(data, null, 2)
    : JSON.stringify(data);

  console.log(json);
}

/**
 * Output multiple lines of NDJSON (one JSON object per line)
 */
export function outputLines(data: any[], options: OutputOptions = {}): void {
  for (const item of data) {
    outputLine(item, options);
  }
}

/**
 * Output an error in NDJSON format
 */
export function outputError(message: string, code?: string, details?: any): void {
  outputLine({
    error: true,
    message,
    code: code || 'ERROR',
    ...(details && { details })
  });
}

/**
 * Output a success message in NDJSON format
 */
export function outputSuccess(message: string, data?: any): void {
  outputLine({
    success: true,
    message,
    ...(data && { data })
  });
}

/**
 * Output raw text (not NDJSON) - used for screenshots, snapshots, etc.
 */
export function outputRaw(text: string): void {
  console.log(text);
}
