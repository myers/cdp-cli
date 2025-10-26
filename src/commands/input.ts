/**
 * Input automation commands: click, fill, press-key
 */

import { CDPContext, Page } from '../context.js';
import { outputError, outputSuccess } from '../output.js';

/**
 * Helper function to find element by selector
 */
async function findElement(
  context: CDPContext,
  ws: any,
  selector: string
): Promise<{ nodeId: number }> {
  await context.sendCommand(ws, 'DOM.enable');
  const doc = await context.sendCommand(ws, 'DOM.getDocument');
  const node = await context.sendCommand(ws, 'DOM.querySelector', {
    nodeId: doc.root.nodeId,
    selector
  });

  if (!node.nodeId) {
    throw new Error(`Element not found: ${selector}`);
  }

  return { nodeId: node.nodeId };
}

/**
 * Get box model for an element
 */
async function getBoxModel(
  context: CDPContext,
  ws: any,
  nodeId: number
): Promise<any> {
  const boxModel = await context.sendCommand(ws, 'DOM.getBoxModel', {
    nodeId
  });
  return boxModel;
}

/**
 * Click an element by selector
 */
export async function click(
  context: CDPContext,
  selector: string,
  options: { page: string; double?: boolean }
): Promise<void> {
  let ws;
  try {
    // Get page
    const page = await context.findPage(options.page);

    ws = await context.connect(page);

    // Find element
    const { nodeId } = await findElement(context, ws, selector);

    // Get element position
    const boxModel = await getBoxModel(context, ws, nodeId);
    const quad = boxModel.model.content;

    // Calculate center point
    const x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
    const y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;

    // Enable Input domain
    await context.sendCommand(ws, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y
    });

    await context.sendCommand(ws, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: 1
    });

    await context.sendCommand(ws, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount: 1
    });

    if (options.double) {
      await context.sendCommand(ws, 'Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x,
        y,
        button: 'left',
        clickCount: 2
      });

      await context.sendCommand(ws, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x,
        y,
        button: 'left',
        clickCount: 2
      });
    }

    outputSuccess('Click performed', {
      selector,
      x,
      y,
      double: options.double || false
    });
  } catch (error) {
    outputError(
      (error as Error).message,
      'CLICK_FAILED',
      { selector }
    );
    process.exit(1);
  } finally {
    if (ws) {
      ws.close();
    }
  }
}

/**
 * Fill an input element
 */
export async function fill(
  context: CDPContext,
  selector: string,
  value: string,
  options: { page: string }
): Promise<void> {
  let ws;
  try {
    // Get page
    const page = await context.findPage(options.page);

    ws = await context.connect(page);

    // Find element and focus it
    const { nodeId } = await findElement(context, ws, selector);
    await context.sendCommand(ws, 'DOM.focus', { nodeId });

    // Clear existing value using DOM API (safe from code injection)
    await context.sendCommand(ws, 'DOM.setAttributeValue', {
      nodeId,
      name: 'value',
      value: ''
    });

    // Type the value
    for (const char of value) {
      await context.sendCommand(ws, 'Input.dispatchKeyEvent', {
        type: 'keyDown',
        text: char
      });

      await context.sendCommand(ws, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
        text: char
      });
    }

    outputSuccess('Fill performed', {
      selector,
      value
    });
  } catch (error) {
    outputError(
      (error as Error).message,
      'FILL_FAILED',
      { selector, value }
    );
    process.exit(1);
  } finally {
    if (ws) {
      ws.close();
    }
  }
}

/**
 * Press a keyboard key
 */
export async function pressKey(
  context: CDPContext,
  key: string,
  options: { page: string }
): Promise<void> {
  let ws;
  try {
    // Get page
    const page = await context.findPage(options.page);

    ws = await context.connect(page);

    // Map common key names
    const keyMap: Record<string, string> = {
      'enter': 'Enter',
      'tab': 'Tab',
      'escape': 'Escape',
      'backspace': 'Backspace',
      'delete': 'Delete',
      'arrowup': 'ArrowUp',
      'arrowdown': 'ArrowDown',
      'arrowleft': 'ArrowLeft',
      'arrowright': 'ArrowRight',
      'space': ' '
    };

    const keyValue = keyMap[key.toLowerCase()] || key;

    await context.sendCommand(ws, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: keyValue
    });

    await context.sendCommand(ws, 'Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: keyValue
    });

    outputSuccess('Key pressed', {
      key: keyValue
    });
  } catch (error) {
    outputError(
      (error as Error).message,
      'PRESS_KEY_FAILED',
      { key }
    );
    process.exit(1);
  } finally {
    if (ws) {
      ws.close();
    }
  }
}
