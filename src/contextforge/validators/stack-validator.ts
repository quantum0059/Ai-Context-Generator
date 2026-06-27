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

  // Build allowed package set from locked stack
  const allowedPackages = new Set(
    Object.values(spec.stack ?? {})
      .filter(v => v?.value)
      .map(v => v!.value!.toLowerCase()
        .replace(/[^a-z0-9-@/]/g, '')
      )
  )

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
        const pkg = match[1].split('/')[0]
          .replace('@', '').split('/')[0]
        const fullPkg = match[1]

        if (PHANTOM_PACKAGES.has(fullPkg)) {
          violations.push({
            file: filePath,
            type: 'phantom-package',
            found: fullPkg,
            message: `${fullPkg} does not exist on npm`
          })
          continue
        }

        if (
          !builtins.has(pkg) && 
          !allowedPackages.has(pkg) &&
          !allowedPackages.has(fullPkg.toLowerCase())
        ) {
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

      // Check for RLS in SQLite projects
      const usesSQLite = 
        allowedPackages.has('better-sqlite3') ||
        allowedPackages.has('sqlite3')
      if (
        usesSQLite && 
        content.includes('RLS') ||
        content.includes('row level security') ||
        content.includes('auth.uid()')
      ) {
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
