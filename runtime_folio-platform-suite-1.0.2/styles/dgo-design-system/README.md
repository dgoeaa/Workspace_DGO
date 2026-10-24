# DGO design system: the brand master

**This folder is the single authority for how anything this repository ships looks:** colour, type, theme, spacing and logo. If a page, template, generator, deck or email needs a brand value, it comes from here. If the value it needs is missing, add it here. Never invent it in the output.

`npm run test:brand` (`tests/brand-authority.test.mjs`) enforces this. It runs in `npm test`.

## Where the brand comes from

This folder implements the **NITDA Portfolio Brand and Design System, package 1.0.0** (core 2.1, Sept 2026). The package was supplied on 2026-09-27 and is not committed here; keep it with the brand custodian. It defines four tiers, and each tier may only consume the one above it:

| Tier | What it is | Where it lives in this repo |
|---|---|---|
| 1 · Master brand | NITDA Brand Guidelines (2020): logo, colour, type, voice | `brand/nitda/` (logo masters) and the rules below. The Brand Manual PDF is in the package (`reference/NITDA Brand Manual.pdf`), not in git. |
| 2 · Core design system | `--dgo-*` tokens and `.dgo-*` classes | `tokens/`, and the stylesheets in this folder |
| 3 · Platform bindings | `data-platform` re-binds intent only (`--pf-*`) | `tokens/tokens.platforms.css` |
| 4 · Platforms | The products | `index.html` (`data-platform="dgo-ops"`), `document-portal/` (`data-platform="portal"`) |

## What is here

| Path | What it holds |
|---|---|
| `brand/nitda/` | The NITDA logo masters: the package's four, plus the two transparent digital lockups every screen uses (see "Logo" below) |
| `brand/dgo/` | The DGO Digital Ops mark, redrawn as geometry (`dgo-mark.svg`, and `dgo-mark-reverse.svg` for dark surfaces) |
| `kit/brand-platform.css` | Header colours bound to the platform variant, the NITDA logo swap, and the DGO Digital Ops lockup; shared by the runtime and the kit |
| `kit/brand-kit.css`, `kit/brand-kit.js` | The portable brand kit: the app shell (fixed header, navigation and footer; content that scrolls on its own), components, states and feedback. Every value is a token. No dependencies. |
| `tokens/tokens.primitive.css` | The raw palette and font stacks. Deep Green `--dgo-green-700` `#05583B` (PANTONE 7484C), Smart Green `--dgo-smart-400` `#17B255` (PANTONE 354C), brand black `--dgo-ink-700` `#373435`. |
| `tokens/tokens.semantic.css` | Intent names built on the palette: `--dgo-color-action-primary`, `--dgo-color-fg-default`, `--dgo-color-success-subtle-fg`, … **Outputs use these.** |
| `tokens/tokens.theme-light.css`, `-dark.css`, `-hc.css` | Theme bindings of the semantic names |
| `tokens/tokens.component.css`, `-density.css`, `-breakpoint.css` | Component bindings, density, the shared breakpoint scale |
| `tokens/tokens.platforms.css` | Tier 3 platform bindings, the package's values unchanged |
| `tokens/tokens.legacy-bridge.css`, `-enhanced.css` | Runtime-only (see `tests/design-tokens.test.mjs`) |
| `reset.css`, `base.css`, `layout.css`, `components.css`, `brand-type.css`, `colors_and_type.css`, `platform-authority.css` | The runtime's stylesheet layers, loaded through `styles/index.css` |

## Decisions and exceptions

### From the package (apply here as written)

| ID | Ruling |
|---|---|
| EX-01 | The core outline SVG sprite is the one icon set. There is no Lucide and no icon CDN. |
| EX-02 | The core radius scale (2 / 6 / 10 / 18 px) governs digital. The guide's 4 / 8 / 12 / 16 scale is withdrawn. |
| EX-03 | The baseline is WCAG 2.2 AA, with AAA in the high-contrast theme. |
| EX-05 | Outfit substitutes for Alwyn New in digital until licensed files are installed. Print keeps Alwyn New. |
| EX-06 | The escalated status keeps its literal `#FAD2D9` / `#780820` until the core promotes them to a primitive. |
| EX-07 | The portal may add product classes, consuming only `--dgo-*` semantic/component tokens and `--pf-*` bindings. |

EX-04 (DGO standalone tokens retired) is already true here, since there is one token stack. EX-08 concerns a portal codebase that isn't in this repo.

### This repository's own (RX)

**RX-01 · Master brand everywhere; the DGO Digital Ops sub-brand inside only.**

| Level | What it is | Where it appears |
|---|---|---|
| **NITDA** | The master brand. Its logo is on every surface. | Everywhere |
| **DGO Digital Ops** | The endorsed internal sub-brand: the operational technology of the Director-General's Office. Its lockup sits beside the NITDA logo, never in place of it, and internal surfaces take its P2 platform variant (`data-platform="dgo-ops"`: a light header, sans reading type, full-width, control-radius surfaces). | Internal, staff-facing surfaces only |
| **Folio …** | Product names inside DGO Digital Ops: Folio Workspace, Estate Console, Flow Workbench, Vault, and the Platform Atlas and other internal references (`docs/reference/PLATFORM_NAMING.md`). | As page and product titles |

- **Internal** (sub-brand used): the runtime's sidebar and its boot, sign-in and code screens; the Platform Atlas, provisioning console, workbench, Estate Console, Provisioning Atlas and coordination hub; the registers, architecture sheets, flow references and connector matrices; the Correspondence Mailer's interface and go-live guide; the Automation Ladder; and the 12 internal staff emails (as text: "DGO Digital Ops", since mail clients cannot be relied on to render the lockup).
- **External** (NITDA alone): the NITDA Document Portal (`data-platform="portal"`), the 8 public notification emails, and the letterhead and correspondence templates that go to other institutions, including the letters the mailer sends.
- **The lockup** is built from text and geometry (`kit/brand-platform.css`, markup from `scripts/lib/brand-kit.mjs` `subLockup()`): "DG", the atomic-O mark drawn as a Smart Green ring round a centre dot, and DIGITAL / OPS behind a Smart Green rule. It is crisp at any size and cannot clip when Outfit is absent. The package's DGO SVGs set their words as `<text>`, which renders in a serif fallback, clips the endorsement line, and draws "DG" black on Deep Green in the white-out, so they are not used. The mark alone is redrawn as geometry in `brand/dgo/` and serves as the internal tools' favicon.
- **Records keep their words.** The 27 August briefing deck and the other dated records say what they said then.
- **What this settles:** audit item **H-03**. `test:brand` checks both halves: every internal surface carries the lockup and the P2 variant, and no external surface or letterhead code carries the sub-brand.

**RX-02 · The repo's core tokens are ahead of the package's core 2.1.** Where they differ, this repo's values stand. They should be fed back to the package at its next MINOR release:

| Token | Package 2.1 | Here | Why |
|---|---|---|---|
| `--dgo-color-fg-on-accent` | `ink-0` (white) | `#04180F` | White on Smart Green is 2.79:1, which fails SC 1.4.3 |
| `--dgo-color-border-strong` / `-stronger` | `ink-200` / `ink-300` | `ink-400` / `ink-500` | Control boundaries must reach 3:1 (SC 1.4.11) |
| Dark `--dgo-color-border-strong` / `-stronger`, `--dgo-input-border` | `#2D3F36` / `#42554B` | `#6E8A7C` / `#8AA79A` | Same, on the dark card |
| `--dgo-color-fg-strong` | `ink-1000` | `ink-900` | |
| `--dgo-family-mono` | JetBrains Mono first | Cascadia Mono first | The self-hosted face (H-04) |
| Added here | | `--dgo-color-fg-brand`, `--dgo-type-floor`, `--dgo-size-11`, 15 dark-theme re-binds | |

**H-04 (fonts) is settled by EX-05 and what both platforms already ship.** Cascadia Mono is self-hosted in both (`assets/fonts/`, `document-portal/ds/fonts/`). Outfit and Inter are named in the stacks and fall back to system fonts until licensed files are installed.

## How each kind of output takes the brand

Every output uses exactly one of these ways, and `npm run test:brand` checks each one. The kit and the tokens are copied into an output, never linked back into the repository, so a page or a package still carries the brand when it is downloaded, emailed or opened from a memory stick.

| Kind of output | How it takes the brand | Today |
|---|---|---|
| **Linked**: served beside the repo's styles | Loads the design system stylesheet and sets `data-platform` | the runtime (`index.html`) |
| **Linked copy**: a separately deployed platform | Carries a byte-identical copy of the token files (`test:tokens`) and sets `data-platform` | the Document Portal (`ds/`) |
| **Packaged**: a folder that ships as a unit | A `brand/` folder written by `npm run brand:sync`: `brand.css` (tokens + kit), `brand.js`, the logos. The page loads `brand/brand.css` before its own CSS, and its own CSS names tokens only. | Platform Atlas, provisioning console, Correspondence Mailer |
| **Embedded**: one file that opens anywhere | A fenced block (`brand:kit:start` … `brand:kit:end`) holding tokens, kit CSS and, unless the fence says `css-only`, the kit script; logos in `<img data-bk-logo="white\|colour\|symbol">` slots. `npm run brand:sync` writes both; generators call `scripts/lib/brand-kit.mjs` to write the same. | 16 pages: the Provisioning Atlas, the consoles and workbench, the registers and matrices, architecture sheets, flow references, decks, the go-live guide |
| **Email**: mail clients ignore CSS variables | Literal colours, each one a brand palette value (`tokens.primitive.css`); the letterhead reads its values from `config/correspondence-email-templates.config.js`, whose colours are checked against the palette | 20 notification templates, 6 correspondence templates |

`npm run brand:sync` refreshes every packaged folder and every embedded block after a change here. `test:brand` runs its `--check` first and fails on any copy that has drifted.

### The frame every page shares

The kit's shell (`.bk-app`) pins a page to the viewport. The brand header, side navigation and footer never move. The content scrolls in `.bk-main`, the navigation in `.bk-nav`, each on its own: a scroll that reaches one region's end is not handed to another (`overscroll-behavior: contain`). Tab bars and jump bars pin at the top of the scrolling content and highlight where the reader is. On a phone the navigation becomes a drawer. For print, the chrome goes and the page flows as one document.

Feedback is built in: pressed and busy states on controls, a toast for every action a reader cannot see complete, copy-to-clipboard with confirmation, section links, a back-to-top control and a reading-progress line. All of it respects reduced motion.

### Adding a new output

1. Pick its kind from the table above. For a single file, put the fence in `<head>` and use the kit's shell classes; for a folder, add it to `PACKAGES` in `scripts/brand-sync.mjs`.
2. Run `npm run brand:sync`.
3. Classify it in `tests/brand-authority.test.mjs`. An unclassified HTML file fails the gate.

### The backlog

`PENDING` in `tests/brand-authority.test.mjs` is empty: every one of the 59 live HTML outputs is on the design system. The list stays, so that a regression has to be declared with a reason rather than slipping through.

### What was kept as recorded

Dated records keep their words: the forensic schematic set (`dd2e909`), the superseded flow reference, the dated alignment report and the 27 August briefing deck. They still name "DGO Digital Ops" or "NITDA Intelligent Portal" where they did then. Their presentation is on the current brand. Machine identifiers keep their `dgo` spelling (flow names, list names, `NITDA/DGO/…` letter references, where "DGO" names the Director-General's Office).

## Rules

These rules come from the package's Tier 1 (the 2020 Brand Manual) and the core 2.1 documentation. The archived v2.1 spec (`docs/archive/dgo-ops/design-system/docs/`) is the long-form reference. **Where anything disagrees with the token files, the token files win.**

**Logo** (Tier 1):
- **Which files:** the masters are in `brand/nitda/`.

  | File | Use |
  |---|---|
  | `nitda-logo-horizontal-colour.jpeg` | Primary, on white |
  | `nitda-logo-horizontal-whiteout.png` | On Deep Green |
  | `nitda-logo-stacked-whiteout.png` | Square and portrait formats |
  | `nitda-symbol-infoweb.png` | Avatars, card backs, 96% watermark |
  | `nitda-lockup-digital-white.png` | **Screens**: on Deep Green and dark surfaces (transparent) |
  | `nitda-lockup-digital-colour.png` | **Screens**: on white and light surfaces (transparent) |

  The package's horizontal and stacked white-outs are not transparent: each carries its own opaque green (`rgb(0 78 39)`, not Deep Green). On a Deep Green bar they show as a box, so screens use the two digital lockups and the white-outs are for fixed backgrounds such as print.

- **Placement:** top-left or bottom-left only. The exclusion zone equals the height of "Na" in "National". Use it only on white or on uniform Deep Green, never on photos.
- **Treatment:** no drop shadows, outlines, recolouring, stretching or rotation.
- **Size:** at least 120 px wide on screen (horizontal) or 64 px (stacked).
- **Existing copies:** the digital lockups are the runtime's own `assets/nitda-lockup*.png`. The portal's `document-portal/ds/logo/` files are earlier exports of the same logo; replace them with the digital masters when the portal is next reviewed, since that changes what the public sees.

**Colour:**
1. Use semantic tokens (`--dgo-color-*`), not primitives.
2. Colour is never the only signal. Status carries a label or icon as well.
3. **Deep Green** is the primary surface and action, with `--dgo-color-fg-on-brand` on it. Lesser text on it uses `--dgo-color-fg-on-brand-muted`, `-soft` or `-faint`. Brand-coloured **text** uses `--dgo-color-fg-brand`, which the dark theme lifts to a lighter green.
4. **Smart Green** is for accents and success only, never warning or delete, and never as body text (2.9:1 on white).
5. **Coat-of-Arms red and yellow** are for the Coat of Arms only.
6. **Chart tints:** only the 80% and 40% tints of the two greens are approved, and only for charts.
7. **No** gradients, textures, photo overlays or backdrop blur.
8. **Status colours** come in pairs: `-subtle-{bg,fg}` for chips and text, `-strong-{bg,fg}` for solid fills.
9. **Control borders:** a border that is the only boundary of a control uses `--dgo-color-border-strong` or darker (at least 3:1).

**Type:**

| Token | Use |
|---|---|
| `--dgo-family-display` | Headings and display: Outfit, standing in for Alwyn New (EX-05) |
| `--dgo-family-sans` | UI and reading type on both platforms: Inter |
| `--dgo-family-body` | Long-form prose and print: Verdana, 10 pt minimum |
| `--dgo-family-mono` | Code and reference numbers: Cascadia Mono, self-hosted |

No output may load fonts from another site.

**Voice:**
- Formal and third person: "the Agency" or "NITDA". Spell out the agency name on first reference.
- Title Case for headings and navigation, sentence case for body text.
- ALL CAPS only for the Ministry credit line and eyebrows.
- No emoji.

**Theme:** every output supports light and dark. The runtime stamps `data-theme`. Standalone pages also follow the system preference, which `brand-tokens.mjs` provides.
