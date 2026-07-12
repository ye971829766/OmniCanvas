import { describe, expect, test } from 'bun:test';
import { runMCotLoop } from './mcot-graph';
import { TOOL_MAP } from './tool.registry';

describe('ecommerce visual quality gate', () => {
  test('requires high product identity fidelity and avoids rechecking an unchanged bitmap', async () => {
    const exportTool = TOOL_MAP.get('export_node_image')!;
    const analyzeTool = TOOL_MAP.get('analyze_design')!;
    const originalExport = exportTool.execute;
    const originalAnalyze = analyzeTool.execute;
    exportTool.execute = async () => ({
      output: { image: 'data:image/png;base64,AA==' },
    });
    analyzeTool.execute = async () => ({
      output: {
        meetsRequirements: true,
        score: 9,
        identityFidelityScore: 7,
        failureType: 'identity',
        critique: 'Logo and outsole changed.',
        suggestions: 'Regenerate from the canonical source.',
      },
    });

    try {
      const progress: any[] = [];
      const result = await runMCotLoop(
        {
          sink: { emit: (event: any) => progress.push(event) },
        } as any,
        'image-1',
        'Keep the product exact',
        2,
        { referenceAssetId: 'asset-product', platform: 'taobao', deliverable: 'main' },
      );

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
      expect(result.analysis.failureType).toBe('identity');
      expect(progress.some((event) => String(event.message).includes('Regenerate'))).toBe(true);
    } finally {
      exportTool.execute = originalExport;
      analyzeTool.execute = originalAnalyze;
    }
  });
});
