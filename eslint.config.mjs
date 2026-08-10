// ─────────────────────────────────────────────────────────────────────────────
// Nothing Superapp — root ESLint flat config (ESLint 9, TypeScript).
//
// Next 16 removed `next lint` and no longer bundles an ESLint config; this
// flat config restores a repo-wide `pnpm --filter @nothing/web lint` (and
// `pnpm lint` at the root) with a lean, fast baseline. Kept minimal on
// purpose — the workspace already relies on `tsc --noEmit` for type
// enforcement, so ESLint here is a style / correctness safety net, not a
// duplicate type-checker.
//
// If you need stricter rules for one package, add a package-local
// `eslint.config.mjs` that extends this file's exports.
// ─────────────────────────────────────────────────────────────────────────────
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

// Stub plugin factory — mints inert "off" rules so that legacy
// `// eslint-disable-next-line <pluginName>/<ruleName>` comments left over
// from the old `next lint` config don't blow up. ESLint 9 flat config
// errors on any disable-directive that references an unknown rule; rather
// than churn every source file to strip those comments, we register the
// plugin namespaces with a Proxy that returns a no-op rule for any name.
const inertPlugin = (name) => ({
  [name]: {
    rules: new Proxy(
      {},
      {
        get: () => ({ meta: { schema: [] }, create: () => ({}) }),
        has: () => true,
      },
    ),
  },
});

export default [
  // Ignore build output, dependencies, and generated artefacts everywhere.
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/build/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/*.min.js',
      '**/playwright-report/**',
      '**/test-results/**',
      // Generated / auto-managed by Next itself.
      '**/next-env.d.ts',
      // Service worker + generated public assets — the SW is a classic script
      // (not module) that references globals injected by the browser, and the
      // `SW_VERSION` const is read by the bump script, not the file itself.
      '**/public/sw.js',
      '**/public/**/*.js',
    ],
  },

  // Base JS recommended rules apply to plain .js/.mjs/.cjs files.
  js.configs.recommended,

  // TypeScript recommended (non-type-checked flavour — no `parserOptions.project`
  // needed, so lint stays fast and doesn't need every tsconfig wired up).
  ...tseslint.configs.recommended,

  // Project-wide relaxations: prefer TypeScript enforcement over lint
  // where they overlap, and don't shout about intentional patterns.
  {
    // Tolerate legacy `// eslint-disable-next-line <rule>` comments left
    // behind by the old `next lint` config (react-hooks/exhaustive-deps,
    // @next/next/no-img-element, no-console, …). Those plugins aren't
    // wired here on purpose — repo-wide `tsc --noEmit` + typed hooks catch
    // the same bugs — but the inline directives still appear in files we
    // don't want to churn just to please the lint config.
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
    plugins: {
      ...inertPlugin('@next/next'),
      ...inertPlugin('react-hooks'),
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2024,
      },
    },
    rules: {
      // TS handles unused checks; ESLint's noise here is redundant. Allow the
      // underscore-prefix opt-out so intentional unused args stay explicit.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // We use `any` in a few well-considered places (adapters, generics we
      // never introspect). Downgrade to warn, don't block CI.
      '@typescript-eslint/no-explicit-any': 'warn',
      // `require()` in some scripts + Node CJS shims — allow it.
      '@typescript-eslint/no-require-imports': 'off',
      // `no-empty` triggers on intentional `catch {}` swallows; allow those.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Downgrade — a legit style nag, not a bug. Editor + code-review catch
      // the interesting cases; we don't want lint blocking CI on this.
      'prefer-const': 'warn',
    },
  },
];
