import test from 'node:test';
import assert from 'node:assert/strict';
import { CodingAgent } from '../src/agents/codingAgent.js';
import { PlanGenerator } from '../src/planner/planGenerator.js';

test('resumes a clarification by rebuilding the plan before execution', async () => {
  let createPlanCalls = [];

  const agent = new CodingAgent({
    promptBuilder: { build: () => [] },
    memory: { get: () => [], addMany: () => {} },
    llm: { chat: async () => ({ content: '{}', thinking: '', done: true, raw: {} }) },
    toolParser: { parse: () => ({ type: 'response', content: 'done' }) },
    toolRegistry: {
      has: () => false,
      list: () => [],
      get: () => null,
    },
    workspaceContext: { build: () => ({ currentTargetFile: null }) },
    workspaceService: {
      load: async () => ({})
    },
    contextEngine: {
      build: async () => ({ context: '' })
    },
    editingEngine: {
      applyEdit: async () => ({ diff: '' })
    },
    planner: {
      cache: {
        getPlan: () => ({ goal: 'Create a new file', decision: { strategy: 'clarify' } }),
        clear: () => {},
        savePlan: () => {},
      },
      tracker: {
        status: 'WaitingForUser',
        plan: { steps: [] },
        getProgress: () => ({ remainingSteps: [{ id: 'clarify', type: 'clarification' }] }),
      },
      analyzeTask: () => ({ needContext: true, planningRequired: false }),
      createPlan: (...args) => {
        createPlanCalls.push(args);
        return { goal: { goal: 'Create a new file' }, steps: [] };
      },
      nextStep: () => {
        if (createPlanCalls.length === 0) {
          throw new Error('nextStep called before createPlan');
        }
        return null;
      },
      recordStepResult: () => {},
      decisionEngine: {
        cache: { getDecision: () => ({ strategy: 'clarify' }) },
        resolveClarification: () => ({ strategy: 'create_auth_scratch' }),
      },
      inspector: { inspect: () => ({}) },
    },
    eventBus: {
      emitStatus: () => true,
      emitDone: () => true,
    },
  });

  const result = await agent.chat('I choose option 1');

  assert.equal(createPlanCalls.length, 1);
  assert.equal(createPlanCalls[0][3]?.strategy, 'create_auth_scratch');
  assert.equal(result.type, 'response');
});

test('builds express steps without jwt when authentication strategy is none', () => {
  const generator = new PlanGenerator();
  const plan = generator.generate('Create login endpoint', { category: 'feature' }, {
    projectStrategy: 'express',
    authenticationStrategy: 'none',
    confidence: 0.95,
  });

  assert.equal(plan.steps.some(step => step.target.includes('jsonwebtoken')), false);
  assert.equal(plan.steps.some(step => step.target.includes('npm install express')), true);
});

test('adds jwt steps when authentication strategy is jwt', () => {
  const generator = new PlanGenerator();
  const plan = generator.generate('Create login endpoint using JWT', { category: 'feature' }, {
    projectStrategy: 'express',
    authenticationStrategy: 'jwt',
    confidence: 0.95,
  });

  assert.equal(plan.steps.some(step => step.target.includes('jsonwebtoken')), true);
  assert.equal(plan.steps.some(step => step.description.includes('JWT')), true);
});

test('pauses execution and returns manual instructions for disabled terminal steps', async () => {
  let tracker = null;

  const agent = new CodingAgent({
    promptBuilder: { build: () => [] },
    memory: { get: () => [], addMany: () => {} },
    llm: { chat: async () => ({ content: JSON.stringify({ type: 'tool_call', tool: 'terminal_execute', args: { command: 'npm install express' } }), thinking: '', done: true, raw: {} }) },
    toolParser: { parse: () => ({ type: 'tool_call', tool: 'terminal_execute', args: { command: 'npm install express' } }) },
    toolRegistry: {
      has: () => true,
      list: () => [],
      get: () => ({
        execute: async () => ({ success: false, message: 'Terminal execution is intentionally disabled until a safe command policy is defined.' }),
      }),
    },
    workspaceContext: { build: () => ({ currentTargetFile: null }) },
    workspaceService: { load: async () => ({}) },
    contextEngine: { build: async () => ({ context: '' }) },
    editingEngine: { applyEdit: async () => ({ diff: '' }) },
    planner: {
      cache: { getPlan: () => null, clear: () => {}, savePlan: () => {} },
      tracker: { status: 'Pending', plan: { steps: [] }, getProgress: () => ({ remainingSteps: [], completedSteps: [], failedSteps: [], progressPercentage: 0, currentStep: null }) },
      analyzeTask: () => ({ needContext: true, planningRequired: true, category: 'feature' }),
      createPlan: () => ({ goal: { goal: 'Create login endpoint' }, steps: [{ id: 'step_install', type: 'tool', target: 'npm install express', description: 'Install Express', dependsOn: [], failureStrategy: 'retry', status: 'pending' }] }),
      nextStep: () => ({ id: 'step_install', type: 'tool', target: 'npm install express', description: 'Install Express', dependsOn: [], failureStrategy: 'retry', status: 'pending' }),
      recordStepResult: () => {},
      decisionEngine: { cache: { getDecision: () => ({}) } },
      inspector: { inspect: () => ({}) },
    },
    eventBus: { emitStatus: () => true, emitDone: () => true },
  });

  tracker = agent.planner.tracker;
  const result = await agent.chat('Create login endpoint');

  assert.equal(result.type, 'response');
  assert.equal(result.content.includes('Please run:'), true);
  assert.equal(tracker.status, 'WaitingForManualAction');
});

test('refreshes workspace metadata after a successful write_file tool call', async () => {
  let refreshed = false;

  const agent = new CodingAgent({
    planner: {
      tracker: { status: 'Executing' },
      cache: { clear: () => {} },
    },
    workspaceService: {
      refresh: async () => {
        refreshed = true;
        return { entryPoint: 'src/index.js' };
      },
    },
    toolRegistry: {
      has: () => true,
      list: () => [],
      get: () => ({
        execute: async () => ({ success: true, message: 'ok' }),
      }),
    },
    eventBus: {
      emitStatus: () => true,
      emitDone: () => true,
    },
  });

  const toolResult = await agent.executeToolCall(
    { tool: 'write_file', args: { path: 'index.js', content: 'console.log(1);' } },
    1,
    { entryPoint: 'src/index.js' }
  );

  assert.equal(refreshed, true);
  assert.equal(toolResult.success, true);
});
