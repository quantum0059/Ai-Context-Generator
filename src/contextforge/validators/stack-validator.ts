import type { ProjectSpec } from "../../types/projectspec";
import { PHANTOM_PACKAGES } from "./phantom-packages";

export interface ValidationResult {
  passed: boolean
  violations: Violation[]
  warnings: Warning[]
}

interface Violation {
  file: string
  type: 'forbidden-import' | 'phantom-package' | 
        'wrong-test-framework' | 'rls-in-sqlite'
  found: string
  message: string
}

interface Warning {
  file: string
  message: string
}

export function validateGeneratedPackage(
  files: Record<string, string>,
  spec: ProjectSpec
): ValidationResult {
  const violations: Violation[] = []
  const warnings: Warning[] = []

  // Map a tool's display name onto the npm package base(s) it implies, so we
  // allow framework sub-path imports (e.g. "Next.js" allows next/server,
  // next/navigation) and well-known peer dependencies.
  const TOOL_PACKAGE_MAP: Record<string, string[]> = {
    'next.js': ['next', 'react', 'react-dom'],
    'next': ['next', 'react', 'react-dom'],
    'react': ['react', 'react-dom'],
    'expo': ['expo', 'react', 'react-native', '@react-navigation/native', 'expo-router', 'expo-secure-store'],
    'react native': ['react-native', 'react'],
    'supabase': ['@supabase/supabase-js', '@supabase/ssr'],
    'clerk': ['@clerk/nextjs', '@clerk/clerk-expo', '@clerk/clerk-react'],
    'stripe': ['stripe', '@stripe/stripe-js'],
    'drizzle': ['drizzle-orm', 'postgres'],
    'prisma': ['@prisma/client'],
    'zustand': ['zustand'],
    'tailwind css': ['tailwindcss', 'clsx', 'tailwind-merge'],
    'vitest': ['vitest', '@testing-library/react', '@testing-library/jest-dom'],
  }

  // Build allowed package set from locked stack
  const allowedPackages = new Set<string>()
  for (const v of Object.values(spec.stack ?? {})) {
    if (!v?.value) continue
    const raw = v.value.toLowerCase().trim()
    // Keep scoped-package form (@scope/name); only strip stray punctuation.
    const base = raw.replace(/[^a-z0-9-@/. ]/g, '')
    allowedPackages.add(base)
    allowedPackages.add(base.split(/[ /]/)[0])
    const mapped = TOOL_PACKAGE_MAP[base] ?? TOOL_PACKAGE_MAP[base.split(' ')[0]]
    if (mapped) for (const m of mapped) allowedPackages.add(m.toLowerCase())
  }

  // Framework-implied peers that are always acceptable in a TS/JS package.
  const alwaysAllowed = new Set([
    'react', 'react-dom', 'react-native', 'next', 'expo', 'zod',
    '@testing-library/react', '@testing-library/jest-dom', 'vitest',
  ])

  // Known Node.js built-ins — always allowed
  const builtins = new Set([
    'fs', 'path', 'os', 'child_process', 'crypto',
    'events', 'stream', 'util', 'buffer', 'assert',
    'process', 'console', 'module', 'require',
    'http', 'https', 'net', 'readline', 'timers'
  ])

  // Phantom packages are now imported from PHANTOM_PACKAGES

  const importRegex = 
    /import\s+.*?from\s+['"]([^'"./][^'"]*)['"]/g
  const requireRegex = 
    /require\s*\(\s*['"]([^'"./][^'"]*)['"]\s*\)/g
  const npmInstallRegex = /npm install ([^\n]+)/g

  for (const [filePath, content] of 
    Object.entries(files)
  ) {
    // Check imports in .ts/.js code blocks
    if (
      filePath.endsWith('.md') || 
      filePath.endsWith('.ts') || 
      filePath.endsWith('.js')
    ) {
      for (const match of [
        ...Array.from(content.matchAll(importRegex)),
        ...Array.from(content.matchAll(requireRegex))
      ]) {
        const fullPkg = match[1]
        // Resolve the npm package "base": for scoped packages keep
        // @scope/name; otherwise take the first path segment.
        const base = fullPkg.startsWith('@')
          ? fullPkg.split('/').slice(0, 2).join('/').toLowerCase()
          : fullPkg.split('/')[0].toLowerCase()

        if (PHANTOM_PACKAGES.has(fullPkg) || PHANTOM_PACKAGES.has(base)) {
          violations.push({
            file: filePath,
            type: 'phantom-package',
            found: fullPkg,
            message: `${fullPkg} does not exist on npm`
          })
          continue
        }

        const isAllowed =
          builtins.has(base) ||
          alwaysAllowed.has(base) ||
          allowedPackages.has(base) ||
          allowedPackages.has(fullPkg.toLowerCase())

        if (!isAllowed) {
          violations.push({
            file: filePath,
            type: 'forbidden-import',
            found: fullPkg,
            message: `${fullPkg} is not in the locked stack`
          })
        }
      }

      // Check for wrong test framework
      if (content.includes('jest.fn(') || 
          content.includes("from 'jest'") ||
          content.includes('@types/jest')
      ) {
        const usesVitest = 
          allowedPackages.has('vitest') ||
          content.includes('vitest')
        if (usesVitest) {
          violations.push({
            file: filePath,
            type: 'wrong-test-framework',
            found: 'jest.fn()',
            message: 'Use vi.fn() — project uses Vitest not Jest'
          })
        }
      }

      // Check for RLS in SQLite projects. NOTE the grouped condition: the
      // previous `a && b || c || d` precedence bug fired on ANY file that
      // mentioned RLS, even when SQLite was not in the stack.
      const usesSQLite =
        allowedPackages.has('better-sqlite3') ||
        allowedPackages.has('sqlite3')
      const mentionsRls =
        content.includes('RLS') ||
        content.includes('row level security') ||
        content.includes('auth.uid()')
      if (usesSQLite && mentionsRls) {
        violations.push({
          file: filePath,
          type: 'rls-in-sqlite',
          found: 'RLS policy',
          message: 'SQLite does not support RLS — ' +
            'this is a PostgreSQL/Supabase concept'
        })
      }
    }

    // Check install scripts for duplicates 
    // and phantom packages
    if (
      filePath.includes('install.sh') || 
      filePath.includes('install.ps1')
    ) {
      const installCounts = new Map<string, number>()
      for (const match of Array.from(content.matchAll(npmInstallRegex))) {
        const packages = match[1].trim().split(' ')
        for (const pkg of packages) {
          const count = 
            (installCounts.get(pkg) ?? 0) + 1
          installCounts.set(pkg, count)
          if (count > 1) {
            warnings.push({
              file: filePath,
              message: `${pkg} installed ${count} times`
            })
          }
          if (PHANTOM_PACKAGES.has(pkg)) {
            violations.push({
              file: filePath,
              type: 'phantom-package',
              found: pkg,
              message: `${pkg} does not exist on npm`
            })
          }
        }
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    warnings
  }
}
