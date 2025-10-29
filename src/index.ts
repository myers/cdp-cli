#!/usr/bin/env node

/**
 * Chrome DevTools CLI
 * Command-line interface for Chrome DevTools Protocol
 * Optimized for LLM agents with NDJSON output
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { CDPContext } from './context.js';
import * as pages from './commands/pages.js';
import * as debug from './commands/debug.js';
import * as network from './commands/network.js';
import * as input from './commands/input.js';
import * as launch from './commands/launch.js';
import { getDefaultCdpUrl, getDefaultPort } from './config.js';

// Read version from package.json
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8')
);
const version = packageJson.version;

const DEFAULT_CDP_URL = getDefaultCdpUrl();

// Create CLI
const cli = yargs(hideBin(process.argv))
  .scriptName('cdp-cli')
  .version(version)
  .usage('Usage: $0 <command> [options]')
  .option('cdp-url', {
    type: 'string',
    description: 'Chrome DevTools Protocol URL',
    default: DEFAULT_CDP_URL
  })
  .demandCommand(1, 'You must provide a command')
  .strict()
  .fail((msg, err, yargs) => {
    // Detect missing positional arguments and provide helpful error
    if (msg && msg.includes('Not enough non-option arguments')) {
      // Extract command from process.argv (skipping node, script, and options)
      const args = process.argv.slice(2);
      const command = args.find(arg => !arg.startsWith('-'));

      // Map commands to their missing arguments and helpful suggestions
      const commandHelp: Record<string, { args: string[]; suggestion: string }> = {
        'console': { args: ['page'], suggestion: "Use 'cdp-cli tabs' to see available pages." },
        'go': { args: ['page', 'action'], suggestion: "Use 'cdp-cli tabs' to see available pages." },
        'close': { args: ['idOrTitle'], suggestion: "Use 'cdp-cli tabs' to see available pages." },
        'snapshot': { args: ['page'], suggestion: "Use 'cdp-cli tabs' to see available pages." },
        'eval': { args: ['page', 'expression'], suggestion: "Use 'cdp-cli tabs' to see available pages." },
        'screenshot': { args: ['page', 'output'], suggestion: "Use 'cdp-cli tabs' to see available pages." },
        'network': { args: ['page'], suggestion: "Use 'cdp-cli tabs' to see available pages." },
        'click': { args: ['page', 'selector'], suggestion: "Use 'cdp-cli tabs' to see available pages." },
        'fill': { args: ['page', 'value', 'selector'], suggestion: "Use 'cdp-cli tabs' to see available pages." },
        'key': { args: ['page', 'key'], suggestion: "Use 'cdp-cli tabs' to see available pages." }
      };

      if (command && commandHelp[command]) {
        const { args, suggestion } = commandHelp[command];
        const argsList = args.map(a => `'${a}'`).join(', ');
        console.error(`Error: Missing required argument${args.length > 1 ? 's' : ''}: ${argsList}\n`);
        console.error(suggestion);
        console.error(`\nRun "cdp-cli ${command} --help" for usage information.`);
        process.exit(1);
      }
    }

    // Default error handling
    if (msg) {
      console.error(`Error: ${msg}\n`);
    }
    if (err) {
      console.error(err.message);
    }
    console.error('Run "cdp-cli --help" for usage information.');
    process.exit(1);
  })
  .help()
  .alias('help', 'h')
  .epilog('<page> can be a page ID or a substring of the page title. Use "cdp-cli tabs" to list pages.');

// Page management commands
cli.command(
  'tabs',
  'List all open browser pages',
  {},
  async (argv) => {
    const context = new CDPContext(argv['cdp-url'] as string);
    await pages.listPages(context);
  }
);

cli.command(
  'new [url]',
  'Create a new page/tab',
  (yargs) => {
    return yargs.positional('url', {
      describe: 'URL to navigate to',
      type: 'string'
    });
  },
  async (argv) => {
    const context = new CDPContext(argv['cdp-url'] as string);
    await pages.newPage(context, argv.url as string | undefined);
  }
);

cli.command(
  'go <page> <action>',
  'Navigate page (URL, back, forward, reload)',
  (yargs) => {
    return yargs
      .positional('page', {
        describe: 'Page ID or title',
        type: 'string'
      })
      .positional('action', {
        describe: 'URL or action (back, forward, reload)',
        type: 'string'
      });
  },
  async (argv) => {
    const context = new CDPContext(argv['cdp-url'] as string);
    await pages.navigate(
      context,
      argv.action as string,
      argv.page as string
    );
  }
);

cli.command(
  'close <idOrTitle>',
  'Close a page',
  (yargs) => {
    return yargs.positional('idOrTitle', {
      describe: 'Page ID or title',
      type: 'string'
    });
  },
  async (argv) => {
    const context = new CDPContext(argv['cdp-url'] as string);
    await pages.closePage(context, argv.idOrTitle as string);
  }
);

// Launch command
cli.command(
  'launch',
  'Launch Chrome with remote debugging (macOS only)',
  (yargs) => {
    return yargs.option('port', {
      type: 'number',
      description: 'Remote debugging port',
      alias: 'p'
    });
  },
  async (argv) => {
    const port = (argv.port as number | undefined) ?? getDefaultPort();
    await launch.launchChrome({ port });
  }
);

// Debug commands
cli.command(
  'console <page>',
  'List console messages',
  (yargs) => {
    return yargs
      .positional('page', {
        describe: 'Page ID or title',
        type: 'string'
      })
      .option('type', {
        type: 'string',
        description: 'Filter by message type (log, error, warn, info)',
        alias: 't'
      })
      .option('duration', {
        type: 'number',
        description: 'Collection duration in seconds',
        alias: 'd',
        default: 0.1
      })
      .option('tail', {
        type: 'number',
        description: 'Limit to last N messages (default: 10, use -1 for all)',
        alias: 'n',
        default: 10
      })
      .option('all', {
        type: 'boolean',
        description: 'Show all messages (equivalent to --tail -1)',
        default: false
      })
      .option('with-type', {
        type: 'boolean',
        description: 'Include message type field',
        default: false
      })
      .option('with-timestamp', {
        type: 'boolean',
        description: 'Include timestamp field',
        default: false
      })
      .option('with-source', {
        type: 'boolean',
        description: 'Include source location (url, line number)',
        default: false
      })
      .option('verbose', {
        type: 'boolean',
        description: 'Include all fields (type, timestamp, source location)',
        alias: 'v',
        default: false
      })
      .option('inspect', {
        type: 'boolean',
        description: 'Fully expand all objects and arrays in output',
        alias: 'i',
        default: false
      });
  },
  async (argv) => {
    const context = new CDPContext(argv['cdp-url'] as string);
    const verbose = argv.verbose as boolean;
    await debug.listConsole(context, {
      type: argv.type as string | undefined,
      page: argv.page as string,
      duration: argv.duration as number,
      tail: argv.all ? -1 : (argv.tail as number),
      withType: verbose || (argv['with-type'] as boolean),
      withTimestamp: verbose || (argv['with-timestamp'] as boolean),
      withSource: verbose || (argv['with-source'] as boolean),
      inspect: argv.inspect as boolean
    });
  }
);

cli.command(
  'snapshot <page>',
  'Take a page snapshot',
  (yargs) => {
    return yargs
      .positional('page', {
        describe: 'Page ID or title',
        type: 'string'
      })
      .option('format', {
        type: 'string',
        description: 'Snapshot format (ax, text, dom)',
        alias: 'f',
        default: 'ax'
      });
  },
  async (argv) => {
    const context = new CDPContext(argv['cdp-url'] as string);
    await debug.snapshot(context, {
      format: argv.format as string,
      page: argv.page as string
    });
  }
);

cli.command(
  'eval <page> <expression>',
  'Evaluate JavaScript expression',
  (yargs) => {
    return yargs
      .positional('page', {
        describe: 'Page ID or title',
        type: 'string'
      })
      .positional('expression', {
        describe: 'JavaScript expression to evaluate',
        type: 'string'
      });
  },
  async (argv) => {
    const context = new CDPContext(argv['cdp-url'] as string);
    await debug.evaluate(context, argv.expression as string, {
      page: argv.page as string
    });
  }
);

cli.command(
  'screenshot <page> <output>',
  'Take a screenshot',
  (yargs) => {
    return yargs
      .positional('page', {
        describe: 'Page ID or title',
        type: 'string'
      })
      .positional('output', {
        describe: 'Output file path',
        type: 'string'
      })
      .option('format', {
        type: 'string',
        description: 'Image format (jpeg, png, webp)',
        alias: 'f',
        default: 'jpeg'
      })
      .option('quality', {
        type: 'number',
        description: 'JPEG quality (0-100)',
        alias: 'q',
        default: 90
      });
  },
  async (argv) => {
    const context = new CDPContext(argv['cdp-url'] as string);
    await debug.screenshot(context, {
      output: argv.output as string,
      format: argv.format as string,
      quality: argv.quality as number,
      page: argv.page as string
    });
  }
);

// Network commands
cli.command(
  'network <page>',
  'List network requests',
  (yargs) => {
    return yargs
      .positional('page', {
        describe: 'Page ID or title',
        type: 'string'
      })
      .option('type', {
        type: 'string',
        description: 'Filter by request type (xhr, fetch, script, etc)',
        alias: 't'
      })
      .option('duration', {
        type: 'number',
        description: 'Collection duration in seconds',
        alias: 'd',
        default: 0.1
      });
  },
  async (argv) => {
    const context = new CDPContext(argv['cdp-url'] as string);
    await network.listNetwork(context, {
      type: argv.type as string | undefined,
      page: argv.page as string,
      duration: argv.duration as number
    });
  }
);

// Input commands
cli.command(
  'click <page> [selector]',
  'Click an element',
  (yargs) => {
    return yargs
      .positional('page', {
        describe: 'Page ID or title',
        type: 'string'
      })
      .positional('selector', {
        describe: 'CSS selector (or use --node)',
        type: 'string'
      })
      .option('node', {
        type: 'number',
        description: 'Backend DOM node ID (from snapshot)',
        alias: 'n'
      })
      .option('double', {
        type: 'boolean',
        description: 'Perform double click',
        alias: 'd',
        default: false
      })
      .option('user-gesture', {
        type: 'boolean',
        description: 'Use user gesture activation (required for WebXR, fullscreen, etc.)',
        alias: 'g',
        default: false
      })
      .option('wait', {
        type: 'number',
        description: 'Wait timeout in ms for selector to appear',
        alias: 'w'
      })
      .option('text', {
        type: 'string',
        description: 'Match element by visible text instead of CSS selector'
      })
      .option('match', {
        type: 'string',
        description: 'Text matching strategy (exact, contains, regex)',
        choices: ['exact', 'contains', 'regex'] as const,
        default: 'exact'
      })
      .option('case-sensitive', {
        type: 'boolean',
        description: 'Treat text match as case-sensitive',
        default: false
      })
      .option('nth', {
        type: 'number',
        description: 'Select the Nth match when multiple elements match',
        coerce: (value: unknown) => {
          if (value === undefined || value === null || value === '') {
            return undefined;
          }
          const num = Number(value);
          if (!Number.isInteger(num) || num < 1) {
            throw new Error('--nth must be a positive integer');
          }
          return num;
        }
      })
      .check((argv) => {
        const hasSelector = typeof argv.selector === 'string' && argv.selector.length > 0;
        const hasText = typeof argv.text === 'string' && argv.text.length > 0;
        const hasNode = typeof argv.node === 'number';

        // Count how many options are provided
        const providedCount = [hasSelector, hasText, hasNode].filter(Boolean).length;

        if (providedCount === 0) {
          throw new Error('Provide either a CSS selector, --text, or --node');
        }
        if (providedCount > 1) {
          throw new Error('CSS selector, --text, and --node are mutually exclusive');
        }
        return true;
      });
  },
  async (argv) => {
    const context = new CDPContext(argv['cdp-url'] as string);
    await input.click(
      context,
      {
        selector: argv.selector as string | undefined,
        node: argv.node as number | undefined,
        text: argv.text as string | undefined,
        match: argv.match as 'exact' | 'contains' | 'regex',
        caseSensitive: argv.caseSensitive as boolean,
        nth: argv.nth as number | undefined
      },
      {
        page: argv.page as string,
        double: argv.double as boolean,
        userGesture: argv['user-gesture'] as boolean,
        wait: argv.wait as number | undefined,
      }
    );
  }
);

cli.command(
  'fill <page> <value> [selector]',
  'Fill an input element',
  (yargs) => {
    return yargs
      .positional('page', {
        describe: 'Page ID or title',
        type: 'string'
      })
      .positional('value', {
        describe: 'Value to fill',
        type: 'string'
      })
      .positional('selector', {
        describe: 'CSS selector (or use --node)',
        type: 'string'
      })
      .option('node', {
        type: 'number',
        description: 'Backend DOM node ID (from snapshot)',
        alias: 'n'
      })
      .check((argv) => {
        if (!argv.selector && !argv.node) {
          throw new Error('Either <selector> or --node must be provided');
        }
        return true;
      });
  },
  async (argv) => {
    const context = new CDPContext(argv['cdp-url'] as string);
    await input.fill(
      context,
      argv.selector as string | undefined,
      argv.value as string,
      {
        page: argv.page as string,
        node: argv.node as number | undefined
      }
    );
  }
);

cli.command(
  'key <page> <key>',
  'Press a keyboard key',
  (yargs) => {
    return yargs
      .positional('page', {
        describe: 'Page ID or title',
        type: 'string'
      })
      .positional('key', {
        describe: 'Key name (enter, tab, escape, etc)',
        type: 'string'
      });
  },
  async (argv) => {
    const context = new CDPContext(argv['cdp-url'] as string);
    await input.pressKey(context, argv.key as string, {
      page: argv.page as string
    });
  }
);

// Parse and execute
cli.parse();
