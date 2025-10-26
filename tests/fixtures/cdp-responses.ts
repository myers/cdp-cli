/**
 * Sample CDP responses for testing
 */

export const samplePages = [
  {
    id: 'page1',
    title: 'Example Domain',
    url: 'https://example.com',
    type: 'page',
    webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/page1'
  },
  {
    id: 'page2',
    title: 'GitHub',
    url: 'https://github.com',
    type: 'page',
    webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/page2'
  },
  {
    id: 'page3',
    title: 'Google',
    url: 'https://google.com',
    type: 'page',
    webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/page3'
  }
];

export const consoleMessages = {
  log: {
    method: 'Runtime.consoleAPICalled',
    params: {
      type: 'log',
      args: [{ type: 'string', value: 'Hello world' }],
      timestamp: 1698234567890
    }
  },
  error: {
    method: 'Runtime.consoleAPICalled',
    params: {
      type: 'error',
      args: [{ type: 'string', value: 'Error occurred' }],
      timestamp: 1698234568000
    }
  },
  exception: {
    method: 'Runtime.exceptionThrown',
    params: {
      timestamp: 1698234569000,
      exceptionDetails: {
        text: 'TypeError: Cannot read property',
        lineNumber: 42,
        url: 'https://example.com/app.js'
      }
    }
  }
};

export const networkEvents = {
  requestWillBeSent: {
    method: 'Network.requestWillBeSent',
    params: {
      requestId: 'req1',
      request: {
        url: 'https://api.example.com/data',
        method: 'GET',
        headers: {
          'User-Agent': 'Chrome'
        }
      },
      timestamp: 1698234567.890,
      type: 'fetch'
    }
  },
  responseReceived: {
    method: 'Network.responseReceived',
    params: {
      requestId: 'req1',
      response: {
        url: 'https://api.example.com/data',
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        },
        encodedDataLength: 4567
      }
    }
  },
  loadingFinished: {
    method: 'Network.loadingFinished',
    params: {
      requestId: 'req1',
      encodedDataLength: 4567
    }
  }
};

export const domResponses = {
  getDocument: {
    root: {
      nodeId: 1,
      nodeName: 'HTML',
      nodeType: 1
    }
  },
  querySelector: {
    nodeId: 42
  },
  getBoxModel: {
    model: {
      content: [100, 100, 200, 100, 200, 200, 100, 200]
    }
  }
};

export const pageResponses = {
  navigate: {
    frameId: 'frame123',
    loaderId: 'loader456'
  },
  getNavigationHistory: {
    currentIndex: 1,
    entries: [
      { id: 1, url: 'https://example.com', title: 'Example' },
      { id: 2, url: 'https://example.com/page1', title: 'Page 1' },
      { id: 3, url: 'https://example.com/page2', title: 'Page 2' }
    ]
  },
  captureScreenshot: {
    data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  }
};

export const runtimeResponses = {
  evaluate: {
    result: {
      type: 'string',
      value: 'test result'
    }
  },
  evaluateWithException: {
    exceptionDetails: {
      text: 'ReferenceError: foo is not defined',
      lineNumber: 1,
      columnNumber: 1
    }
  }
};

export const accessibilityResponses = {
  getFullAXTree: {
    nodes: [
      {
        nodeId: 'ax1',
        role: { type: 'role', value: 'WebArea' },
        name: { type: 'computedString', value: 'Example Domain' }
      },
      {
        nodeId: 'ax2',
        role: { type: 'role', value: 'heading' },
        name: { type: 'computedString', value: 'Example Domain' }
      }
    ]
  }
};
