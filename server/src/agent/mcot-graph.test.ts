import { describe, expect, test } from 'bun:test';
import { passesVisionQualityGate, runMCotLoop } from './mcot-graph';
import { TOOL_MAP } from './tool.registry';

describe('ecommerce visual quality gate', () => {
  test('requires a consistent pass signal instead of accepting either score field', () => {
    expect(passesVisionQualityGate({
      meetsRequirements: true,
      score: 4,
      failureType: 'none',
    })).toBe(false);
    expect(passesVisionQualityGate({
      meetsRequirements: false,
      score: 9,
      failureType: 'composition',
    })).toBe(false);
    expect(passesVisionQualityGate({
      meetsRequirements: true,
      score: 9,
      failureType: 'none',
    })).toBe(true);
  });

  test('analyzes a generated bitmap from its original server URL', async () => {
    const exportTool = TOOL_MAP.get('export_node_image')!;
    const analyzeTool = TOOL_MAP.get('analyze_design')!;
    const originalExport = exportTool.execute;
    const originalAnalyze = analyzeTool.execute;
    let exportCalls = 0;
    let analyzedSource = '';
    exportTool.execute = async () => {
      exportCalls++;
      return { output: { image: 'data:image/png;base64,AA==' } };
    };
    analyzeTool.execute = async (input: any) => {
      analyzedSource = input.imageBase64;
      return {
        output: {
          meetsRequirements: true,
          score: 9,
          failureType: 'none',
          repairStrategy: 'none',
        },
      };
    };

    try {
      const result = await runMCotLoop(
        {
          canvasState: [{
            refId: 'generated-image',
            type: 'image_gen',
            url: 'http://localhost:3000/files/generated.png',
          }],
          sink: { emit: () => undefined },
        } as any,
        'generated-image',
        'A finished image',
        1,
      );

      expect(result.success).toBe(true);
      expect(exportCalls).toBe(0);
      expect(analyzedSource).toBe('http://localhost:3000/files/generated.png');
    } finally {
      exportTool.execute = originalExport;
      analyzeTool.execute = originalAnalyze;
    }
  });

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
