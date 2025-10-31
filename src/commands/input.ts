/**
 * Input automation commands: click, fill, press-key
 */

import { CDPContext, type Page } from '../context.js';
import { outputError, outputSuccess } from '../output.js';

type TextMatchMode = 'exact' | 'contains' | 'regex';

interface ClickTargetInput {
  selector?: string;
  node?: number;
  text?: string;
  match?: TextMatchMode;
  caseSensitive?: boolean;
  nth?: number;
}

interface ElementMetadata {
  tagName: string;
  id: string | null;
  classes: string[];
  text: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface ElementMatch {
  nodeId: number;
  metadata: ElementMetadata;
}

class ClickError extends Error {
  code: string;
  details: Record<string, unknown>;

  constructor(message: string, code: string, details: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

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

function truncate(text: string, maxLength: number): string {
  if (maxLength <= 0) {
    return '';
  }
  if (text.length <= maxLength) {
    return text;
  }
  const sliceLength = Math.max(maxLength - 3, 0);
  const prefix = text.slice(0, sliceLength);
  return `${prefix}...`;
}

function normalizeMetadata(raw: any): ElementMetadata {
  const classes = Array.isArray(raw?.classes)
    ? raw.classes.filter((cls: unknown): cls is string => typeof cls === 'string')
    : [];
  const rectSource = raw?.rect ?? {};
  const toNumber = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const tagName =
    typeof raw?.tagName === 'string' ? raw.tagName.toLowerCase() : '';

  return {
    tagName,
    id: typeof raw?.id === 'string' && raw.id.length > 0 ? raw.id : null,
    classes,
    text: typeof raw?.text === 'string' ? raw.text : '',
    rect: {
      x: toNumber(rectSource.x),
      y: toNumber(rectSource.y),
      width: toNumber(rectSource.width),
      height: toNumber(rectSource.height)
    }
  };
}

function summarizeMatches(matches: ElementMatch[]): Array<{
  index: number;
  tagName: string;
  id: string | null;
  classes: string[];
  text: string;
  rect: ElementMetadata['rect'];
}> {
  return matches.map((match, index) => ({
    index: index + 1,
    tagName: match.metadata.tagName,
    id: match.metadata.id,
    classes: match.metadata.classes,
    text: truncate(match.metadata.text, 160),
    rect: roundRect(match.metadata.rect)
  }));
}

function roundRect(rect: ElementMetadata['rect']): ElementMetadata['rect'] {
  const roundValue = (value: number): number =>
    Number.isFinite(value) ? Math.round(value) : 0;

  return {
    x: roundValue(rect.x),
    y: roundValue(rect.y),
    width: roundValue(rect.width),
    height: roundValue(rect.height)
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function safeReleaseObject(
  context: CDPContext,
  ws: any,
  objectId?: string
): Promise<void> {
  if (!objectId) {
    return;
  }
  try {
    await context.sendCommand(ws, 'Runtime.releaseObject', { objectId });
  } catch {
    // Ignore release errors – the target may already be gone.
  }
}

async function getElementMetadataFromObjectId(
  context: CDPContext,
  ws: any,
  objectId: string
): Promise<ElementMetadata> {
  try {
    const callResult = await context.sendCommand(ws, 'Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: `
        function() {
          const rect = this.getBoundingClientRect();
          const classList = this.classList ? Array.from(this.classList) : [];
          const textContent = (this.innerText || '').trim();
          return {
            tagName: (this.tagName || '').toLowerCase(),
            id: this.id || null,
            classes: classList,
            text: textContent,
            rect: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            }
          };
        }
      `,
      returnByValue: true
    });
    return normalizeMetadata(callResult.result?.value);
  } finally {
    await safeReleaseObject(context, ws, objectId);
  }
}

async function getElementMetadataForNode(
  context: CDPContext,
  ws: any,
  nodeId: number
): Promise<ElementMetadata> {
  const resolved = await context.sendCommand(ws, 'DOM.resolveNode', { nodeId });
  const objectId = resolved.object?.objectId;

  if (!objectId) {
    const described = await context.sendCommand(ws, 'DOM.describeNode', {
      nodeId,
      depth: 0,
      pierce: false
    });
    const attributes = Array.isArray(described.node?.attributes)
      ? described.node.attributes
      : [];
    const attrMap: Record<string, string> = {};
    for (let i = 0; i < attributes.length; i += 2) {
      attrMap[attributes[i]] = attributes[i + 1];
    }

    return normalizeMetadata({
      tagName: typeof described.node?.nodeName === 'string'
        ? described.node.nodeName.toLowerCase()
        : '',
      id: attrMap.id ?? null,
      classes: (attrMap.class || '')
        .split(/\s+/)
        .filter(Boolean),
      text: '',
      rect: {
        x: 0,
        y: 0,
        width: 0,
        height: 0
      }
    });
  }

  return getElementMetadataFromObjectId(context, ws, objectId);
}

async function resolveBySelector(
  context: CDPContext,
  ws: any,
  selector: string
): Promise<ElementMatch[]> {
  const doc = await context.sendCommand(ws, 'DOM.getDocument');
  const result = await context.sendCommand(ws, 'DOM.querySelectorAll', {
    nodeId: doc.root.nodeId,
    selector
  });

  const nodeIds: number[] = Array.isArray(result.nodeIds)
    ? result.nodeIds
    : typeof (result as { nodeId?: number }).nodeId === 'number'
      ? [ (result as { nodeId: number }).nodeId ]
      : [];

  const matches: ElementMatch[] = [];

  for (const nodeId of nodeIds) {
    const metadata = await getElementMetadataForNode(context, ws, nodeId);
    matches.push({ nodeId, metadata });
  }

  return matches;
}

async function resolveByNodeId(
  context: CDPContext,
  ws: any,
  node: number
): Promise<ElementMatch[]> {
  const { nodeId } = await resolveBackendNode(context, ws, node);
  const metadata = await getElementMetadataForNode(context, ws, nodeId);
  return [{ nodeId, metadata }];
}

function buildTextSearchExpression(
  text: string,
  match: TextMatchMode,
  caseSensitive: boolean
): string {
  const serializedText = JSON.stringify(text);
  const serializedMatch = JSON.stringify(match);
  const caseFlag = caseSensitive ? 'true' : 'false';

  return `
(() => {
  const pattern = ${serializedText};
  const mode = ${serializedMatch};
  const caseSensitive = ${caseFlag};
  let normalizedPattern = pattern;
  const results = [];
  const seen = new Set();
  let regex = null;
  const actionableSelector = 'button,[role="button"],li.item,[class*="-btn"],input[type="submit"],input[type="button"],input[type="reset"],input[type="checkbox"],input[type="radio"],a[href],textarea,select,label,summary';

  if (mode === 'regex') {
    try {
      regex = new RegExp(pattern, caseSensitive ? '' : 'i');
    } catch (error) {
      return { error: error.message };
    }
  } else if (!caseSensitive && typeof pattern === 'string') {
    normalizedPattern = pattern.toLowerCase();
  }

  const root = document.body || document.documentElement;
  if (!root) {
    return { matches: [] };
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const el = walker.currentNode;
    if (!el) continue;

    const textContent = (el.innerText || '').trim();
    if (!textContent) continue;

    let isMatch = false;
    if (mode === 'regex') {
      if (!regex) continue;
      isMatch = regex.test(textContent);
    } else {
      const candidate = caseSensitive ? textContent : textContent.toLowerCase();
      if (mode === 'contains') {
        isMatch = candidate.includes(normalizedPattern);
      } else {
        isMatch = candidate === normalizedPattern;
      }
    }

    if (isMatch) {
      const actionable = el.closest(actionableSelector);
      const directMatch = el.matches && el.matches(actionableSelector);
      const target = actionable || (directMatch ? el : null);
      if (!target || seen.has(target)) continue;

      const rect = target.getBoundingClientRect();
      const hasLayout = rect && (rect.width !== 0 || rect.height !== 0);
      if (!hasLayout) continue;

      seen.add(target);
      results.push(target);
    }
  }

  return { matches: results };
})()
  `.trim();
}

async function resolveByText(
  context: CDPContext,
  ws: any,
  target: ClickTargetInput
): Promise<ElementMatch[]> {
  const text = target.text ?? '';
  const matchMode: TextMatchMode = target.match ?? 'exact';
  const caseSensitive = target.caseSensitive ?? false;

  const expression = buildTextSearchExpression(text, matchMode, caseSensitive);
  const evaluation = await context.sendCommand(ws, 'Runtime.evaluate', {
    expression,
    returnByValue: false,
    awaitPromise: false
  });

  if (evaluation.exceptionDetails) {
    const message =
      evaluation.exceptionDetails.text ||
      evaluation.exceptionDetails.exception?.description ||
      'Runtime evaluation failed';
    throw new ClickError(message, 'CLICK_TEXT_SEARCH_ERROR', {
      text,
      match: matchMode,
      caseSensitive
    });
  }

  const evalResult = evaluation.result;
  const containerId = evalResult?.objectId;

  if (!containerId) {
    const errorMessage =
      typeof evalResult?.value === 'object' && evalResult?.value !== null
        ? (evalResult.value as Record<string, unknown>).error
        : undefined;

    if (typeof errorMessage === 'string') {
      throw new ClickError(
        `Invalid text pattern: ${errorMessage}`,
        'CLICK_TEXT_SEARCH_ERROR',
        { text, match: matchMode, caseSensitive }
      );
    }

    return [];
  }

  let matchesObjectId: string | undefined;
  let searchError: string | undefined;

  try {
    const containerProps = await context.sendCommand(
      ws,
      'Runtime.getProperties',
      {
        objectId: containerId,
        ownProperties: true
      }
    );

    for (const descriptor of containerProps.result ?? []) {
      if (descriptor.name === 'error' && descriptor.value) {
        const value = descriptor.value.value;
        if (typeof value === 'string') {
          searchError = value;
        }
      }
      if (descriptor.name === 'matches' && descriptor.value?.objectId) {
        matchesObjectId = descriptor.value.objectId;
      }
    }
  } finally {
    await safeReleaseObject(context, ws, containerId);
  }

  if (typeof searchError === 'string' && searchError.length > 0) {
    throw new ClickError(
      `Invalid text pattern: ${searchError}`,
      'CLICK_TEXT_SEARCH_ERROR',
      { text, match: matchMode, caseSensitive }
    );
  }

  if (!matchesObjectId) {
    return [];
  }

  const matches: ElementMatch[] = [];

  try {
    const matchesProps = await context.sendCommand(
      ws,
      'Runtime.getProperties',
      {
        objectId: matchesObjectId,
        ownProperties: true
      }
    );

    for (const descriptor of matchesProps.result ?? []) {
      if (!/^\d+$/.test(descriptor.name)) {
        continue;
      }
      const remote = descriptor.value;
      if (!remote?.objectId) {
        continue;
      }

      const objId = remote.objectId;
      const requested = await context.sendCommand(ws, 'DOM.requestNode', {
        objectId: objId
      });

      if (typeof requested?.nodeId !== 'number') {
        await safeReleaseObject(context, ws, objId);
        continue;
      }

      const metadata = await getElementMetadataFromObjectId(
        context,
        ws,
        objId
      );

      matches.push({
        nodeId: requested.nodeId,
        metadata
      });
    }
  } finally {
    await safeReleaseObject(context, ws, matchesObjectId);
  }

  const unique: ElementMatch[] = [];
  const seenKeys = new Set<string>();

  for (const match of matches) {
    const { nodeId, metadata } = match;
    const rect = metadata.rect;
    const key = [
      nodeId,
      metadata.tagName,
      metadata.id ?? '',
      metadata.classes.join(' '),
      rect.x.toFixed(4),
      rect.y.toFixed(4),
      rect.width.toFixed(4),
      rect.height.toFixed(4),
      truncate(metadata.text, 32)
    ].join('|');

    if (seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);
    unique.push(match);
  }

  return unique;
}

async function resolveTargetCandidates(
  context: CDPContext,
  ws: any,
  target: ClickTargetInput
): Promise<ElementMatch[]> {
  if (target.selector) {
    return resolveBySelector(context, ws, target.selector);
  }

  if (target.text) {
    return resolveByText(context, ws, target);
  }

  if (target.node) {
    return resolveByNodeId(context, ws, target.node);
  }

  return [];
}

async function waitForTargetCandidates(
  context: CDPContext,
  ws: any,
  target: ClickTargetInput,
  timeout: number,
  pollInterval: number = 100
): Promise<ElementMatch[]> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const matches = await resolveTargetCandidates(context, ws, target);

    if (matches.length > 0) {
      return matches;
    }

    await new Promise(r => setTimeout(r, pollInterval));
  }

  // Return empty array if timeout reached - caller will handle the error
  return [];
}


/**
 * Click an element by selector or backendNodeId or text match
 */
export async function click(
  context: CDPContext,
  targetInput: ClickTargetInput | string,
  optionsInput: { page: string; double?: boolean; userGesture?: boolean; wait?: number, longpress?: number }
): Promise<void> {
  let ws;
  const target: ClickTargetInput =
    typeof targetInput === 'string'
      ? { selector: targetInput }
      : { ...targetInput };
  const options = { ...optionsInput };
  const longpressSeconds =
    typeof options.longpress === 'number' && Number.isFinite(options.longpress)
      ? Math.max(0, options.longpress)
      : 0;
  const longpressMs = longpressSeconds > 0 ? longpressSeconds * 1000 : 0;

  try {
    if (options.double && longpressSeconds > 0) {
      throw new ClickError(
        'Double click cannot be combined with long press',
        'CLICK_INVALID_OPTIONS',
        {
          double: options.double,
          longpress: longpressSeconds
        }
      );
    }

    let page: Page;
    try {
      page = await context.findPage(options.page);
    } catch (primaryError) {
      const candidatePageId = target.selector;

      if (!candidatePageId) {
        throw primaryError;
      }

      try {
        const resolvedPage = await context.findPage(candidatePageId);
        const originalSelector = options.page;

        options.page = candidatePageId;
        target.selector = originalSelector;
        page = resolvedPage;
      } catch {
        throw primaryError;
      }
    }

    ws = await context.connect(page);

    await context.sendCommand(ws, 'DOM.enable');
    await context.sendCommand(ws, 'Runtime.enable');

    const matches = options.wait ?
      await waitForTargetCandidates(context, ws, target,options.wait):
      await resolveTargetCandidates(context, ws, target);

    if (matches.length === 0) {
      const message = target.selector
        ? `Element not found: ${target.selector}`
        : target.text
          ? `No element matched text "${target.text}"`
          : `Node not found: ${target.node}`;

      throw new ClickError(
        message,
        'CLICK_NOT_FOUND',
        {
          selector: target.selector,
          text: target.text,
          node: target.node,
          match: target.selector ? undefined : target.match ?? 'exact',
          caseSensitive: target.caseSensitive ?? false
        }
      );
    }

    let selectedIndex = 0;
    if (typeof target.nth === 'number') {
      if (target.nth < 1 || target.nth > matches.length) {
        throw new ClickError(
          `--nth ${target.nth} is out of range (1-${matches.length})`,
          'CLICK_NTH_OUT_OF_RANGE',
          {
            selector: target.selector,
            text: target.text,
            requestedNth: target.nth,
            match: target.selector ? undefined : target.match ?? 'exact',
            caseSensitive: target.caseSensitive ?? false,
            matches: summarizeMatches(matches)
          }
        );
      }
      selectedIndex = target.nth - 1;
    } else if (matches.length > 1) {
      throw new ClickError(
        'Multiple elements matched. Use --nth to choose one.',
        'CLICK_AMBIGUOUS',
        {
          selector: target.selector,
          text: target.text,
          match: target.selector ? undefined : target.match ?? 'exact',
          caseSensitive: target.caseSensitive ?? false,
          matches: summarizeMatches(matches)
        }
      );
    }

    const chosen = matches[selectedIndex];
    const rect = chosen.metadata.rect;

    if (options.userGesture) {
      // Use JavaScript execution with userGesture flag for activation-gated APIs
      const resolved = await context.sendCommand(ws, 'DOM.resolveNode', {
        nodeId: chosen.nodeId
      });

      if (!resolved.object?.objectId) {
        throw new ClickError(
          'Failed to resolve element for user gesture click',
          'CLICK_RESOLVE_FAILED',
          {
            selector: target.selector,
            text: target.text,
            node: target.node
          }
        );
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

      if (result.exceptionDetails) {
        throw new ClickError(
          'Click execution failed',
          'CLICK_EXECUTION_FAILED',
          {
            selector: target.selector,
            text: target.text,
            node: target.node,
            exception: result.exceptionDetails
          }
        );
      }

      outputSuccess('Click performed with user gesture', {
        strategy: target.selector ? 'css' : target.text ? 'text' : 'node',
        selector: target.selector ?? null,
        text: target.text ?? null,
        node: target.node ?? null,
        match: target.selector ? undefined : target.match ?? 'exact',
        caseSensitive: target.caseSensitive ?? false,
        index: selectedIndex + 1,
        totalMatches: matches.length,
        userGesture: true,
        double: options.double || false,
        element: result.result?.value
      });
    } else {
      // Standard click using Input.dispatchMouseEvent
      if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y)) {
        throw new ClickError(
          'Matched element has invalid layout coordinates',
          'CLICK_NO_LAYOUT',
          {
            selector: target.selector,
            text: target.text,
            match: target.selector ? undefined : target.match ?? 'exact',
            caseSensitive: target.caseSensitive ?? false,
            rect: roundRect(rect)
          }
        );
      }

      const width = Number.isFinite(rect.width) ? rect.width : 0;
      const height = Number.isFinite(rect.height) ? rect.height : 0;

      if (width === 0 && height === 0) {
        throw new ClickError(
          'Matched element has no visible area to click',
          'CLICK_NO_HITBOX',
          {
            selector: target.selector,
            text: target.text,
            match: target.selector ? undefined : target.match ?? 'exact',
            caseSensitive: target.caseSensitive ?? false,
            rect: roundRect(rect)
          }
        );
      }

      const x = rect.x + width / 2;
      const y = rect.y + height / 2;
      const xRounded = Math.round(x);
      const yRounded = Math.round(y);
      const roundedRect = roundRect(rect);

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

      if (longpressMs > 0) {
        await delay(longpressMs);
      }

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
        strategy: target.selector ? 'css' : target.text ? 'text' : 'node',
        selector: target.selector ?? null,
        text: target.text ?? null,
        node: target.node ?? null,
        match: target.selector ? undefined : target.match ?? 'exact',
        caseSensitive: target.caseSensitive ?? false,
        index: selectedIndex + 1,
        totalMatches: matches.length,
        x: xRounded,
        y: yRounded,
        rect: roundedRect,
        double: options.double || false,
        longpress: longpressSeconds
      });
    }
  } catch (error) {
    if (error instanceof ClickError) {
      outputError(error.message, error.code, error.details);
    } else {
      outputError(
        (error as Error).message,
        'CLICK_FAILED',
        {
          selector: target.selector,
          text: target.text,
          match: target.selector ? undefined : target.match ?? 'exact',
          caseSensitive: target.caseSensitive ?? false
        }
      );
    }
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
