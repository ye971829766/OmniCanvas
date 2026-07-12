import { describe, expect, test } from 'bun:test';
import { AgentMemory } from './agent.memory';

describe('AgentMemory plan quality gates', () => {
  test('keeps a failed verification failed until a successful retry', () => {
    const plan = {
      id: 'plan-ecommerce',
      title: '淘宝套图',
      sourceAssetId: 'asset-product',
      steps: [
        {
          id: 'verify-main',
          title: '淘宝主图',
          status: 'pending',
          platform: 'taobao',
          deliverable: 'main',
          tools: ['generate_image', 'verify_design'],
          completionTool: 'verify_design',
        },
      ],
    } as any;
    const session = { messages: [], lastAccess: Date.now(), plan };
    const statuses: string[] = [];
    const memory = Object.create(AgentMemory.prototype) as any;
    memory.getSession = () => session;
    memory.saveSession = () => statuses.push(plan.steps[0].status);

    const input = { platform: 'taobao', deliverable: 'main' };
    memory.updatePlanForTool('session', 'verify_design', input, false);
    memory.updatePlanForTool('session', 'verify_design', input, true, true);
    expect(plan.steps[0].status).toBe('failed');

    memory.updatePlanForTool('session', 'verify_design', input, false);
    memory.updatePlanForTool('session', 'verify_design', input, true, false);

    expect(plan.steps[0].status).toBe('completed');
    expect(statuses).toEqual(['in_progress', 'failed', 'in_progress', 'completed']);
  });
});
