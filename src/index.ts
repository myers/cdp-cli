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

// Read version from package.json
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8')
);
const version = packageJson.version;

const DEFAULT_CDP_URL = 'http://localhost:9222';

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
  .alias('version', 'v');

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
  'go <action> <page>',
  'Navigate page (URL, back, forward, reload)',
  (yargs) => {
    return yargs
      .positional('action', {
        describe: 'URL or action (back, forward, reload)',
        type: 'string'
      })
      .positional('page', {
        describe: 'Page ID or title',
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
      });
  },
  async (argv) => {
    const context = new CDPContext(argv['cdp-url'] as string);
    await debug.listConsole(context, {
      type: argv.type as string | undefined,
      page: argv.page as string,
      duration: argv.duration as number
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
        description: 'Snapshot format (text, dom, ax)',
        alias: 'f',
        default: 'text'
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
  'eval <expression> <page>',
  'Evaluate JavaScript expression',
  (yargs) => {
    return yargs
      .positional('expression', {
        describe: 'JavaScript expression to evaluate',
        type: 'string'
      })
      .positional('page', {
        describe: 'Page ID or title',
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
  'screenshot <page>',
  'Take a screenshot',
  (yargs) => {
    return yargs
      .positional('page', {
        describe: 'Page ID or title',
        type: 'string'
      })
      .option('output', {
        type: 'string',
        description: 'Output file path',
        alias: 'o'
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
      output: argv.output as string | undefined,
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
  'click <selector> <page>',
  'Click an element',
  (yargs) => {
    return yargs
      .positional('selector', {
        describe: 'CSS selector',
        type: 'string'
      })
      .positional('page', {
        describe: 'Page ID or title',
        type: 'string'
      })
      .option('double', {
        type: 'boolean',
        description: 'Perform double click',
        alias: 'd',
        default: false
      });
  },
  async (argv) => {
    const context = new CDPContext(argv['cdp-url'] as string);
    await input.click(context, argv.selector as string, {
      page: argv.page as string,
      double: argv.double as boolean
    });
  }
);

cli.command(
  'fill <selector> <value> <page>',
  'Fill an input element',
  (yargs) => {
    return yargs
      .positional('selector', {
        describe: 'CSS selector',
        type: 'string'
      })
      .positional('value', {
        describe: 'Value to fill',
        type: 'string'
      })
      .positional('page', {
        describe: 'Page ID or title',
        type: 'string'
      });
  },
  async (argv) => {
    const context = new CDPContext(argv['cdp-url'] as string);
    await input.fill(
      context,
      argv.selector as string,
      argv.value as string,
      {
        page: argv.page as string
      }
    );
  }
);

cli.command(
  'key <key> <page>',
  'Press a keyboard key',
  (yargs) => {
    return yargs
      .positional('key', {
        describe: 'Key name (enter, tab, escape, etc)',
        type: 'string'
      })
      .positional('page', {
        describe: 'Page ID or title',
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
