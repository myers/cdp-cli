/**
 * Debugging commands: console, snapshot, eval, screenshot
 */

import { CDPContext, Page } from '../context.js';
import { outputLines, outputLine, outputError, outputSuccess, outputRaw } from '../output.js';
import { writeFileSync } from 'fs';

/**
 * List console messages
 */
export async function listConsole(
  context: CDPContext,
  options: {
    type?: string;
    page: string;
    duration: number;
    tail: number;
    withType: boolean;
    withTimestamp: boolean;
    withSource: boolean;
  }
): Promise<void> {
  let ws;
  try {
    // Get page to monitor
    const page = await context.findPage(options.page);

    // Connect and enable Runtime domain
    ws = await context.connect(page);
    context.setupConsoleCollection(ws);
    await context.sendCommand(ws, 'Runtime.enable');

    // Collect for specified duration (in milliseconds)
    await new Promise(resolve => setTimeout(resolve, options.duration * 1000));

    // Get collected messages
    let messages = context.getConsoleMessages();

    // Filter by type if specified
    if (options.type) {
      messages = messages.filter(m => m.type === options.type);
    }

    // Track total before truncation for stderr warning
    const totalMessages = messages.length;

    // Apply tail limit (last N messages)
    if (options.tail !== -1 && messages.length > options.tail) {
      messages = messages.slice(-options.tail);

      // Warn on stderr when truncating
      const skippedCount = totalMessages - messages.length;
      const suggestedTail = Math.min(totalMessages, 50);
      console.error(`(${skippedCount} messages skipped. Use --tail ${suggestedTail} or --all to see more)`);
    }

    // Output format depends on flags
    const needsObjectFormat = options.withType || options.withTimestamp || options.withSource;

    if (needsObjectFormat) {
      // Object format with requested fields
      const output = messages.map(msg => {
        const obj: any = { text: msg.text };

        if (options.withType) {
          obj.type = msg.type;
          obj.source = msg.source;
        }

        if (options.withTimestamp) {
          obj.timestamp = msg.timestamp;
        }

        if (options.withSource) {
          if (msg.line) obj.line = msg.line;
          if (msg.url) obj.url = msg.url;
        }

        return obj;
      });
      outputLines(output);
    } else {
      // Minimal format: bare strings
      messages.forEach(msg => {
        outputRaw(JSON.stringify(msg.text));
      });
    }
  } catch (error) {
    outputError(
      (error as Error).message,
      'LIST_CONSOLE_FAILED'
    );
    process.exit(1);
  } finally {
    if (ws) {
      ws.close();
    }
  }
}

/**
 * Take a snapshot of the page (DOM or accessibility tree)
 */
export async function snapshot(
  context: CDPContext,
  options: { format?: string; page: string }
): Promise<void> {
  let ws;
  try {
    // Get page
    const page = await context.findPage(options.page);

    ws = await context.connect(page);

    const format = options.format || 'text';

    if (format === 'text') {
      // Simple text snapshot
      await context.sendCommand(ws, 'Runtime.enable');
      const result = await context.sendCommand(ws, 'Runtime.evaluate', {
        expression: 'document.body.innerText',
        returnByValue: true
      });

      outputRaw(result.result?.value || '');
    } else if (format === 'dom') {
      // DOM snapshot
      await context.sendCommand(ws, 'DOM.enable');
      const doc = await context.sendCommand(ws, 'DOM.getDocument', {
        depth: -1,
        pierce: true
      });

      outputLine(doc);
    } else if (format === 'ax') {
      // Accessibility tree snapshot
      await context.sendCommand(ws, 'Accessibility.enable');
      const ax = await context.sendCommand(ws, 'Accessibility.getFullAXTree');

      outputLine(ax);
    } else {
      throw new Error(`Unknown snapshot format: ${format}`);
    }
  } catch (error) {
    outputError(
      (error as Error).message,
      'SNAPSHOT_FAILED',
      { format: options.format }
    );
    process.exit(1);
  } finally {
    if (ws) {
      ws.close();
    }
  }
}

/**
 * Evaluate JavaScript expression
 */
export async function evaluate(
  context: CDPContext,
  expression: string,
  options: { page: string }
): Promise<void> {
  let ws;
  try {
    // Get page
    const page = await context.findPage(options.page);

    ws = await context.connect(page);

    await context.sendCommand(ws, 'Runtime.enable');
    const result = await context.sendCommand(ws, 'Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });

    if (result.exceptionDetails) {
      outputError(
        result.exceptionDetails.text,
        'EVAL_EXCEPTION',
        result.exceptionDetails
      );
      process.exit(1);
    }

    outputLine({
      success: true,
      value: result.result?.value,
      type: result.result?.type
    });
  } catch (error) {
    outputError(
      (error as Error).message,
      'EVAL_FAILED',
      { expression }
    );
    process.exit(1);
  } finally {
    if (ws) {
      ws.close();
    }
  }
}

/**
 * Take a screenshot
 */
export async function screenshot(
  context: CDPContext,
  options: { output?: string; format?: string; page: string; quality?: number }
): Promise<void> {
  let ws;
  try {
    // Get page
    const page = await context.findPage(options.page);

    ws = await context.connect(page);

    const format = options.format || 'jpeg';
    const validFormats = ['jpeg', 'png', 'webp'];
    if (!validFormats.includes(format)) {
      throw new Error(`Invalid format: ${format}. Must be one of: ${validFormats.join(', ')}`);
    }

    const quality = options.quality || 90;

    const result = await context.sendCommand(ws, 'Page.captureScreenshot', {
      format,
      quality: format === 'jpeg' ? quality : undefined
    });

    if (options.output) {
      // Save to file
      const buffer = Buffer.from(result.data, 'base64');
      writeFileSync(options.output, buffer);

      outputSuccess('Screenshot saved', {
        file: options.output,
        format,
        size: buffer.length
      });
    } else {
      // Output base64 data
      outputLine({
        success: true,
        format,
        data: result.data
      });
    }
  } catch (error) {
    outputError(
      (error as Error).message,
      'SCREENSHOT_FAILED',
      { output: options.output }
    );
    process.exit(1);
  } finally {
    if (ws) {
      ws.close();
    }
  }
}
