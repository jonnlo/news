export function mobileTopicBarHeight(bar: HTMLElement | null) {
  const chip = bar?.querySelector<HTMLElement>('.filter');
  // A pinned row has 20px of padding and a 1px border around its chips.
  const rowHeight = (chip?.offsetHeight || 32) + 21;
  return bar?.classList.contains('is-pinned') ? Math.max(bar.offsetHeight, rowHeight) : rowHeight;
}
