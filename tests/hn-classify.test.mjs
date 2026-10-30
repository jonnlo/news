import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, classifyHnTitle } from '../scripts/hn-classify.mjs';

test('does not infer Technology from Hacker News placement or vague AI wording', () => {
  assert.equal(classify('Why AI makes us rethink what intelligence means').category, null);
  assert.equal(classify('A history of civil rights organizing').category, 'Society');
  assert.equal(classify('Show HN: a weekend in the mountains').category, null);
});

test('distinguishes an MLK history title from an AI coding project', () => {
  const mlk = classify('A visual chronology of Martin Luther King Jr. and the civil rights movement');
  assert.equal(mlk.category, 'Society');
  assert.ok(mlk.confidence >= 0.7);
  assert.ok(mlk.evidence.some((item) => /Martin Luther King/i.test(item)));

  const coding = classify('Show HN: I built an AI coding agent in Rust');
  assert.equal(coding.category, 'Technology');
  assert.ok(coding.confidence >= 0.7);
  assert.ok(coding.evidence.length > 0);
});

test('routes strong signals across the requested topics', () => {
  const cases = [
    ['Practical typography for readable interfaces', 'Design'],
    ['香港立法會通過新的交通法案', 'Hong Kong'],
    ['Workers organize a nationwide strike over wages', 'Society'],
    ['The philosophy of free will and moral responsibility', 'Philosophy'],
    ['A new poem from the Paris Review', 'Literature'],
    ['Inside the museum exhibition of contemporary sculpture', 'Arts'],
  ];

  for (const [title, expected] of cases) {
    const result = classify(title);
    assert.equal(result.category, expected, title);
    assert.ok(result.confidence > 0);
    assert.ok(result.evidence.length > 0);
  }
});

test('supports Chinese HN titles and keeps mixed or insufficient evidence unknown', () => {
  assert.equal(classify('Show HN: 用 Rust 编程语言写的数据库').category, 'Technology');
  assert.equal(classify('香港人工智能政策引发公众讨论').category, 'Hong Kong');
  assert.equal(classify('AI and ethics').category, null);
  assert.equal(classify('Chronology of a century').category, null);
  assert.equal(classify('').category, null);
  assert.equal(classify({ title: 'The philosophy of consciousness' }).category, 'Philosophy');
  assert.deepEqual(classifyHnTitle('Untitled').scores, classify('Untitled').scores);
});
