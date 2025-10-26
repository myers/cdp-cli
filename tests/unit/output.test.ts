/**
 * Tests for output formatting (NDJSON)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { outputLine, outputLines, outputError, outputSuccess, outputRaw } from '../../src/output.js';
import { captureConsoleOutput } from '../helpers.js';

describe('Output Formatting', () => {
  let capture: ReturnType<typeof captureConsoleOutput>;

  beforeEach(() => {
    capture = captureConsoleOutput();
  });

  afterEach(() => {
    capture.restore();
  });

  describe('outputLine', () => {
    it('should output single JSON object', () => {
      outputLine({ foo: 'bar', num: 42 });

      const logs = capture.getLogs();
      expect(logs).toHaveLength(1);
      expect(JSON.parse(logs[0])).toEqual({ foo: 'bar', num: 42 });
    });

    it('should output compact JSON by default', () => {
      outputLine({ foo: 'bar' });

      const logs = capture.getLogs();
      expect(logs[0]).toBe('{"foo":"bar"}');
    });

    it('should output pretty JSON when requested', () => {
      outputLine({ foo: 'bar' }, { pretty: true });

      const logs = capture.getLogs();
      expect(logs[0]).toContain('\n');
      expect(logs[0]).toContain('  "foo"');
    });
  });

  describe('outputLines', () => {
    it('should output multiple NDJSON lines', () => {
      outputLines([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' }
      ]);

      const logs = capture.getLogs();
      expect(logs).toHaveLength(2);
      expect(JSON.parse(logs[0])).toEqual({ id: 1, name: 'Alice' });
      expect(JSON.parse(logs[1])).toEqual({ id: 2, name: 'Bob' });
    });

    it('should handle empty array', () => {
      outputLines([]);

      const logs = capture.getLogs();
      expect(logs).toHaveLength(0);
    });
  });

  describe('outputError', () => {
    it('should output error with message and code', () => {
      outputError('Something went wrong', 'ERROR_CODE', { detail: 'info' });

      const logs = capture.getLogs();
      expect(logs).toHaveLength(1);

      const error = JSON.parse(logs[0]);
      expect(error.error).toBe(true);
      expect(error.message).toBe('Something went wrong');
      expect(error.code).toBe('ERROR_CODE');
      expect(error.details).toEqual({ detail: 'info' });
    });

    it('should work without extra data', () => {
      outputError('Failed', 'FAIL');

      const logs = capture.getLogs();
      const error = JSON.parse(logs[0]);
      expect(error.error).toBe(true);
      expect(error.message).toBe('Failed');
      expect(error.code).toBe('FAIL');
    });
  });

  describe('outputSuccess', () => {
    it('should output success message with data', () => {
      outputSuccess('Operation completed', { id: '123', count: 5 });

      const logs = capture.getLogs();
      expect(logs).toHaveLength(1);

      const success = JSON.parse(logs[0]);
      expect(success.success).toBe(true);
      expect(success.message).toBe('Operation completed');
      expect(success.data).toEqual({ id: '123', count: 5 });
    });
  });

  describe('outputRaw', () => {
    it('should output raw string without JSON formatting', () => {
      outputRaw('Plain text output');

      const logs = capture.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toBe('Plain text output');
    });

    it('should preserve whitespace and formatting', () => {
      outputRaw('Line 1\nLine 2\n  Indented');

      const logs = capture.getLogs();
      expect(logs[0]).toBe('Line 1\nLine 2\n  Indented');
    });
  });
});
