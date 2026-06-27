export const PHANTOM_PACKAGES = new Set<string>([
  // Packages that do not exist on npm
  // Confirmed from generated output analysis:
  '@vitest/jest',
  '@vitest/vite',
  'vitest-jest',
  'tree-sitter-clang',
  'tree-sitter-shell',
  'tree-sitter-nginx',
  'tree-sitter-c-sharp',  // correct is tree-sitter-c_sharp
  
  // Node.js built-ins mistakenly npm-installed:
  'child_process',
  'path',
  'fs',
  'os',
  'crypto',
  'events',
  'stream',
  'util',
  'buffer',
  'http',
  'https',
  'net',
  'readline',
  'assert',
])

// HOW TO ADD NEW ENTRIES:
// When validation-report.md flags a package as 
// "does not exist on npm", add it here.
// This file is the single source of truth for 
// known phantom packages across all generations.
