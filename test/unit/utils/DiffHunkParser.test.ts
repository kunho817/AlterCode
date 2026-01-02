/**
 * DiffHunkParser Unit Tests
 *
 * Tests for per-hunk approval workflow utilities
 */

import {
  parseDiff,
  applyHunks,
  reconstructDiff,
  generateDiff,
  getHunkStats,
  DiffHunk,
} from '../../../src/utils/DiffHunkParser';

describe('DiffHunkParser', () => {
  // Sample unified diff with multiple hunks
  const sampleDiff = `--- a/src/example.ts
+++ b/src/example.ts
@@ -1,5 +1,6 @@ function header
 import { foo } from 'bar';
+import { baz } from 'qux';

 export function example() {
   console.log('hello');
 }
@@ -10,7 +11,8 @@ function middle
 function helper() {
   const x = 1;
-  const y = 2;
+  const y = 3;
+  const z = 4;
   return x + y;
 }
@@ -25,4 +27,5 @@ function footer
 export function cleanup() {
   // cleanup code
-  console.log('done');
+  console.log('cleanup complete');
+  return true;
 }`;

  const originalContent = `import { foo } from 'bar';

export function example() {
  console.log('hello');
}

// some code

function helper() {
  const x = 1;
  const y = 2;
  return x + y;
}

// more code

export function cleanup() {
  // cleanup code
  console.log('done');
}`;

  // Helper to get hunk safely
  function getHunk(hunks: DiffHunk[], index: number): DiffHunk {
    const hunk = hunks[index];
    if (!hunk) {
      throw new Error(`Hunk at index ${index} not found`);
    }
    return hunk;
  }

  describe('parseDiff', () => {
    it('should parse file paths correctly', () => {
      const result = parseDiff(sampleDiff);

      expect(result.originalPath).toBe('a/src/example.ts');
      expect(result.modifiedPath).toBe('b/src/example.ts');
    });

    it('should parse multiple hunks', () => {
      const result = parseDiff(sampleDiff);

      expect(result.hunks).toHaveLength(3);
    });

    it('should parse hunk headers correctly', () => {
      const result = parseDiff(sampleDiff);
      const hunk0 = getHunk(result.hunks, 0);
      const hunk1 = getHunk(result.hunks, 1);

      // First hunk: @@ -1,5 +1,6 @@ function header
      expect(hunk0.originalStart).toBe(1);
      expect(hunk0.originalCount).toBe(5);
      expect(hunk0.modifiedStart).toBe(1);
      expect(hunk0.modifiedCount).toBe(6);
      expect(hunk0.context).toBe('function header');

      // Second hunk: @@ -10,7 +11,8 @@ function middle
      expect(hunk1.originalStart).toBe(10);
      expect(hunk1.originalCount).toBe(7);
      expect(hunk1.modifiedStart).toBe(11);
      expect(hunk1.modifiedCount).toBe(8);
      expect(hunk1.context).toBe('function middle');
    });

    it('should extract additions and removals', () => {
      const result = parseDiff(sampleDiff);
      const hunk0 = getHunk(result.hunks, 0);
      const hunk1 = getHunk(result.hunks, 1);

      // First hunk: 1 addition, 0 removals
      expect(hunk0.additions).toHaveLength(1);
      expect(hunk0.removals).toHaveLength(0);
      expect(hunk0.additions[0]).toBe("import { baz } from 'qux';");

      // Second hunk: 2 additions, 1 removal
      expect(hunk1.additions).toHaveLength(2);
      expect(hunk1.removals).toHaveLength(1);
      expect(hunk1.removals[0]).toBe('  const y = 2;');
      expect(hunk1.additions[0]).toBe('  const y = 3;');
      expect(hunk1.additions[1]).toBe('  const z = 4;');
    });

    it('should generate unique hunk IDs', () => {
      const result = parseDiff(sampleDiff);

      const ids = result.hunks.map(h => h.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should generate preview text', () => {
      const result = parseDiff(sampleDiff);
      const hunk0 = getHunk(result.hunks, 0);
      const hunk1 = getHunk(result.hunks, 1);

      // First hunk: only additions
      expect(hunk0.preview).toContain('function header');
      expect(hunk0.preview).toContain('+1');

      // Second hunk: additions and removals
      expect(hunk1.preview).toContain('function middle');
      expect(hunk1.preview).toContain('-1');
      expect(hunk1.preview).toContain('+2');
    });

    it('should handle empty diff', () => {
      const result = parseDiff('');

      expect(result.originalPath).toBe('');
      expect(result.modifiedPath).toBe('');
      expect(result.hunks).toHaveLength(0);
    });

    it('should handle diff with only file headers', () => {
      const diff = `--- a/file.ts
+++ b/file.ts`;

      const result = parseDiff(diff);

      expect(result.originalPath).toBe('a/file.ts');
      expect(result.modifiedPath).toBe('b/file.ts');
      expect(result.hunks).toHaveLength(0);
    });

    it('should handle hunk without count (single line)', () => {
      const diff = `--- a/file.ts
+++ b/file.ts
@@ -5 +5 @@
-old line
+new line`;

      const result = parseDiff(diff);
      const hunk0 = getHunk(result.hunks, 0);

      expect(result.hunks).toHaveLength(1);
      expect(hunk0.originalCount).toBe(1);
      expect(hunk0.modifiedCount).toBe(1);
    });
  });

  describe('reconstructDiff', () => {
    it('should reconstruct diff from hunks', () => {
      const parsed = parseDiff(sampleDiff);
      const reconstructed = reconstructDiff(
        parsed.originalPath,
        parsed.modifiedPath,
        parsed.hunks
      );

      // Should contain file headers
      expect(reconstructed).toContain('--- a/src/example.ts');
      expect(reconstructed).toContain('+++ b/src/example.ts');

      // Should contain all hunks
      expect(reconstructed).toContain('@@ -1,5 +1,6 @@');
      expect(reconstructed).toContain('@@ -10,7 +11,8 @@');
      expect(reconstructed).toContain('@@ -25,4 +27,5 @@');
    });

    it('should reconstruct partial diff with selected hunks', () => {
      const parsed = parseDiff(sampleDiff);
      const hunk0 = getHunk(parsed.hunks, 0);

      // Only include first hunk
      const reconstructed = reconstructDiff(
        parsed.originalPath,
        parsed.modifiedPath,
        [hunk0]
      );

      expect(reconstructed).toContain('@@ -1,5 +1,6 @@');
      expect(reconstructed).not.toContain('@@ -10,7 +11,8 @@');
      expect(reconstructed).not.toContain('@@ -25,4 +27,5 @@');
    });

    it('should return empty string for no hunks', () => {
      const result = reconstructDiff('a/file.ts', 'b/file.ts', []);

      expect(result).toBe('');
    });
  });

  describe('applyHunks', () => {
    // Simple content for testing
    const simpleOriginal = `line 1
line 2
line 3
line 4
line 5`;

    it('should apply single hunk correctly', () => {
      const diff = `--- a/file.txt
+++ b/file.txt
@@ -2,3 +2,4 @@
 line 2
-line 3
+line 3 modified
+line 3.5
 line 4`;

      const parsed = parseDiff(diff);
      const result = applyHunks(simpleOriginal, parsed.hunks);

      expect(result).toContain('line 3 modified');
      expect(result).toContain('line 3.5');
      expect(result).not.toContain('line 3\n');
    });

    it('should apply multiple hunks in order', () => {
      const diff = `--- a/file.txt
+++ b/file.txt
@@ -1,2 +1,2 @@
-line 1
+LINE 1
 line 2
@@ -4,2 +4,2 @@
 line 4
-line 5
+LINE 5`;

      const parsed = parseDiff(diff);
      const result = applyHunks(simpleOriginal, parsed.hunks);

      expect(result).toContain('LINE 1');
      expect(result).toContain('LINE 5');
      expect(result).not.toContain('line 1\n');
      expect(result).not.toContain('line 5');
    });

    it('should handle partial hunk selection', () => {
      const diff = `--- a/file.txt
+++ b/file.txt
@@ -1,2 +1,2 @@
-line 1
+LINE 1
 line 2
@@ -4,2 +4,2 @@
 line 4
-line 5
+LINE 5`;

      const parsed = parseDiff(diff);
      const hunk0 = getHunk(parsed.hunks, 0);

      // Only apply first hunk
      const result = applyHunks(simpleOriginal, [hunk0]);

      expect(result).toContain('LINE 1');
      expect(result).toContain('line 5'); // Second hunk not applied
      expect(result).not.toContain('LINE 5');
    });

    it('should return original content for empty hunks', () => {
      const result = applyHunks(simpleOriginal, []);

      expect(result).toBe(simpleOriginal);
    });

    it('should handle hunks with only additions', () => {
      const diff = `--- a/file.txt
+++ b/file.txt
@@ -2,2 +2,4 @@
 line 2
+new line A
+new line B
 line 3`;

      const parsed = parseDiff(diff);
      const result = applyHunks(simpleOriginal, parsed.hunks);

      expect(result).toContain('new line A');
      expect(result).toContain('new line B');
      expect(result).toContain('line 2');
      expect(result).toContain('line 3');
    });

    it('should handle hunks with only deletions', () => {
      const diff = `--- a/file.txt
+++ b/file.txt
@@ -2,3 +2,1 @@
 line 2
-line 3
-line 4`;

      const parsed = parseDiff(diff);
      const result = applyHunks(simpleOriginal, parsed.hunks);

      expect(result).toContain('line 2');
      expect(result).not.toContain('line 3');
      expect(result).not.toContain('line 4');
      expect(result).toContain('line 5');
    });

    it('should handle out-of-order hunk selection', () => {
      const diff = `--- a/file.txt
+++ b/file.txt
@@ -1,1 +1,1 @@
-line 1
+FIRST
@@ -3,1 +3,1 @@
-line 3
+THIRD
@@ -5,1 +5,1 @@
-line 5
+FIFTH`;

      const parsed = parseDiff(diff);
      const hunk0 = getHunk(parsed.hunks, 0);
      const hunk2 = getHunk(parsed.hunks, 2);

      // Apply hunks in reverse order (should still work due to sorting)
      const result = applyHunks(simpleOriginal, [hunk2, hunk0]);

      expect(result).toContain('FIRST');
      expect(result).not.toContain('THIRD'); // Middle hunk not selected
      expect(result).toContain('FIFTH');
    });
  });

  describe('generateDiff', () => {
    it('should generate diff between two strings', () => {
      const original = `line 1
line 2
line 3`;
      const modified = `line 1
line 2 modified
line 3`;

      const diff = generateDiff(original, modified, 'test.txt');

      expect(diff).toContain('--- test.txt');
      expect(diff).toContain('+++ test.txt');
      expect(diff).toContain('-line 2');
      expect(diff).toContain('+line 2 modified');
    });

    it('should return empty string for identical content', () => {
      const content = 'same content';
      const diff = generateDiff(content, content);

      expect(diff).toBe('');
    });

    it('should handle additions at end', () => {
      const original = `line 1
line 2`;
      const modified = `line 1
line 2
line 3`;

      const diff = generateDiff(original, modified);

      expect(diff).toContain('+line 3');
    });

    it('should handle deletions at end', () => {
      const original = `line 1
line 2
line 3`;
      const modified = `line 1
line 2`;

      const diff = generateDiff(original, modified);

      expect(diff).toContain('-line 3');
    });

    it('should include context lines', () => {
      const original = `line 1
line 2
line 3
line 4
line 5`;
      const modified = `line 1
line 2
LINE 3
line 4
line 5`;

      const diff = generateDiff(original, modified);

      // Should have context around the change
      expect(diff).toContain(' line 2');
      expect(diff).toContain('-line 3');
      expect(diff).toContain('+LINE 3');
      expect(diff).toContain(' line 4');
    });
  });

  describe('getHunkStats', () => {
    it('should calculate correct stats', () => {
      const parsed = parseDiff(sampleDiff);
      const stats = getHunkStats(parsed.hunks);

      expect(stats.totalHunks).toBe(3);
      // First hunk: +1, Second hunk: +2, Third hunk: +2 = 5 additions
      expect(stats.totalAdditions).toBe(5);
      // First hunk: 0, Second hunk: -1, Third hunk: -1 = 2 removals
      expect(stats.totalRemovals).toBe(2);
    });

    it('should return zero for empty hunks', () => {
      const stats = getHunkStats([]);

      expect(stats.totalHunks).toBe(0);
      expect(stats.totalAdditions).toBe(0);
      expect(stats.totalRemovals).toBe(0);
    });

    it('should calculate stats for selected hunks only', () => {
      const parsed = parseDiff(sampleDiff);
      const hunk0 = getHunk(parsed.hunks, 0);

      // Only first hunk
      const stats = getHunkStats([hunk0]);

      expect(stats.totalHunks).toBe(1);
      expect(stats.totalAdditions).toBe(1);
      expect(stats.totalRemovals).toBe(0);
    });
  });

  describe('integration: partial approval workflow', () => {
    it('should support selecting specific hunks for approval', () => {
      const parsed = parseDiff(sampleDiff);
      const hunk0 = getHunk(parsed.hunks, 0);
      const hunk2 = getHunk(parsed.hunks, 2);

      // User approves first and third hunks, rejects second
      const approvedHunks = [hunk0, hunk2];

      // Verify we can reconstruct partial diff
      const partialDiff = reconstructDiff(
        parsed.originalPath,
        parsed.modifiedPath,
        approvedHunks
      );

      expect(partialDiff).toContain('@@ -1,5 +1,6 @@'); // First hunk
      expect(partialDiff).not.toContain('@@ -10,7 +11,8 @@'); // Second hunk (rejected)
      expect(partialDiff).toContain('@@ -25,4 +27,5 @@'); // Third hunk
    });

    it('should apply only approved hunks to content', () => {
      const original = `import { foo } from 'bar';

export function example() {
  console.log('hello');
}

// gap

function helper() {
  const x = 1;
  const y = 2;
  return x + y;
}`;

      const diff = `--- a/file.ts
+++ b/file.ts
@@ -1,2 +1,3 @@
 import { foo } from 'bar';
+import { baz } from 'qux';

@@ -9,4 +10,5 @@
 function helper() {
   const x = 1;
-  const y = 2;
+  const y = 3;
+  const z = 4;
   return x + y;
 }`;

      const parsed = parseDiff(diff);
      const hunk0 = getHunk(parsed.hunks, 0);

      // Only approve first hunk (import addition)
      const result = applyHunks(original, [hunk0]);

      expect(result).toContain("import { baz } from 'qux';");
      expect(result).toContain('const y = 2;'); // Not changed (second hunk rejected)
      expect(result).not.toContain('const y = 3;');
      expect(result).not.toContain('const z = 4;');
    });

    it('should handle approve all scenario', () => {
      const original = `line 1
line 2
line 3`;

      const diff = `--- a/file.txt
+++ b/file.txt
@@ -1,1 +1,1 @@
-line 1
+LINE 1
@@ -3,1 +3,1 @@
-line 3
+LINE 3`;

      const parsed = parseDiff(diff);
      const result = applyHunks(original, parsed.hunks);

      expect(result).toBe(`LINE 1
line 2
LINE 3`);
    });

    it('should handle reject all scenario', () => {
      const original = `line 1
line 2
line 3`;

      const result = applyHunks(original, []);

      expect(result).toBe(original);
    });
  });
});
