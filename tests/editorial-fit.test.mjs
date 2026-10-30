import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryFitAdjustment } from '../scripts/editorial-fit.mjs';

test('downranks sports reports filed under Society with a modest, explained penalty', () => {
  const result = categoryFitAdjustment({
    category: 'Society',
    title: 'The club takes the championship after a close Game 5',
    excerpt: 'The baseball team and its pitcher celebrated the final score with fans.',
  });
  assert.equal(result.penalty, 8);
  assert.deepEqual(result.reasons, ['society-sports-coverage']);
});

test('does not infer a Society sports mismatch from a single sports mention', () => {
  assert.deepEqual(categoryFitAdjustment({
    category: 'Society', title: 'A new baseball program supports local youth',
  }), { penalty: 0, reasons: [] });
});

test('downranks reader solicitation only when invitation and promotion signals combine', () => {
  const result = categoryFitAdjustment({
    category: 'Society',
    title: 'Member-only event: ask the editor your questions',
    excerpt: 'Register to join us and share your views in our reader survey.',
  });
  assert.equal(result.penalty, 8);
  assert.deepEqual(result.reasons, ['reader-solicitation-or-promotion']);
  assert.deepEqual(categoryFitAdjustment({
    category: 'Society', title: 'A survey finds changing views on public transport',
    excerpt: 'Researchers surveyed residents across the city.',
  }), { penalty: 0, reasons: [] });
});

test('downranks Literature business and publishing operations while preserving literary coverage', () => {
  const result = categoryFitAdjustment({
    category: 'Literature',
    title: 'Publisher proposes liquidation plan in bankruptcy court',
    excerpt: 'The business restructuring follows a difficult year in the book trade.',
  });
  assert.equal(result.penalty, 5);
  assert.deepEqual(result.reasons, ['literature-industry-business']);
  assert.deepEqual(categoryFitAdjustment({
    category: 'Literature', title: 'A new novel explores memory and migration',
    excerpt: 'The author discusses the book’s characters and creative process.',
  }), { penalty: 0, reasons: [] });
  assert.deepEqual(categoryFitAdjustment({
    category: 'Literature', source: 'Example Publishing Trade Journal',
    title: 'Editorial director exits to start a publicity firm',
  }), { penalty: 5, reasons: ['literature-industry-business'] });
});

test('applies a smaller penalty to technical implementation detail in Design', () => {
  const result = categoryFitAdjustment({
    category: 'Design',
    title: 'Using CSS grid and JavaScript to build a responsive table',
    excerpt: 'The code walks through selectors, functions, and implementation details.',
  });
  assert.equal(result.penalty, 3);
  assert.deepEqual(result.reasons, ['design-implementation-detail']);
  assert.deepEqual(categoryFitAdjustment({
    category: 'Design', title: 'Why playful spaces help people feel at home',
    excerpt: 'A designer explains the visual choices behind the project.',
  }), { penalty: 0, reasons: [] });
});

test('never applies these fit penalties to Hong Kong stories', () => {
  assert.deepEqual(categoryFitAdjustment({
    category: 'Hong Kong',
    title: 'Members can register for a sports survey',
    excerpt: 'Publishers share CSS design updates and ask readers for feedback.',
  }), { penalty: 0, reasons: [] });
});

