/**
 * ServiceContainer Unit Tests
 */

import { ServiceContainer, createServiceToken } from '../../../src/infrastructure/ServiceContainer';
import { ServiceToken } from '../../../src/types';

interface ITestService {
  getValue(): string;
}

interface ITestServiceWithDep {
  getDerivedValue(): string;
}

class TestService implements ITestService {
  getValue(): string {
    return 'test-value';
  }
}

class TestServiceWithDep implements ITestServiceWithDep {
  constructor(private testService: ITestService) {}

  getDerivedValue(): string {
    return `derived-${this.testService.getValue()}`;
  }
}

describe('ServiceContainer', () => {
  let container: ServiceContainer;

  const TestServiceToken = createServiceToken<ITestService>('TestService');
  const TestServiceWithDepToken = createServiceToken<ITestServiceWithDep>('TestServiceWithDep');

  beforeEach(() => {
    container = new ServiceContainer();
  });

  describe('registerInstance', () => {
    it('should register and resolve an instance', () => {
      const instance = new TestService();
      container.registerInstance(TestServiceToken, instance);

      const resolved = container.resolve(TestServiceToken);

      expect(resolved).toBe(instance);
      expect(resolved.getValue()).toBe('test-value');
    });

    it('should return the same instance on multiple resolves', () => {
      const instance = new TestService();
      container.registerInstance(TestServiceToken, instance);

      const resolved1 = container.resolve(TestServiceToken);
      const resolved2 = container.resolve(TestServiceToken);

      expect(resolved1).toBe(resolved2);
    });
  });

  describe('registerSingleton', () => {
    it('should create singleton from factory', () => {
      let callCount = 0;
      container.registerSingleton(TestServiceToken, () => {
        callCount++;
        return new TestService();
      });

      const resolved1 = container.resolve(TestServiceToken);
      const resolved2 = container.resolve(TestServiceToken);

      expect(callCount).toBe(1);
      expect(resolved1).toBe(resolved2);
    });

    it('should support dependencies via container', () => {
      container.registerSingleton(TestServiceToken, () => new TestService());
      container.registerSingleton(TestServiceWithDepToken, (c) => {
        const testService = c.resolve(TestServiceToken);
        return new TestServiceWithDep(testService);
      });

      const resolved = container.resolve(TestServiceWithDepToken);

      expect(resolved.getDerivedValue()).toBe('derived-test-value');
    });
  });

  describe('register (transient)', () => {
    it('should create new instance for each resolve', () => {
      let callCount = 0;
      container.register(TestServiceToken, () => {
        callCount++;
        return new TestService();
      });

      const resolved1 = container.resolve(TestServiceToken);
      const resolved2 = container.resolve(TestServiceToken);

      expect(callCount).toBe(2);
      expect(resolved1).not.toBe(resolved2);
    });
  });

  describe('isRegistered', () => {
    it('should return true for registered services', () => {
      container.registerInstance(TestServiceToken, new TestService());

      expect(container.isRegistered(TestServiceToken)).toBe(true);
    });

    it('should return false for unregistered services', () => {
      expect(container.isRegistered(TestServiceToken)).toBe(false);
    });
  });

  describe('resolve', () => {
    it('should throw for unregistered services', () => {
      expect(() => container.resolve(TestServiceToken)).toThrow();
    });
  });

  describe('tryResolve', () => {
    it('should return null for unregistered services', () => {
      const result = container.tryResolve(TestServiceToken);
      expect(result).toBeNull();
    });

    it('should return instance for registered services', () => {
      container.registerInstance(TestServiceToken, new TestService());
      const result = container.tryResolve(TestServiceToken);
      expect(result).not.toBeNull();
      expect(result?.getValue()).toBe('test-value');
    });
  });

  describe('createScope', () => {
    it('should create a new scope', () => {
      container.registerSingleton(TestServiceToken, () => new TestService());

      const scope = container.createScope();

      expect(scope).toBeDefined();
      expect(scope.resolve(TestServiceToken)).toBeDefined();
    });

    it('should resolve parent singletons in scope', () => {
      container.registerSingleton(TestServiceToken, () => new TestService());
      const parentInstance = container.resolve(TestServiceToken);

      const scope = container.createScope();
      const scopeInstance = scope.resolve(TestServiceToken);

      expect(scopeInstance).toBe(parentInstance);
    });

    it('should dispose when scope is disposed', () => {
      container.registerScoped(TestServiceToken, () => new TestService());

      const scope = container.createScope();
      const instance = scope.resolve(TestServiceToken);

      // Scope should be disposable
      expect(() => scope.dispose()).not.toThrow();
    });
  });

  describe('getRegisteredTokens', () => {
    it('should return all registered tokens', () => {
      container.registerInstance(TestServiceToken, new TestService());
      container.registerSingleton(TestServiceWithDepToken, () => new TestServiceWithDep(new TestService()));

      const tokens = container.getRegisteredTokens();

      // Note: ServiceContainer also registers itself, so there may be additional tokens
      expect(tokens).toContain(TestServiceToken);
      expect(tokens).toContain(TestServiceWithDepToken);
    });
  });
});
