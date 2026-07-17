import { describe, expect, test } from 'bun:test';
import { parseVisionAnalysisResponse } from './vision-analysis.tools';

describe('vision analysis response validation', () => {
  test('accepts strict JSON and keeps only safe direct canvas fixes', () => {
    const result = parseVisionAnalysisResponse(`\`\`\`json
{
  "meetsRequirements": false,
  "score": 6.5,
  "failureType": "layout",
  "repairStrategy": "regenerate",
  "critique": "The focal point is weak.",
  "suggestions": "Use a stronger crop.",
  "repairInstruction": "Regenerate with a closer crop.",
  "fixes": [
    {"refId":"title","fontSize":56,"text":"do not rewrite copy","url":"https://evil.invalid"}
  ]
}
\`\`\``);

    expect(result).toMatchObject({
      meetsRequirements: false,
      score: 6.5,
      failureType: 'composition',
      repairStrategy: 'regenerate',
    });
    expect(result.fixes).toEqual([{ refId: 'title', fontSize: 56 }]);
  });

  test('never evaluates non-JSON model output', () => {
    (globalThis as any).__visionParserExecuted = false;
    expect(() => parseVisionAnalysisResponse(
      '({ meetsRequirements: true, score: 9, value: (globalThis.__visionParserExecuted = true) })',
    )).toThrow();
    expect((globalThis as any).__visionParserExecuted).toBe(false);
    delete (globalThis as any).__visionParserExecuted;
  });

  test('requires the quality-gate fields and bounded scores', () => {
    expect(() => parseVisionAnalysisResponse('{"score":9}')).toThrow(
      'meetsRequirements',
    );
    expect(() => parseVisionAnalysisResponse(
      '{"meetsRequirements":true,"score":11,"failureType":"none"}',
    )).toThrow('invalid score');
  });

  test('normalizes contradictory pass signals into a safe retry', () => {
    const analysis = parseVisionAnalysisResponse(JSON.stringify({
      meetsRequirements: true,
      score: 7,
      failureType: 'none',
      repairStrategy: 'none',
      critique: '',
      suggestions: '',
      repairInstruction: '',
      fixes: [],
    }));

    expect(analysis.meetsRequirements).toBe(false);
    expect(analysis.failureType).toBe('technical');
    expect(analysis.repairStrategy).toBe('retry');
  });
});
