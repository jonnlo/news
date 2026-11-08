# Category navigation on mobile and desktop

## Decision and rationale

Use category chips to jump within the full feed on mobile. Keep category filtering on desktop.

The mobile feed is a single column with sources already grouped by category. Tapping **Tech** should jump to the first Tech source, then let the reader keep scrolling into the next category. The source switcher still handles jumps to individual publishers. Give the chips the same behavior before and after the bar pins.

On desktop, filtering makes the grid easier to scan by showing sources from one category side by side. **All** restores the full grid. Mobile readers give up category-only browsing through the bar in exchange for continuous scrolling through the edition.

## Implementation plan

1. **Separate jumping from filtering.** In [the reader page](../src/pages/index.astro), use the existing mobile breakpoint to route chip taps. On mobile, jump to the first rendered source in the tapped category and keep all source groups visible. **All** jumps to the start of the feed. Disable jump targets that have no sources in the current edition. On desktop, keep the existing filter, pagination reset, empty state, and browser history behavior.
2. **Share mobile landing behavior.** Use the same scroll offset for category jumps and [source switcher](../src/components/SourceNavigator.astro) jumps. Start with the existing category jump inset of 8 px below the pinned bar and retain the 12 px cutoff for the active category. Account for the bar pinning during a jump. This gives the destination a small margin inside the active area even if the browser rounds the final scroll position. Once the jump settles, confirm the chip matches the destination and continues to follow manual scrolling. Keep the source switcher's keyboard focus behavior and respect reduced motion.
3. **Keep mobile reading state.** A chip tap should leave each source's current story page intact. The source switcher and its previous and next buttons should navigate across the full feed on mobile. On desktop, preserve the source picker's current behavior of clearing the filter when the reader chooses a source outside it.
4. **Define links and breakpoint changes.** On mobile, interpret an existing valid `?category=` link as an initial jump. Ordinary mobile chip taps should leave the URL and browser history alone. On desktop, continue to interpret the query as a filter. When crossing into mobile, reveal the full feed and keep the reader near the current source if possible. When crossing into desktop, restore the filter from the URL. Ignore unknown category values.
5. **Update the reader documentation.** Revise the README when the behavior ships. The home page and the `/navigation/` preview share the reader, so verify both routes.

## Verification

| Scenario | Expected result |
| --- | --- |
| Mobile chips before and after pinning | Tap each populated category. Its first source lands below the bar, the correct chip is visible and highlighted, and the full feed stays available. **All** returns to the feed start. A category with no sources has no active jump target. |
| First source at a category boundary | On a phone, use the source switcher to select the first source in each category from above and below it. After the scroll settles, the pinned chip matches the chosen source. Scroll a short distance across the boundary in both directions and confirm the highlight follows. |
| Mobile reading state and controls | Open page two of a source, jump away, then return. Page two is still open. Verify previous and next cross category boundaries and the source picker can reach publishers throughout the feed. |
| Accessibility and motion | Activate chips and source picker entries by keyboard. Verify focus stays usable, the current category is announced appropriately, and jumps work with reduced motion enabled. |
| Desktop filtering and history | Select a category, choose **All**, and use Back and Forward. Confirm the visible grid and query match at every step. Choose an out-of-category source from the picker and confirm the filter clears before the jump. |
| Direct links and responsive changes | Open a valid category link and an unknown category link at mobile and desktop widths. Resize across the breakpoint in both directions and check visible sources, scroll position, and chip state. |
| Tap performance | Capture before and after traces on the same phone and edition. Compare the time from tap to visible scroll response. Check that mobile chip taps skip source filtering, story pagination resets, and story height refreshes. |

Run `npm run build` and repeat the mobile boundary check in iOS Safari and Android Chrome. Use a physical phone for the responsiveness comparison.
