// Conservative, title-only classification for Hacker News submissions.
// HN popularity is not topical evidence: unmatched or ambiguous titles stay null.
const RULES = {
  Technology: [
    [5, /\b(?:programming|programmer|coding|code review|source code|open[- ]source|software|operating system|database|compiler|programming language|api|linux kernel|web browser|javascript|typescript|rust language|golang|python package|machine learning|large language model|neural network|artificial intelligence|\bai coding\b|\bai agent\b|\bllm\b)\b/i],
    [4, /\b(?:build(?:ing)?|write|writing|run|running|deploy(?:ing)?)\s+(?:a |an )?(?:[\w.-]+\s+){0,2}(?:app|website|compiler|database|server|tool|library|kernel|language|framework|protocol)\b/i],
    [4, /\b(?:github|gitlab|docker|kubernetes|postgres(?:ql)?|sqlite|rust|golang|node\.js|react|python|javascript|typescript|webassembly|wasm|stackoverflow|claude code|qwenputer|mistral large|gemini [0-9]|macbook|android dos|risc-v)\b/i],
    [3, /\b(?:computer|computing|internet|cloud infrastructure|cybersecurity|encryption|protocol|terminal|command line|developer tool|self-hosted)\b/i],
    [4, /(?:编程|程序员|源代码|开源软件|人工智能|机器学习|大语言模型|数据库|操作系统|编译器|软件工程)/u],
  ],
  Design: [
    [5, /\b(?:user experience|\bux\b|\bui\b|interaction design|graphic design|industrial design|typography|design system|web design|accessibility design)\b/i],
    [4, /\b(?:interface|visual design|designing|redesign|usability|user research|information architecture|color theory|type design|layout)\b/i],
    [4, /(?:用户体验|交互设计|平面设计|工业设计|字体设计|设计系统)/u],
  ],
  'Hong Kong': [
    [6, /(?:香港|港府|港人|港鐵|港铁|特區政府|特区政府|立法會|立法会|行政長官|行政长官|港島|港岛|九龍|九龙|新界|中環|中环|旺角|銅鑼灣|铜锣湾|大埔|沙田)/u],
    [5, /\b(?:hong kong|hongkong|hkfp|rthk|legco|chief executive of hong kong|hong kong government)\b/i],
  ],
  Society: [
    [6, /\b(?:martin luther king(?:,? jr\.?| junior)?|mlk|civil rights movement|civil rights|labor movement|workers' rights|human rights|racial segregation|voting rights|mass incarceration|immigration policy|public health|housing crisis|social security|surveillance capitalism)\b/i],
    [5, /\b(?:election|president|parliament|government|protest|strike|union workers|court ruling|lawsuit|discrimination|inequality|poverty|war crimes|refugees|democracy|censorship|criminal justice|police violence)\b/i],
    // Timeline/chronology words describe format, not topic; they help only
    // when paired with separate society evidence such as a named movement.
    [2, /\b(?:history of|historical|timeline of|chronology of)\b/i],
    [5, /(?:民權|民权|社會運動|社会运动|勞工權益|劳工权益|選舉|选举|政府政策|人權|人权|種族隔離|种族隔离)/u],
  ],
  Philosophy: [
    [6, /\b(?:philosophy|philosopher|ethics of|epistemology|metaphysics|free will|consciousness|meaning of life|moral responsibility|political philosophy|philosophy of)\b/i],
    [5, /(?:哲學|哲学|倫理學|伦理学|認識論|认识论|形而上學|形而上学)/u],
  ],
  Literature: [
    [6, /\b(?:novel|short story|poem|poetry|poet|literature|literary|book review|reading list|writer's notebook|fiction|prose)\b/i],
    [5, /(?:小說|小说|文學|文学|詩歌|诗歌|詩人|诗人)/u],
  ],
  Arts: [
    [6, /\b(?:museum|exhibition|artwork|visual arts|fine art|painting|sculpture|photography|film festival|cinema|music album|album review|composer|dance performance)\b/i],
    [5, /(?:藝術|艺术|美術|美术|展覽|展览|繪畫|绘画|雕塑|攝影|摄影|電影|电影|音樂|音乐)/u],
  ],
};

const CATEGORIES = Object.keys(RULES);

/**
 * Classify a Hacker News title using explicit topical signals only.
 * @param {string | {title?: string}} input title string or item with a title
 * @returns {{category: string|null, confidence: number, evidence: string[], scores: Record<string, number>}}
 */
export function classify(input) {
  const title = typeof input === 'string' ? input : input?.title;
  const normalized = typeof title === 'string' ? title.normalize('NFKC').trim() : '';
  const scores = Object.fromEntries(CATEGORIES.map((category) => [category, 0]));
  const evidenceByCategory = Object.fromEntries(CATEGORIES.map((category) => [category, []]));

  if (!normalized) return { category: null, confidence: 0, evidence: [], scores };

  for (const [category, rules] of Object.entries(RULES)) {
    for (const [points, pattern] of rules) {
      const match = normalized.match(pattern);
      if (!match) continue;
      scores[category] += points;
      evidenceByCategory[category].push(match[0]);
    }
  }

  const ranked = CATEGORIES.map((category) => ({ category, score: scores[category] }))
    .sort((a, b) => b.score - a.score || CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category));
  const [best, runnerUp] = ranked;
  // Require meaningful positive evidence and a margin. This keeps broad words
  // such as “AI”, “history”, or “design” from silently deciding mixed topics.
  if (best.score < 4 || best.score - runnerUp.score < 2) {
    return { category: null, confidence: 0, evidence: [], scores };
  }

  const confidence = Math.min(0.97, Number((0.62 + Math.min(best.score, 10) * 0.025 + Math.min(best.score - runnerUp.score, 8) * 0.025).toFixed(2)));
  return { category: best.category, confidence, evidence: evidenceByCategory[best.category], scores };
}

export const classifyHnTitle = classify;
