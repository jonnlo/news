// Small, explainable ranking adjustments for recurring format/category mismatches.
// These are ranking hints only: stories remain eligible for selection.

const RULE_PENALTIES = {
  societySports: 8,
  promotionalSolicitation: 8,
  literatureIndustryBusiness: 5,
  designImplementationDetail: 3,
};

function textOf(story) {
  return `${story.title ?? ''} ${story.excerpt ?? ''}`
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[’‘]/g, "'");
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function countGroups(text, groups) {
  return groups.reduce((count, group) => count + Number(hasAny(text, group)), 0);
}

const sportsGroups = [
  [/\b(?:baseball|basketball|football|soccer|hockey|cricket|tennis|golf|rugby|wrestling)\b/i],
  [/\b(?:world series|playoffs?|championship|league|tournament|season opener|game\s+\d+)\b/i],
  [/\b(?:team|club|pitcher|batter|quarterback|coach|roster|score|inning|home run|touchdown)\b/i],
];

const solicitationGroups = [
  [/\b(?:survey|questionnaire|feedback|weigh in|share your (?:thoughts|views|experience)|tell us what you think|we(?:'|’)d like to (?:learn|hear)|would love to speak)\b/i],
  [/\b(?:subscribe|subscription|member(?:ship)?[- ]only|subscriber[- ]only|sign up|register|join us)\b/i],
  [/\b(?:ask the editor|question for the editor|submit (?:a )?question|we want to hear from you|help us understand|take part|participate)\b/i],
];

const publishingIndustryGroups = [
  [/\b(?:publishers?|publishing|book trade|literary agent|imprint|bookseller)\b/i],
  [/\b(?:bankruptcy|liquidation|acquir(?:e|es|ed|ing)|merger|layoffs?|exit|start(?:s|ed|ing)? (?:a )?(?:pr|publicity) firm|publicity|terms of service|amicus brief|trade association)\b/i],
  [/\b(?:business|industry|court|contract|deal|operations|restructur(?:e|ing)|corporate|commercial|rights dispute|firm)\b/i],
];

const designImplementationGroups = [
  [/\b(?:css|html|javascript|typescript|web platform|browser API|DOM)\b/i],
  [/\b(?:code|coding|function|syntax|selector|property|implementation|API|query|grid layout|stylesheet)\b/i],
  [/\b(?:developer|programmer|front[- ]end|web development|snippet|technical guide|debugging)\b/i],
];

/**
 * Return a bounded, positive score deduction and stable explanations for a story.
 * A zero penalty means the story has no strong signal covered by these rules.
 * The Hong Kong category is intentionally excluded from all heuristics.
 *
 * @param {{title?: string, excerpt?: string, category?: string}} story
 * @returns {{penalty: number, reasons: string[]}}
 */
export function categoryFitAdjustment(story = {}) {
  if (story.category === 'Hong Kong') return { penalty: 0, reasons: [] };

  const text = textOf(story);
  const reasons = [];

  if (story.category === 'Society' && (countGroups(text, sportsGroups) >= 2 || /\bworld series\b/i.test(text) && /\bgame\s+\d+\b/i.test(text))) {
    reasons.push('society-sports-coverage');
  }

  // A survey, a subscription product, or a reader question can be editorial
  // coverage. Require multiple invitation/marketing signals before downranking.
  if (countGroups(text, solicitationGroups) >= 2 || /^(?:we(?:'|’)d love to (?:speak|hear) (?:to|from) you|we want to hear from you)[!?.]*$/i.test(String(story.title ?? '').trim())) {
    reasons.push('reader-solicitation-or-promotion');
  }

  // Require both publishing-domain language and business/administrative framing;
  // ordinary reviews, author interviews, and literary criticism remain neutral.
  const sourceText = String(story.source ?? '').normalize('NFKC').toLocaleLowerCase();
  const publishingSource = hasAny(sourceText, publishingIndustryGroups[0]);
  const publishingContext = hasAny(text, publishingIndustryGroups[0]) || publishingSource;
  const publishingBusiness = publishingIndustryGroups.slice(1)
    .some((group) => hasAny(text, group));
  if (story.category === 'Literature' && publishingContext && publishingBusiness) {
    reasons.push('literature-industry-business');
  }

  // Technical implementation details can be useful design coverage, so apply a
  // smaller deduction and require several distinct technical signals.
  if (story.category === 'Design' && countGroups(text, designImplementationGroups) >= 2) {
    reasons.push('design-implementation-detail');
  }

  const penalty = Math.min(8, reasons.reduce((sum, reason) => {
    const value = reason === 'society-sports-coverage' ? RULE_PENALTIES.societySports
      : reason === 'reader-solicitation-or-promotion' ? RULE_PENALTIES.promotionalSolicitation
        : reason === 'literature-industry-business' ? RULE_PENALTIES.literatureIndustryBusiness
          : RULE_PENALTIES.designImplementationDetail;
    return sum + value;
  }, 0));

  return { penalty, reasons };
}
