/**
 * SemanticAnalyzer Unit Tests
 */

import { SemanticAnalyzer } from '../../../src/conflict/SemanticAnalyzer';
import { RegionType } from '../../../src/types';
import { createSampleTypeScriptFile } from '../../mocks/factories';

describe('SemanticAnalyzer', () => {
  let analyzer: SemanticAnalyzer;

  beforeEach(() => {
    analyzer = new SemanticAnalyzer();
  });

  describe('analyzeFile', () => {
    describe('TypeScript files', () => {
      it('should identify imports', () => {
        const content = `import { Logger } from './logger';
import * as path from 'path';`;

        const regions = analyzer.analyzeFile('test.ts', content);

        const imports = regions.find(r => r.type === RegionType.IMPORTS);
        expect(imports).toBeDefined();
        expect(imports?.name).toBe('imports');
        expect(imports?.startLine).toBe(1);
        expect(imports?.endLine).toBe(2);
      });

      it('should identify functions', () => {
        const content = `function add(a: number, b: number): number {
  return a + b;
}

async function fetchData(): Promise<void> {
  await fetch('/api');
}`;

        const regions = analyzer.analyzeFile('test.ts', content);

        const functions = regions.filter(r => r.type === RegionType.FUNCTION);
        expect(functions.length).toBe(2);
        expect(functions[0].name).toBe('add');
        expect(functions[1].name).toBe('fetchData');
      });

      it('should identify classes', () => {
        const content = `class UserService {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  getUser(id: string): User {
    return { id, name: 'Test' };
  }
}`;

        const regions = analyzer.analyzeFile('test.ts', content);

        const classes = regions.filter(r => r.type === RegionType.CLASS);
        expect(classes.length).toBe(1);
        expect(classes[0].name).toBe('UserService');
      });

      it('should identify interfaces', () => {
        const content = `interface User {
  id: string;
  name: string;
}

interface Config {
  debug: boolean;
}`;

        const regions = analyzer.analyzeFile('test.ts', content);

        const interfaces = regions.filter(r => r.type === RegionType.INTERFACE);
        expect(interfaces.length).toBe(2);
        expect(interfaces[0].name).toBe('User');
        expect(interfaces[1].name).toBe('Config');
      });

      it('should identify type aliases', () => {
        const content = `type UserId = string;
type Callback = (result: any) => void;`;

        const regions = analyzer.analyzeFile('test.ts', content);

        const types = regions.filter(r => r.type === RegionType.TYPE_DEFINITION);
        expect(types.length).toBe(2);
        expect(types[0].name).toBe('UserId');
        expect(types[1].name).toBe('Callback');
      });

      it('should identify exports', () => {
        const content = `export const CONFIG = { debug: true };
export default class App {}`;

        const regions = analyzer.analyzeFile('test.ts', content);

        const exports = regions.filter(r =>
          r.type === RegionType.EXPORT || r.type === RegionType.VARIABLE
        );
        expect(exports.length).toBeGreaterThanOrEqual(1);
      });

      it('should analyze a complete TypeScript file', () => {
        const content = createSampleTypeScriptFile();
        const regions = analyzer.analyzeFile('test.ts', content);

        expect(regions.length).toBeGreaterThan(0);

        // Should have imports
        const imports = regions.find(r => r.type === RegionType.IMPORTS);
        expect(imports).toBeDefined();

        // Should have interface
        const interfaces = regions.filter(r => r.type === RegionType.INTERFACE);
        expect(interfaces.length).toBe(1);
        expect(interfaces[0].name).toBe('User');

        // Should have class
        const classes = regions.filter(r => r.type === RegionType.CLASS);
        expect(classes.length).toBe(1);
        expect(classes[0].name).toBe('UserService');

        // Should have function
        const functions = regions.filter(r => r.type === RegionType.FUNCTION);
        expect(functions.length).toBe(1);
        expect(functions[0].name).toBe('createUserService');
      });
    });

    describe('JavaScript files', () => {
      it('should analyze .js files using TypeScript parser', () => {
        const content = `function hello() {
  console.log('Hello');
}`;

        const regions = analyzer.analyzeFile('test.js', content);

        const functions = regions.filter(r => r.type === RegionType.FUNCTION);
        expect(functions.length).toBe(1);
        expect(functions[0].name).toBe('hello');
      });
    });

    describe('Unknown file types', () => {
      it('should fall back to line-based analysis', () => {
        const content = 'line 1\nline 2\nline 3';

        const regions = analyzer.analyzeFile('test.xyz', content);

        expect(regions.length).toBeGreaterThan(0);
        expect(regions[0].type).toBe(RegionType.OTHER);
      });
    });
  });

  describe('regionsOverlap', () => {
    it('should detect overlapping regions', () => {
      const region1 = {
        id: '1',
        filePath: 'test.ts',
        type: RegionType.FUNCTION,
        name: 'func1',
        startLine: 1,
        endLine: 10,
        dependencies: [],
        modifiedBy: null,
      };

      const region2 = {
        id: '2',
        filePath: 'test.ts',
        type: RegionType.FUNCTION,
        name: 'func2',
        startLine: 5,
        endLine: 15,
        dependencies: [],
        modifiedBy: null,
      };

      expect(analyzer.regionsOverlap(region1, region2)).toBe(true);
    });

    it('should not detect overlap for non-overlapping regions', () => {
      const region1 = {
        id: '1',
        filePath: 'test.ts',
        type: RegionType.FUNCTION,
        name: 'func1',
        startLine: 1,
        endLine: 10,
        dependencies: [],
        modifiedBy: null,
      };

      const region2 = {
        id: '2',
        filePath: 'test.ts',
        type: RegionType.FUNCTION,
        name: 'func2',
        startLine: 11,
        endLine: 20,
        dependencies: [],
        modifiedBy: null,
      };

      expect(analyzer.regionsOverlap(region1, region2)).toBe(false);
    });

    it('should not detect overlap for different files', () => {
      const region1 = {
        id: '1',
        filePath: 'test1.ts',
        type: RegionType.FUNCTION,
        name: 'func1',
        startLine: 1,
        endLine: 10,
        dependencies: [],
        modifiedBy: null,
      };

      const region2 = {
        id: '2',
        filePath: 'test2.ts',
        type: RegionType.FUNCTION,
        name: 'func2',
        startLine: 1,
        endLine: 10,
        dependencies: [],
        modifiedBy: null,
      };

      expect(analyzer.regionsOverlap(region1, region2)).toBe(false);
    });
  });

  describe('assignRegionsToWorkers', () => {
    it('should distribute regions across workers', () => {
      const content = createSampleTypeScriptFile();
      const regions = analyzer.analyzeFile('test.ts', content);

      const assignments = analyzer.assignRegionsToWorkers(regions, 3);

      expect(assignments.size).toBe(3);
      // All regions should be assigned
      let totalAssigned = 0;
      assignments.forEach((r) => { totalAssigned += r.length; });
      expect(totalAssigned).toBe(regions.length);
    });

    it('should keep same-file regions together', () => {
      const content1 = `function a() {}`;
      const content2 = `function b() {}`;

      const regions1 = analyzer.analyzeFile('file1.ts', content1);
      const regions2 = analyzer.analyzeFile('file2.ts', content2);

      const allRegions = [...regions1, ...regions2];
      const assignments = analyzer.assignRegionsToWorkers(allRegions, 2);

      // Each worker should have regions from a single file
      assignments.forEach((workerRegions) => {
        if (workerRegions.length > 0) {
          const firstFile = workerRegions[0].filePath;
          expect(workerRegions.every(r => r.filePath === firstFile)).toBe(true);
        }
      });
    });
  });

  describe('getDependentRegions', () => {
    it('should find regions that depend on a given region', () => {
      const regions = [
        {
          id: '1',
          filePath: 'test.ts',
          type: RegionType.INTERFACE,
          name: 'User',
          startLine: 1,
          endLine: 5,
          dependencies: [],
          modifiedBy: null,
        },
        {
          id: '2',
          filePath: 'test.ts',
          type: RegionType.FUNCTION,
          name: 'getUser',
          startLine: 7,
          endLine: 10,
          dependencies: ['User'],
          modifiedBy: null,
        },
        {
          id: '3',
          filePath: 'test.ts',
          type: RegionType.FUNCTION,
          name: 'unrelated',
          startLine: 12,
          endLine: 15,
          dependencies: [],
          modifiedBy: null,
        },
      ];

      const dependents = analyzer.getDependentRegions(regions[0], regions);

      expect(dependents.length).toBe(1);
      expect(dependents[0].name).toBe('getUser');
    });
  });
});
