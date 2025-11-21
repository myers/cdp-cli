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
 * Helper function to resolve backendNodeId to nodeId
 */
async function resolveBackendNode(
  context: CDPContext,
  ws: any,
  backendNodeId: number
): Promise<{ nodeId: number }> {
  await context.sendCommand(ws, 'DOM.enable');
  // Must request document first before pushNodesByBackendIdsToFrontend works
  await context.sendCommand(ws, 'DOM.getDocument');

  // Push the node to get a valid nodeId for this session
  const pushed = await context.sendCommand(ws, 'DOM.pushNodesByBackendIdsToFrontend', {
    backendNodeIds: [backendNodeId]
  });

  if (!pushed.nodeIds || pushed.nodeIds.length === 0 || pushed.nodeIds[0] === 0) {
    throw new Error(`Failed to resolve backendNodeId ${backendNodeId}`);
  }

  return { nodeId: pushed.nodeIds[0] };
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
 * Click an element by selector or backendNodeId
 */
export async function click(
  context: CDPContext,
  selector: string | undefined,
  options: { page: string; node?: number; double?: boolean; userGesture?: boolean }
): Promise<void> {
  let ws;
  try {
    // Get page
    const page = await context.findPage(options.page);

    ws = await context.connect(page);

    if (options.userGesture) {
      // Use Runtime.evaluate with userGesture for activation-gated APIs (WebXR, fullscreen, etc.)
      await context.sendCommand(ws, 'Runtime.enable');

      if (options.node) {
        // Click by backendNodeId using Runtime
        await context.sendCommand(ws, 'DOM.enable');
        await context.sendCommand(ws, 'DOM.getDocument');
        const resolved = await context.sendCommand(ws, 'DOM.resolveNode', {
          backendNodeId: options.node
        });

        if (!resolved.object?.objectId) {
          throw new Error(`Failed to resolve backendNodeId ${options.node}`);
        }

        const clickCount = options.double ? 2 : 1;
        const result = await context.sendCommand(ws, 'Runtime.callFunctionOn', {
          objectId: resolved.object.objectId,
          functionDeclaration: `function() {
            for (let i = 0; i < ${clickCount}; i++) {
              this.click();
            }
            return {
              success: true,
              tagName: this.tagName,
              id: this.id || null,
              className: this.className || null
            };
          }`,
          userGesture: true,
          returnByValue: true
        });

        if (result.result?.value?.error) {
          throw new Error(result.result.value.error);
        }

        outputSuccess('Click performed with user gesture', {
          node: options.node,
          userGesture: true,
          double: options.double || false,
          element: result.result?.value
        });
      } else {
        // Click by selector
        const escapedSelector = selector!.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

        const clickCount = options.double ? 2 : 1;
        const result = await context.sendCommand(ws, 'Runtime.evaluate', {
          expression: `
            (function() {
              const el = document.querySelector('${escapedSelector}');
              if (!el) {
                return { error: 'Element not found: ${escapedSelector}' };
              }
              // Perform click(s)
              for (let i = 0; i < ${clickCount}; i++) {
                el.click();
              }
              return {
                success: true,
                tagName: el.tagName,
                id: el.id || null,
                className: el.className || null
              };
            })();
          `,
          userGesture: true,
          returnByValue: true
        });

        if (result.result?.value?.error) {
          throw new Error(result.result.value.error);
        }

        outputSuccess('Click performed with user gesture', {
          selector,
          userGesture: true,
          double: options.double || false,
          element: result.result?.value
        });
      }
    } else {
      // Standard click using Input.dispatchMouseEvent
      // Find element by selector or backendNodeId
      const { nodeId } = options.node
        ? await resolveBackendNode(context, ws, options.node)
        : await findElement(context, ws, selector!);

      // Get element position
      const boxModel = await getBoxModel(context, ws, nodeId);
      const quad = boxModel.model.content;

      // Calculate center point
      const x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
      const y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;

      // Dispatch mouse events
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
        selector: selector || undefined,
        node: options.node || undefined,
        x,
        y,
        double: options.double || false
      });
    }
  } catch (error) {
    outputError(
      (error as Error).message,
      'CLICK_FAILED',
      { selector, node: options.node, page: options.page }
    );
    process.exit(1);
  } finally {
    if (ws) {
      ws.close();
    }
  }
}

/**
 * Fill an input element by selector or backendNodeId
 */
export async function fill(
  context: CDPContext,
  selector: string | undefined,
  value: string,
  options: { page: string; node?: number }
): Promise<void> {
  let ws;
  try {
    // Get page
    const page = await context.findPage(options.page);

    ws = await context.connect(page);

    // Find element by selector or backendNodeId and focus it
    const { nodeId } = options.node
      ? await resolveBackendNode(context, ws, options.node)
      : await findElement(context, ws, selector!);
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
      selector: selector || undefined,
      node: options.node || undefined,
      value
    });
  } catch (error) {
    outputError(
      (error as Error).message,
      'FILL_FAILED',
      { selector, node: options.node, value, page: options.page }
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
      { key, page: options.page }
    );
    process.exit(1);
  } finally {
    if (ws) {
      ws.close();
    }
  }
}
