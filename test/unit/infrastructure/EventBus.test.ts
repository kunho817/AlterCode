/**
 * EventBus Unit Tests
 */

import { EventBus } from '../../../src/infrastructure/EventBus';
import { BaseEvent } from '../../../src/types';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe('emit and on', () => {
    it('should emit events and call handlers', async () => {
      const handler = jest.fn();

      eventBus.on('test:event', handler);
      eventBus.emit('test:event', { data: 'value' });

      // Wait for async event processing
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'test:event',
          data: 'value',
        })
      );
    });

    it('should call multiple handlers for same event', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      eventBus.on('test:event', handler1);
      eventBus.on('test:event', handler2);
      eventBus.emit('test:event', {});

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should not call handlers for different events', async () => {
      const handler = jest.fn();

      eventBus.on('test:event1', handler);
      eventBus.emit('test:event2', {});

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('subscription.dispose', () => {
    it('should remove handler when disposed', async () => {
      const handler = jest.fn();

      const subscription = eventBus.on('test:event', handler);
      subscription.dispose();
      eventBus.emit('test:event', {});

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(handler).not.toHaveBeenCalled();
    });

    it('should only remove disposed handler', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      const subscription1 = eventBus.on('test:event', handler1);
      eventBus.on('test:event', handler2);
      subscription1.dispose();
      eventBus.emit('test:event', {});

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('off', () => {
    it('should remove all handlers for event type', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      eventBus.on('test:event', handler1);
      eventBus.on('test:event', handler2);
      eventBus.off('test:event');
      eventBus.emit('test:event', {});

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('once', () => {
    it('should call handler only once', async () => {
      const handler = jest.fn();

      eventBus.once('test:event', handler);
      eventBus.emit('test:event', {});
      eventBus.emit('test:event', {});

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('getHandlerCount', () => {
    it('should return correct count', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      expect(eventBus.getHandlerCount('test:event')).toBe(0);

      eventBus.on('test:event', handler1);
      expect(eventBus.getHandlerCount('test:event')).toBe(1);

      eventBus.on('test:event', handler2);
      expect(eventBus.getHandlerCount('test:event')).toBe(2);

      eventBus.off('test:event');
      expect(eventBus.getHandlerCount('test:event')).toBe(0);
    });
  });

  describe('getEventTypes', () => {
    it('should return all registered event types', () => {
      eventBus.on('test:event1', jest.fn());
      eventBus.on('test:event2', jest.fn());

      const types = eventBus.getEventTypes();

      expect(types).toContain('test:event1');
      expect(types).toContain('test:event2');
    });
  });

  describe('clear', () => {
    it('should remove all handlers', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      eventBus.on('test:event1', handler1);
      eventBus.on('test:event2', handler2);
      eventBus.clear();

      eventBus.emit('test:event1', {});
      eventBus.emit('test:event2', {});

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('waitFor', () => {
    it('should resolve when event is emitted', async () => {
      const promise = eventBus.waitFor<BaseEvent>('test:event');

      // Emit after a short delay
      setTimeout(() => {
        eventBus.emit('test:event', { data: 'test' });
      }, 10);

      const event = await promise;

      expect(event.type).toBe('test:event');
    });

    it('should reject on timeout', async () => {
      const promise = eventBus.waitFor('test:event', undefined, 50);

      await expect(promise).rejects.toThrow('Timeout');
    });

    it('should filter events with predicate', async () => {
      const promise = eventBus.waitFor<BaseEvent & { data: string }>(
        'test:event',
        (e) => e.data === 'target'
      );

      // Emit non-matching event first
      setTimeout(() => {
        eventBus.emit('test:event', { data: 'other' });
      }, 10);

      // Then emit matching event
      setTimeout(() => {
        eventBus.emit('test:event', { data: 'target' });
      }, 20);

      const event = await promise;

      expect(event.data).toBe('target');
    });
  });

  describe('error handling', () => {
    it('should not throw when handler throws', async () => {
      const errorHandler = jest.fn(() => {
        throw new Error('Handler error');
      });
      const normalHandler = jest.fn();

      eventBus.on('test:event', errorHandler);
      eventBus.on('test:event', normalHandler);

      // Should not throw
      expect(() => eventBus.emit('test:event', {})).not.toThrow();

      await new Promise(resolve => setTimeout(resolve, 10));

      // Both handlers should have been attempted
      expect(errorHandler).toHaveBeenCalled();
      expect(normalHandler).toHaveBeenCalled();
    });
  });

  describe('priority ordering', () => {
    it('should call higher priority handlers first', async () => {
      const callOrder: number[] = [];

      eventBus.on('test:event', () => { callOrder.push(1); }, { priority: 1 });
      eventBus.on('test:event', () => { callOrder.push(3); }, { priority: 3 });
      eventBus.on('test:event', () => { callOrder.push(2); }, { priority: 2 });

      eventBus.emit('test:event', {});

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(callOrder).toEqual([3, 2, 1]);
    });
  });
});
