/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * AN UNDEFINED CUSTOM PROPERTY DOES NOT FALL BACK. IT DELETES THE DECLARATION.
 *
 * `border: 1px solid var(--cf-does-not-exist)` is invalid at computed-value time, which means the
 * whole declaration is discarded and the element inherits or takes its initial value. The border
 * does not become a default border; it disappears. The stylesheet still parses, nothing warns, and
 * the file looks correct in review.
 *
 * The estate has shipped exactly this. `micro-mint-web/src/styles.css` names ten properties that do
 * not exist — `--cf-border`, `--cf-radius-md`, `--cf-space-1` through `--cf-space-5` and
 * `--cf-status-good`/`-warn`/`-crit` — across seventy-two declarations, every one of them inert.
 *
 * A CLASS behaves the same way and is the more common mistake, because a class name is a plausible
 * guess: `cf-card` reads exactly like something a design system would have. When it does not exist
 * the element is simply unstyled, which looks like a layout bug rather than a typo.
 *
 * So both are checked against the design system's own stylesheets, read from the sibling checkout
 * that `package.json` already links.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from 'node:test'
import { ROOT, read, stripComments } from './sources.ts'

/**
 * The design system's two stylesheets, read through the `link:` that package.json already declares.
 *
 * `node_modules/@cloudsforge/ui` is a symlink to the sibling working tree, so this reads the same
 * bytes the bundle will import — not a copy, and not a published version that may be behind it.
 */
const UI_CSS_DIR = join(ROOT, 'node_modules/@cloudsforge/ui/src')
const TOKENS_CSS = readFileSync(join(UI_CSS_DIR, 'tokens.css'), 'utf8')
const UI_CSS = readFileSync(join(UI_CSS_DIR, 'ui.css'), 'utf8')
const UPSTREAM = `${TOKENS_CSS}\n${UI_CSS}`

const STYLES = stripComments(read('src/styles.css'), 'css')

/** Every `--cf-*` the design system DECLARES (`--cf-x:`), as opposed to merely mentioning. */
const DECLARED = new Set(
  [...UPSTREAM.matchAll(/(--cf-[a-z0-9-]+)\s*:/g)].map((m) => m[1] as string),
)

/** Every `cf-*` class the design system defines a rule for. */
const UPSTREAM_CLASSES = new Set(
  [...UPSTREAM.matchAll(/\.(cf-[a-z0-9_-]+)/g)].map((m) => m[1] as string),
)

/** Every class this repository defines for itself. All are `pl-` prefixed; see the test below. */
const LOCAL_CLASSES = new Set(
  [...STYLES.matchAll(/\.([a-z][a-z0-9_-]*)/g)].map((m) => m[1] as string),
)

/** Every class name written into a `className` in src/, flattened out of template literals. */
function classNamesUsed(): { path: string; name: string }[] {
  const out: { path: string; name: string }[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!entry.endsWith('.tsx')) continue
      const path = relative(ROOT, full)
      const text = stripComments(readFileSync(full, 'utf8'), 'ts')
      for (const match of text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const raw = match[1] ?? match[2] ?? ''
        // A `${…}` inside a template literal is a whole class chosen at runtime — the ternary in
        // blocks.tsx picking `cf-status--good` or `cf-status--critical`. The interpolation is
        // dropped here and the arms are recovered below, from the quoted strings, so a name
        // chosen at runtime is checked exactly like one written inline. Stripping the
        // interpolation without that second pass is how a class only a rejected block ever sees
        // would go unchecked.
        for (const name of raw.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) {
          if (name) out.push({ path, name })
        }
      }
      for (const match of text.matchAll(/'((?:cf|pl)-[a-z0-9_-]+)'/g)) {
        out.push({ path, name: match[1] as string })
      }
    }
  }
  walk(join(ROOT, 'src'))
  return out
}

const USED = classNamesUsed()

test('EVERY --cf-* THIS STYLESHEET READS IS DECLARED BY THE DESIGN SYSTEM', () => {
  const referenced = new Set(
    [...STYLES.matchAll(/var\(\s*(--cf-[a-z0-9-]+)/g)].map((m) => m[1] as string),
  )
  for (const name of [...referenced].sort()) {
    assert.ok(
      DECLARED.has(name),
      `src/styles.css reads var(${name}), which @cloudsforge/ui does not declare. Every ` +
        `declaration using it is silently discarded — the property does not fall back, the rule ` +
        `is deleted. The names that exist: --cf-line/--cf-line-strong for borders, ` +
        `--cf-radius-sm/--cf-radius/--cf-radius-lg for radii, --cf-space-3xs…--cf-space-3xl for ` +
        `spacing, --cf-font-sans/-mono/-display for type.`,
    )
  }
  // A stylesheet that reads no tokens at all would pass the loop above trivially, which would make
  // this test a decoration. It reads a great many.
  assert.ok(referenced.size > 20, `only ${referenced.size} tokens referenced; that is suspiciously few`)
})

test('THERE IS NO var(--token, #fallback) ANYWHERE', () => {
  // A fallback is a hard-coded colour wearing a token's clothes. It stops following the substrate
  // the moment somebody switches the ash ramp, and — worse — it makes a MISSING token invisible,
  // because the declaration then renders instead of disappearing. That defeats the test above.
  const withFallback = [...STYLES.matchAll(/var\(\s*--cf-[a-z0-9-]+\s*,[^)]*\)/g)].map((m) => m[0])
  assert.deepEqual(withFallback, [])
})

test('there is exactly one literal colour in this stylesheet, and it is `transparent`', () => {
  const literals = [...STYLES.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g)].map((m) => m[0])
  assert.deepEqual(
    literals,
    [],
    `src/styles.css names a colour directly. Colours come from the ramps so that the page follows ` +
      `data-cf-product, data-cf-substrate and the reader's own light/dark preference.`,
  )
  assert.ok(STYLES.includes('transparent'))
})

test('EVERY cf- CLASS THIS APP USES EXISTS UPSTREAM', () => {
  // Checked first, because every assertion below is vacuous if the extraction found nothing — and
  // a regex over source text is exactly the kind of check that silently stops matching.
  const distinct = new Set(USED.filter((u) => u.name.startsWith('cf-')).map((u) => u.name))
  assert.ok(distinct.size >= 10, `only ${distinct.size} design-system classes found; the extraction has broken`)

  for (const { path, name } of USED) {
    if (!name.startsWith('cf-')) continue
    assert.ok(
      UPSTREAM_CLASSES.has(name),
      `${path} uses the class "${name}", which @cloudsforge/ui does not define. The element is ` +
        `simply unstyled, which reads as a layout bug rather than as a typo. Either it is a ` +
        `misremembered name or it belongs in src/styles.css under the pl- prefix.`,
    )
  }
})

test('every local class is pl- prefixed, and every pl- class this app uses is defined here', () => {
  // The prefix is what keeps the two namespaces from silently merging. A local class called
  // `cf-panel` would work today and break the day the design system defines one, in a way that
  // looks like a design-system regression rather than a collision in this repository.
  for (const name of LOCAL_CLASSES) {
    assert.ok(
      name.startsWith('pl-') || name.startsWith('cf-'),
      `src/styles.css defines ".${name}"; local classes take the pl- prefix so they cannot collide ` +
        `with the design system`,
    )
  }
  for (const { path, name } of USED) {
    if (!name.startsWith('pl-')) continue
    assert.ok(
      LOCAL_CLASSES.has(name),
      `${path} uses "${name}" and src/styles.css defines no rule for it`,
    )
  }
})

test('this stylesheet does not restyle the design system out from under itself', () => {
  // A `.cf-btn { … }` here would change that component on this surface only, which is how an estate
  // ends up with the same control looking different on six frontends. Local rules may only COMPOSE
  // — a pl- class beside a cf- one — never override.
  const overrides = [...STYLES.matchAll(/^\s*(\.cf-[a-z0-9_-]+[^{]*)\{/gm)].map((m) =>
    (m[1] as string).trim(),
  )
  assert.deepEqual(
    overrides,
    [],
    `src/styles.css writes a rule for a design-system class. Compose with a pl- class instead; ` +
      `a local override is how one estate control ends up looking different on every surface.`,
  )
})

test('the body actually consumes the tokens it is delivered', () => {
  // tokens.css resolves --cf-bg on :root, but if nothing here ever READS it the document falls all
  // the way through to the UA stylesheet: transparent background, Times, an 8px margin. That defect
  // is invisible to curl (still a 200) and invisible to a happy-dom test (no stylesheet is loaded
  // and nothing cascades), and glaring to the first person who opens the page in a browser.
  const body = STYLES.slice(STYLES.indexOf('body {'))
  assert.match(body, /background:\s*var\(--cf-bg\)/)
  assert.match(body, /color:\s*var\(--cf-fg\)/)
  assert.match(body, /font-family:\s*var\(--cf-font-sans\)/)
  // `color-scheme` is deliberately NOT declared on body: it is inherited, index.html sets
  // data-cf-scheme="auto", and a declaration here would beat the inherited one for the whole page
  // and leave a reader on a light system with dark native controls — this surface has a <select>.
  assert.doesNotMatch(body, /color-scheme/)
})

test('MARK STEP AND TEXT STEP ARE DIFFERENT TOKENS, AND TYPE TAKES THE TEXT STEP', () => {
  // `--cf-accent` and `--cf-warn` are validated at 3:1, the floor for a border, a fill or a stroke.
  // `--cf-accent-text` and `--cf-warn-text` are the 4.5:1 step for type. Using the mark step for
  // `color:` ships text that fails WCAG AA while looking deliberate.
  for (const match of STYLES.matchAll(/(^|[;{\s])color:\s*var\(\s*(--cf-[a-z0-9-]+)\s*\)/gm)) {
    const token = match[2] as string
    assert.ok(
      !/^--cf-(accent|warn|good|critical)$/.test(token),
      `src/styles.css sets color: var(${token}), which is the 3:1 mark step. Type takes the 4.5:1 ` +
        `step: ${token}-text.`,
    )
  }
})
