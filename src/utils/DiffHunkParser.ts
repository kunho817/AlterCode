/**
 * Diff Hunk Parser
 *
 * Utilities for parsing unified diffs into individual hunks
 * and reconstructing partial diffs from selected hunks.
 */

/** Represents a single hunk in a unified diff */
export interface DiffHunk {
  /** Unique identifier for this hunk */
  id: string;
  /** Header line (e.g., "@@ -1,3 +1,4 @@") */
  header: string;
  /** Original file start line */
  originalStart: number;
  /** Original file line count */
  originalCount: number;
  /** Modified file start line */
  modifiedStart: number;
  /** Modified file line count */
  modifiedCount: number;
  /** Lines in this hunk (including +/- prefixes) */
  lines: string[];
  /** Context description (optional, from @@ header) */
  context?: string;
  /** Lines being removed (- prefix) */
  removals: string[];
  /** Lines being added (+ prefix) */
  additions: string[];
  /** Preview text for display */
  preview: string;
}

/** Parsed diff with hunks */
export interface ParsedDiff {
  /** Original file path (from --- header) */
  originalPath: string;
  /** Modified file path (from +++ header) */
  modifiedPath: string;
  /** Individual hunks */
  hunks: DiffHunk[];
}

/**
 * Parse a unified diff string into structured hunks
 */
export function parseDiff(diff: string): ParsedDiff {
  const lines = diff.split('\n');
  const hunks: DiffHunk[] = [];
  let originalPath = '';
  let modifiedPath = '';
  let currentHunk: DiffHunk | null = null;
  let hunkIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    // Parse file headers
    if (line.startsWith('---')) {
      originalPath = line.substring(4).trim();
      continue;
    }
    if (line.startsWith('+++')) {
      modifiedPath = line.substring(4).trim();
      continue;
    }

    // Parse hunk header
    if (line.startsWith('@@')) {
      // Save previous hunk if exists
      if (currentHunk) {
        currentHunk.preview = createHunkPreview(currentHunk);
        hunks.push(currentHunk);
      }

      // Parse header: @@ -start,count +start,count @@ optional context
      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
      if (match) {
        currentHunk = {
          id: `hunk-${hunkIndex++}`,
          header: line,
          originalStart: parseInt(match[1] ?? '0', 10),
          originalCount: parseInt(match[2] ?? '1', 10),
          modifiedStart: parseInt(match[3] ?? '0', 10),
          modifiedCount: parseInt(match[4] ?? '1', 10),
          context: match[5]?.trim() || undefined,
          lines: [],
          removals: [],
          additions: [],
          preview: '',
        };
      }
      continue;
    }

    // Add line to current hunk
    if (currentHunk) {
      currentHunk.lines.push(line);
      if (line.startsWith('-') && !line.startsWith('---')) {
        currentHunk.removals.push(line.substring(1));
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        currentHunk.additions.push(line.substring(1));
      }
    }
  }

  // Don't forget the last hunk
  if (currentHunk) {
    currentHunk.preview = createHunkPreview(currentHunk);
    hunks.push(currentHunk);
  }

  return { originalPath, modifiedPath, hunks };
}

/**
 * Create a preview string for a hunk
 */
function createHunkPreview(hunk: DiffHunk): string {
  const removals = hunk.removals.length;
  const additions = hunk.additions.length;
  const contextName = hunk.context || `Line ${hunk.modifiedStart}`;

  let preview = contextName;
  if (removals > 0 && additions > 0) {
    preview += ` (-${removals}/+${additions})`;
  } else if (removals > 0) {
    preview += ` (-${removals})`;
  } else if (additions > 0) {
    preview += ` (+${additions})`;
  }

  return preview;
}

/**
 * Reconstruct diff from selected hunks
 */
export function reconstructDiff(
  originalPath: string,
  modifiedPath: string,
  hunks: DiffHunk[]
): string {
  if (hunks.length === 0) {
    return '';
  }

  const lines: string[] = [
    `--- ${originalPath}`,
    `+++ ${modifiedPath}`,
  ];

  for (const hunk of hunks) {
    lines.push(hunk.header);
    lines.push(...hunk.lines);
  }

  return lines.join('\n');
}

/**
 * Apply selected hunks to original content to produce modified content
 */
export function applyHunks(
  originalContent: string,
  hunks: DiffHunk[]
): string {
  if (hunks.length === 0) {
    return originalContent;
  }

  const originalLines = originalContent.split('\n');
  const result: string[] = [];
  let originalIndex = 0;

  // Sort hunks by original start line
  const sortedHunks = [...hunks].sort((a, b) => a.originalStart - b.originalStart);

  for (const hunk of sortedHunks) {
    // Add lines before this hunk (unchanged)
    const hunkStart = hunk.originalStart - 1; // Convert to 0-indexed
    while (originalIndex < hunkStart && originalIndex < originalLines.length) {
      const line = originalLines[originalIndex];
      if (line !== undefined) {
        result.push(line);
      }
      originalIndex++;
    }

    // Apply the hunk
    for (const line of hunk.lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        // Add new lines
        result.push(line.substring(1));
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        // Skip removed lines (advance original index)
        originalIndex++;
      } else if (line.startsWith(' ')) {
        // Context line - keep it and advance
        result.push(line.substring(1));
        originalIndex++;
      }
    }
  }

  // Add remaining lines after last hunk
  while (originalIndex < originalLines.length) {
    const line = originalLines[originalIndex];
    if (line !== undefined) {
      result.push(line);
    }
    originalIndex++;
  }

  return result.join('\n');
}

/**
 * Generate a simple unified diff between two strings
 */
export function generateDiff(
  originalContent: string,
  modifiedContent: string,
  filePath: string = 'file'
): string {
  const originalLines = originalContent.split('\n');
  const modifiedLines = modifiedContent.split('\n');

  const hunks: string[] = [];
  let currentHunk: string[] = [];
  let hunkOriginalStart = 0;
  let hunkOriginalCount = 0;
  let hunkModifiedStart = 0;
  let hunkModifiedCount = 0;
  let inHunk = false;
  let contextBefore: string[] = [];

  let oi = 0;
  let mi = 0;

  const flushHunk = () => {
    if (currentHunk.length > 0) {
      const header = `@@ -${hunkOriginalStart},${hunkOriginalCount} +${hunkModifiedStart},${hunkModifiedCount} @@`;
      hunks.push(header);
      hunks.push(...currentHunk);
      currentHunk = [];
      inHunk = false;
      contextBefore = [];
    }
  };

  while (oi < originalLines.length || mi < modifiedLines.length) {
    const origLine = originalLines[oi];
    const modLine = modifiedLines[mi];

    if (origLine === modLine) {
      if (inHunk) {
        // Add as context
        currentHunk.push(` ${origLine ?? ''}`);
        hunkOriginalCount++;
        hunkModifiedCount++;

        // Check if we should end the hunk (3+ context lines)
        const recentContext = currentHunk.slice(-3).filter(l => l.startsWith(' '));
        if (recentContext.length >= 3 && oi < originalLines.length - 1) {
          // Remove trailing context and flush
          currentHunk = currentHunk.slice(0, -2);
          hunkOriginalCount -= 2;
          hunkModifiedCount -= 2;
          flushHunk();
        }
      } else {
        // Buffer context
        contextBefore.push(` ${origLine ?? ''}`);
        if (contextBefore.length > 3) {
          contextBefore.shift();
        }
      }
      oi++;
      mi++;
    } else {
      // Difference found
      if (!inHunk) {
        // Start new hunk with context
        inHunk = true;
        hunkOriginalStart = Math.max(1, oi - contextBefore.length + 1);
        hunkModifiedStart = Math.max(1, mi - contextBefore.length + 1);
        hunkOriginalCount = contextBefore.length;
        hunkModifiedCount = contextBefore.length;
        currentHunk = [...contextBefore];
        contextBefore = [];
      }

      // Handle difference
      if (origLine !== undefined && (modLine === undefined || oi < mi)) {
        currentHunk.push(`-${origLine}`);
        hunkOriginalCount++;
        oi++;
      } else if (modLine !== undefined) {
        currentHunk.push(`+${modLine}`);
        hunkModifiedCount++;
        mi++;
      }
    }
  }

  flushHunk();

  if (hunks.length === 0) {
    return '';
  }

  return [
    `--- ${filePath}`,
    `+++ ${filePath}`,
    ...hunks,
  ].join('\n');
}

/**
 * Get summary statistics for a set of hunks
 */
export function getHunkStats(hunks: DiffHunk[]): {
  totalHunks: number;
  totalAdditions: number;
  totalRemovals: number;
} {
  let totalAdditions = 0;
  let totalRemovals = 0;

  for (const hunk of hunks) {
    totalAdditions += hunk.additions.length;
    totalRemovals += hunk.removals.length;
  }

  return {
    totalHunks: hunks.length,
    totalAdditions,
    totalRemovals,
  };
}
