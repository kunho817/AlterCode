/**
 * SemanticAnalyzerService Unit Tests
 */

import {
  SemanticAnalyzerService,
  createSemanticAnalyzerService,
} from '../../../src/knowledge/SemanticAnalyzerService';
import { CodeRegion } from '../../../src/types';
import { createFilePath, createLineNumber } from '../testUtils';

describe('SemanticAnalyzerService', () => {
  let service: SemanticAnalyzerService;

  beforeEach(() => {
    service = new SemanticAnalyzerService();
  });

  describe('analyzeFile - TypeScript', () => {
    it('should identify function declarations', () => {
      const filePath = createFilePath('/src/test.ts');
      const content = `
function greet(name: string) {
  return \`Hello, \${name}!\`;
}
`;

      const regions = service.analyzeFile(filePath, content);

      const functionRegion = regions.find((r) => r.type === 'function' && r.name === 'greet');
      expect(functionRegion).toBeDefined();
    });

    it('should identify class declarations', () => {
      const filePath = createFilePath('/src/test.ts');
      const content = `
class User {
  constructor(public name: string) {}

  greet() {
    return \`Hello, \${this.name}!\`;
  }
}
`;

      const regions = service.analyzeFile(filePath, content);

      const classRegion = regions.find((r) => r.type === 'class' && r.name === 'User');
      expect(classRegion).toBeDefined();
    });

    it('should identify interface declarations', () => {
      const filePath = createFilePath('/src/test.ts');
      const content = `
interface Person {
  name: string;
  age: number;
}
`;

      const regions = service.analyzeFile(filePath, content);

      const interfaceRegion = regions.find((r) => r.type === 'interface' && r.name === 'Person');
      expect(interfaceRegion).toBeDefined();
    });

    it('should identify type aliases', () => {
      const filePath = createFilePath('/src/test.ts');
      const content = `
type UserId = string;
type UserMap = Map<UserId, User>;
`;

      const regions = service.analyzeFile(filePath, content);

      const typeRegions = regions.filter((r) => r.type === 'type_definition');
      expect(typeRegions.length).toBe(2);
    });

    it('should identify imports as a single region', () => {
      const filePath = createFilePath('/src/test.ts');
      const content = `
import { foo } from './foo';
import { bar } from './bar';
import * as utils from './utils';

function main() {}
`;

      const regions = service.analyzeFile(filePath, content);

      const importRegion = regions.find((r) => r.type === 'imports');
      expect(importRegion).toBeDefined();
    });

    it('should cache results', () => {
      const filePath = createFilePath('/src/test.ts');
      const content = `function test() {}`;

      const regions1 = service.analyzeFile(filePath, content);
      const regions2 = service.analyzeFile(filePath, content);

      // Should return same cached result
      expect(regions1).toEqual(regions2);
    });

    it('should invalidate cache when content changes', () => {
      const filePath = createFilePath('/src/test.ts');
      const content1 = `function test1() {}`;
      const content2 = `function test2() {}`;

      const regions1 = service.analyzeFile(filePath, content1);
      const regions2 = service.analyzeFile(filePath, content2);

      expect(regions1[0]!.name).toBe('test1');
      expect(regions2[0]!.name).toBe('test2');
    });
  });

  describe('analyzeFile - JavaScript', () => {
    it('should analyze JavaScript files', () => {
      const filePath = createFilePath('/src/test.js');
      const content = `
function add(a, b) {
  return a + b;
}

class Calculator {
  add(a, b) { return a + b; }
}
`;

      const regions = service.analyzeFile(filePath, content);

      expect(regions.some((r) => r.type === 'function' && r.name === 'add')).toBe(true);
      expect(regions.some((r) => r.type === 'class' && r.name === 'Calculator')).toBe(true);
    });
  });

  describe('analyzeFile - Python (regex)', () => {
    it('should identify Python functions', () => {
      const filePath = createFilePath('/src/test.py');
      const content = `
def greet(name):
    return f"Hello, {name}!"

async def async_greet(name):
    return f"Hello, {name}!"
`;

      const regions = service.analyzeFile(filePath, content);

      const functionRegions = regions.filter((r) => r.type === 'function');
      expect(functionRegions.length).toBeGreaterThanOrEqual(1);
    });

    it('should identify Python classes', () => {
      const filePath = createFilePath('/src/test.py');
      const content = `
class User:
    def __init__(self, name):
        self.name = name
`;

      const regions = service.analyzeFile(filePath, content);

      const classRegion = regions.find((r) => r.type === 'class' && r.name === 'User');
      expect(classRegion).toBeDefined();
    });

    it('should identify Python imports', () => {
      const filePath = createFilePath('/src/test.py');
      const content = `
import os
from pathlib import Path
import sys

def main():
    pass
`;

      const regions = service.analyzeFile(filePath, content);

      const importRegion = regions.find((r) => r.type === 'imports');
      expect(importRegion).toBeDefined();
    });
  });

  describe('analyzeFile - unsupported language', () => {
    it('should fall back to line-based chunking', () => {
      const filePath = createFilePath('/src/test.unknown');
      const content = 'line1\nline2\nline3\nline4\nline5\n';

      const regions = service.analyzeFile(filePath, content);

      // Should create line-based chunks
      expect(regions.length).toBeGreaterThanOrEqual(1);
      expect(regions[0]!.type).toBe('other');
    });
  });

  describe('regionsOverlap', () => {
    it('should return true for overlapping regions', () => {
      const filePath = createFilePath('/src/test.ts');

      const region1: CodeRegion = {
        id: 'r1',
        filePath,
        type: 'function',
        name: 'func1',
        startLine: createLineNumber(1),
        endLine: createLineNumber(10),
        dependencies: [],
        modifiedBy: null,
      };

      const region2: CodeRegion = {
        id: 'r2',
        filePath,
        type: 'function',
        name: 'func2',
        startLine: createLineNumber(5),
        endLine: createLineNumber(15),
        dependencies: [],
        modifiedBy: null,
      };

      expect(service.regionsOverlap(region1, region2)).toBe(true);
    });

    it('should return false for non-overlapping regions', () => {
      const filePath = createFilePath('/src/test.ts');

      const region1: CodeRegion = {
        id: 'r1',
        filePath,
        type: 'function',
        name: 'func1',
        startLine: createLineNumber(1),
        endLine: createLineNumber(10),
        dependencies: [],
        modifiedBy: null,
      };

      const region2: CodeRegion = {
        id: 'r2',
        filePath,
        type: 'function',
        name: 'func2',
        startLine: createLineNumber(11),
        endLine: createLineNumber(20),
        dependencies: [],
        modifiedBy: null,
      };

      expect(service.regionsOverlap(region1, region2)).toBe(false);
    });

    it('should return false for regions in different files', () => {
      const region1: CodeRegion = {
        id: 'r1',
        filePath: createFilePath('/src/file1.ts'),
        type: 'function',
        name: 'func1',
        startLine: createLineNumber(1),
        endLine: createLineNumber(10),
        dependencies: [],
        modifiedBy: null,
      };

      const region2: CodeRegion = {
        id: 'r2',
        filePath: createFilePath('/src/file2.ts'),
        type: 'function',
        name: 'func2',
        startLine: createLineNumber(1),
        endLine: createLineNumber(10),
        dependencies: [],
        modifiedBy: null,
      };

      expect(service.regionsOverlap(region1, region2)).toBe(false);
    });
  });

  describe('findRegionsAtPosition', () => {
    it('should find all regions containing a position', () => {
      const filePath = createFilePath('/src/test.ts');

      const regions: CodeRegion[] = [
        {
          id: 'r1',
          filePath,
          type: 'class',
          name: 'MyClass',
          startLine: createLineNumber(1),
          endLine: createLineNumber(20),
          dependencies: [],
          modifiedBy: null,
        },
        {
          id: 'r2',
          filePath,
          type: 'function',
          name: 'method',
          startLine: createLineNumber(5),
          endLine: createLineNumber(10),
          dependencies: [],
          modifiedBy: null,
        },
        {
          id: 'r3',
          filePath,
          type: 'function',
          name: 'otherMethod',
          startLine: createLineNumber(12),
          endLine: createLineNumber(18),
          dependencies: [],
          modifiedBy: null,
        },
      ];

      const found = service.findRegionsAtPosition(filePath, createLineNumber(7), regions);

      expect(found.length).toBe(2);
      expect(found.some((r) => r.name === 'MyClass')).toBe(true);
      expect(found.some((r) => r.name === 'method')).toBe(true);
    });

    it('should return empty array for position with no regions', () => {
      const filePath = createFilePath('/src/test.ts');

      const regions: CodeRegion[] = [
        {
          id: 'r1',
          filePath,
          type: 'function',
          name: 'func',
          startLine: createLineNumber(10),
          endLine: createLineNumber(20),
          dependencies: [],
          modifiedBy: null,
        },
      ];

      const found = service.findRegionsAtPosition(filePath, createLineNumber(5), regions);

      expect(found.length).toBe(0);
    });
  });

  describe('getMostSpecificRegion', () => {
    it('should return the smallest region at a position', () => {
      const filePath = createFilePath('/src/test.ts');

      const regions: CodeRegion[] = [
        {
          id: 'r1',
          filePath,
          type: 'class',
          name: 'MyClass',
          startLine: createLineNumber(1),
          endLine: createLineNumber(50),
          dependencies: [],
          modifiedBy: null,
        },
        {
          id: 'r2',
          filePath,
          type: 'function',
          name: 'method',
          startLine: createLineNumber(10),
          endLine: createLineNumber(20),
          dependencies: [],
          modifiedBy: null,
        },
      ];

      const result = service.getMostSpecificRegion(filePath, createLineNumber(15), regions);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('method'); // Smaller region
    });

    it('should return null for position with no regions', () => {
      const filePath = createFilePath('/src/test.ts');

      const result = service.getMostSpecificRegion(filePath, createLineNumber(100), []);

      expect(result).toBeNull();
    });
  });

  describe('assignRegionsToWorkers', () => {
    it('should assign regions to workers', () => {
      const regions: CodeRegion[] = [
        {
          id: 'r1',
          filePath: createFilePath('/src/file1.ts'),
          type: 'function',
          name: 'func1',
          startLine: createLineNumber(1),
          endLine: createLineNumber(10),
          dependencies: [],
          modifiedBy: null,
        },
        {
          id: 'r2',
          filePath: createFilePath('/src/file1.ts'),
          type: 'function',
          name: 'func2',
          startLine: createLineNumber(11),
          endLine: createLineNumber(20),
          dependencies: [],
          modifiedBy: null,
        },
        {
          id: 'r3',
          filePath: createFilePath('/src/file2.ts'),
          type: 'function',
          name: 'func3',
          startLine: createLineNumber(1),
          endLine: createLineNumber(10),
          dependencies: [],
          modifiedBy: null,
        },
      ];

      const assignments = service.assignRegionsToWorkers(regions, 2);

      expect(assignments.size).toBe(2);

      // Regions from same file should be assigned to same worker
      const worker0Regions = assignments.get(0)!;
      const worker1Regions = assignments.get(1)!;

      // file1 regions should be together
      const file1InWorker0 = worker0Regions.filter((r) => (r.filePath as string).includes('file1'));
      const file1InWorker1 = worker1Regions.filter((r) => (r.filePath as string).includes('file1'));

      // All file1 regions should be in one worker only
      expect(file1InWorker0.length === 0 || file1InWorker1.length === 0).toBe(true);
    });

    it('should create empty arrays for workers with no regions', () => {
      const regions: CodeRegion[] = [
        {
          id: 'r1',
          filePath: createFilePath('/src/file1.ts'),
          type: 'function',
          name: 'func1',
          startLine: createLineNumber(1),
          endLine: createLineNumber(10),
          dependencies: [],
          modifiedBy: null,
        },
      ];

      const assignments = service.assignRegionsToWorkers(regions, 3);

      expect(assignments.size).toBe(3);
      expect(assignments.get(0)!.length).toBeGreaterThanOrEqual(0);
      expect(assignments.get(1)!.length).toBeGreaterThanOrEqual(0);
      expect(assignments.get(2)!.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('isSupported', () => {
    it('should return true for TypeScript files', () => {
      expect(service.isSupported(createFilePath('/src/test.ts'))).toBe(true);
      expect(service.isSupported(createFilePath('/src/test.tsx'))).toBe(true);
    });

    it('should return true for JavaScript files', () => {
      expect(service.isSupported(createFilePath('/src/test.js'))).toBe(true);
      expect(service.isSupported(createFilePath('/src/test.jsx'))).toBe(true);
    });

    it('should return true for Python files', () => {
      expect(service.isSupported(createFilePath('/src/test.py'))).toBe(true);
    });

    it('should return true for Rust files', () => {
      expect(service.isSupported(createFilePath('/src/test.rs'))).toBe(true);
    });

    it('should return true for Go files', () => {
      expect(service.isSupported(createFilePath('/src/test.go'))).toBe(true);
    });

    it('should return false for unsupported files', () => {
      expect(service.isSupported(createFilePath('/src/test.unknown'))).toBe(false);
      expect(service.isSupported(createFilePath('/src/test.txt'))).toBe(false);
    });
  });

  describe('getSupportedExtensions', () => {
    it('should return all supported extensions', () => {
      const extensions = service.getSupportedExtensions();

      expect(extensions).toContain('.ts');
      expect(extensions).toContain('.tsx');
      expect(extensions).toContain('.js');
      expect(extensions).toContain('.jsx');
      expect(extensions).toContain('.py');
      expect(extensions).toContain('.rs');
      expect(extensions).toContain('.go');
    });
  });

  describe('createSemanticAnalyzerService factory', () => {
    it('should create a new instance', () => {
      const analyzer = createSemanticAnalyzerService();
      expect(analyzer).toBeInstanceOf(SemanticAnalyzerService);
    });
  });
});
