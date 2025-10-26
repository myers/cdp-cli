/**
 * Page management commands
 */

import { CDPContext, Page } from '../context.js';
import { outputLines, outputLine, outputError, outputSuccess } from '../output.js';

/**
 * List all open pages
 */
export async function listPages(context: CDPContext): Promise<void> {
  try {
    const pages = await context.getPages();

    const output = pages.map(page => ({
      id: page.id,
      title: page.title,
      url: page.url,
      type: page.type
    }));

    outputLines(output);
  } catch (error) {
    outputError(
      (error as Error).message,
      'LIST_PAGES_FAILED',
      { error: String(error) }
    );
    process.exit(1);
  }
}

/**
 * Create a new page
 */
export async function newPage(
  context: CDPContext,
  url?: string
): Promise<void> {
  try {
    const page = await context.createPage(url);

    outputSuccess('Page created', {
      id: page.id,
      title: page.title,
      url: page.url
    });
  } catch (error) {
    outputError(
      (error as Error).message,
      'NEW_PAGE_FAILED',
      { url }
    );
    process.exit(1);
  }
}

/**
 * Navigate page (or back/forward/reload)
 */
export async function navigate(
  context: CDPContext,
  action: string,
  pageIdOrTitle: string
): Promise<void> {
  let ws;
  try {
    // Get page to navigate
    const page = await context.findPage(pageIdOrTitle);

    // Connect to page
    ws = await context.connect(page);

    // Enable Page domain
    await context.sendCommand(ws, 'Page.enable');

    // Perform navigation action
    if (action === 'back') {
      const history = await context.sendCommand(ws, 'Page.getNavigationHistory');
      if (history.currentIndex > 0) {
        await context.sendCommand(ws, 'Page.navigateToHistoryEntry', {
          entryId: history.entries[history.currentIndex - 1].id
        });
      } else {
        throw new Error('Cannot navigate back: already at oldest page');
      }
    } else if (action === 'forward') {
      const history = await context.sendCommand(ws, 'Page.getNavigationHistory');
      if (history.currentIndex < history.entries.length - 1) {
        await context.sendCommand(ws, 'Page.navigateToHistoryEntry', {
          entryId: history.entries[history.currentIndex + 1].id
        });
      } else {
        throw new Error('Cannot navigate forward: already at newest page');
      }
    } else if (action === 'reload') {
      await context.sendCommand(ws, 'Page.reload');
    } else {
      // Assume it's a URL
      await context.sendCommand(ws, 'Page.navigate', { url: action });
    }

    outputSuccess('Navigation complete', {
      action,
      page: page.id
    });
  } catch (error) {
    outputError(
      (error as Error).message,
      'NAVIGATE_FAILED',
      { action, page: pageIdOrTitle }
    );
    process.exit(1);
  } finally {
    if (ws) {
      ws.close();
    }
  }
}

/**
 * Close a page
 */
export async function closePage(
  context: CDPContext,
  idOrTitle: string
): Promise<void> {
  try {
    const page = await context.findPage(idOrTitle);
    await context.closePage(page);

    outputSuccess('Page closed', {
      id: page.id,
      title: page.title
    });
  } catch (error) {
    outputError(
      (error as Error).message,
      'CLOSE_PAGE_FAILED',
      { idOrTitle }
    );
    process.exit(1);
  }
}
