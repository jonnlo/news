# CSS maintenance

- Before adding CSS, search `src/styles/`, Astro `<style>` blocks, and component variants for an existing rule or token. Reuse the existing owner rather than adding another override.
- Keep shared Tailwind/Starwind theme mappings in `src/styles/starwind.css`; put site-specific tokens and intentional theme overrides in `src/styles/global.css`. Keep source-navigation styles in `src/styles/navigation.css` and page-only styles in the page's scoped `<style>` block.
- Tailwind compiles stylesheets independently: preserve local `@theme` mappings needed by a stylesheet's `@apply` rules, even if another stylesheet defines the same mapping. Validate token consolidation with a build, not just a text comparison.
- Responsive and state rules should declare only values that change. Do not repeat base values, add `.active` selectors already covered by the base selector, or redeclare inherited values without a concrete cascade requirement.
- Check import order, cascade layers, specificity, and later rules before removing or adding an override. Avoid declarations immediately overwritten by a shorthand (for example, `font-size` before `font: inherit`). Group compatible rules within the same media query when source order allows.
- Remove obsolete selectors when removing markup. Search templates, scripts, generated class names, and component variants first; lack of a literal class in markup alone does not prove a selector is unused.
- Preserve intentional compatibility fallbacks, vendor-prefixed declarations, dark-mode overrides, focus states, and reduced-motion behavior. For example, `em` dimensions followed by `cap` dimensions are browser fallbacks, not accidental duplicates. Comment non-obvious fallbacks or necessary repeated declarations.
- Keep redundancy cleanups behavior-preserving. Handle visual corrections separately rather than silently changing the winning declaration.
- After CSS changes, run `npm run build` and relevant tests. For layout or cascade changes, compare affected pages at desktop and mobile widths in both light and dark modes, including interactive states; report any validation not performed.

# News sources and settings

- For source/category changes, follow [`docs/news-sources-and-settings.md`](docs/news-sources-and-settings.md) before editing `src/data/news-settings.json`, collector parsing, or category ranking behavior. It maps the active settings to the collector, site, and ranking config and describes a safe feed validation workflow.
- Treat `src/data/news-settings.json` as the active configuration and `docs/source-audit.md` as a planning/history registry; adding a candidate to the registry does not activate it.
