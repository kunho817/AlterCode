/**
 * Result Type Unit Tests
 */

import { Ok, Err, isOk, isErr, AppError } from '../../../src/types';

describe('Result Type', () => {
  describe('Ok', () => {
    it('should create a successful result', () => {
      const result = Ok(42);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
    });

    it('should work with complex types', () => {
      const data = { name: 'test', value: 123 };
      const result = Ok(data);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(data);
      }
    });

    it('should work with undefined', () => {
      const result = Ok(undefined);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeUndefined();
      }
    });
  });

  describe('Err', () => {
    it('should create an error result', () => {
      const error = new AppError('TEST', 'Test error');
      const result = Err(error);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(error);
      }
    });

    it('should preserve error details', () => {
      const error = new AppError('TEST', 'Test error message', 'verification');
      const result = Err(error);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('TEST');
        expect(result.error.message).toBe('Test error message');
        expect(result.error.category).toBe('verification');
      }
    });
  });

  describe('isOk', () => {
    it('should return true for Ok results', () => {
      const result = Ok(42);

      expect(isOk(result)).toBe(true);
    });

    it('should return false for Err results', () => {
      const result = Err(new AppError('TEST', 'Error'));

      expect(isOk(result)).toBe(false);
    });

    it('should narrow type correctly', () => {
      const result = Ok(42);

      if (isOk(result)) {
        // TypeScript should allow accessing .value here
        const value: number = result.value;
        expect(value).toBe(42);
      }
    });
  });

  describe('isErr', () => {
    it('should return true for Err results', () => {
      const result = Err(new AppError('TEST', 'Error'));

      expect(isErr(result)).toBe(true);
    });

    it('should return false for Ok results', () => {
      const result = Ok(42);

      expect(isErr(result)).toBe(false);
    });

    it('should narrow type correctly', () => {
      const result = Err(new AppError('TEST', 'Error'));

      if (isErr(result)) {
        // TypeScript should allow accessing .error here
        const error: AppError = result.error;
        expect(error.code).toBe('TEST');
      }
    });
  });

  describe('Result pattern matching', () => {
    it('should work with if/else pattern', () => {
      const successResult = Ok(42);
      const errorResult = Err(new AppError('TEST', 'Error'));

      // Success case
      if (successResult.ok) {
        expect(successResult.value).toBe(42);
      } else {
        fail('Should be successful');
      }

      // Error case
      if (errorResult.ok) {
        fail('Should be error');
      } else {
        expect(errorResult.error.code).toBe('TEST');
      }
    });
  });
});

describe('AppError', () => {
  describe('constructor', () => {
    it('should create error with required fields', () => {
      const error = new AppError('CODE', 'Error message');

      expect(error.code).toBe('CODE');
      expect(error.message).toBe('Error message');
      expect(error.category).toBe('execution'); // default
    });

    it('should accept optional category', () => {
      const error = new AppError('CODE', 'Message', 'verification');

      expect(error.category).toBe('verification');
    });

    it('should accept optional cause', () => {
      const cause = new Error('Original error');
      const error = new AppError('CODE', 'Message', 'execution', cause);

      expect(error.cause).toBe(cause);
    });
  });

  describe('toJSON', () => {
    it('should serialize error to JSON', () => {
      const error = new AppError('TEST', 'Test message', 'verification');
      const json = error.toJSON();

      expect(json.code).toBe('TEST');
      expect(json.message).toBe('Test message');
      expect(json.category).toBe('verification');
      expect(json.timestamp).toBeDefined();
    });

    it('should include cause message when present', () => {
      const cause = new Error('Cause message');
      const error = new AppError('TEST', 'Message', 'execution', cause);
      const json = error.toJSON();

      expect(json.cause).toBe('Cause message');
    });
  });

  describe('inheritance', () => {
    it('should be an instance of Error', () => {
      const error = new AppError('TEST', 'Message');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
    });

    it('should have proper stack trace', () => {
      const error = new AppError('TEST', 'Message');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
    });
  });
});
