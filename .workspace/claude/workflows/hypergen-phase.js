export const meta = {
  name: 'hypergen-phase',
  description: 'Hypergen phase loop: plan -> develop (1-3 devs) -> write tests -> run tests -> fix until green -> update docs',
  whenToUse: 'Run one Hypergen phase goal. args: { goal: string, date: "YYYY-MM-DD", maxDevs?: 1-3 }',
  phases: [
    { title: 'Plan', detail: 'planner splits goal into subtasks; orchestrator assigns tools' },
    { title: 'Build', detail: 'per layer: develop -> tests -> run -> fix until green' },
    { title: 'Record', detail: 'orchestrator updates HANDOFF, TODO, ADR' },
  ],
}

const goal = args && args.goal
if (!goal) throw new Error('args.goal is required')
const maxDevs = Math.min(3, Math.max(1, (args && args.maxDevs) || 3))
const MAX_FIX_ROUNDS = 3

const SUBTASKS = {
  type: 'object',
  properties: {
    subtasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          acceptance: { type: 'array', items: { type: 'string' } },
          dependsOn: { type: 'array', items: { type: 'string' } },
          tools: { type: 'string' },
        },
        required: ['id', 'title', 'files', 'acceptance', 'dependsOn'],
      },
    },
    questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['subtasks', 'questions'],
}

const REPORT = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    failures: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          test: { type: 'string' },
          error: { type: 'string' },
          cause: { type: 'string' },
          file: { type: 'string' },
          preexisting: { type: 'boolean' },
        },
        required: ['test', 'error', 'cause'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['passed', 'failures', 'summary'],
}

const fmt = t => `${t.id} "${t.title}"\nFiles: ${t.files.join(', ')}\nAcceptance:\n- ${t.acceptance.join('\n- ')}\nTool hints: ${t.tools || 'see TOOLS.md'}`

phase('Plan')
// args.subtasks: an already-approved plan (e.g. a previous planner run grouped into work packages) skips re-planning.
let assigned = args.subtasks ? { subtasks: args.subtasks, questions: [] } : null
if (!assigned && args.subtasksFile) {
  assigned = await agent(
    `Read the JSON array in ${args.subtasksFile} and return it verbatim as "subtasks" (questions: []). Do not change any field.`,
    { agentType: 'planner', label: 'planner:load', schema: SUBTASKS, effort: 'low' })
}
if (!assigned) {
  const plan = await agent(`Goal: ${goal}\nSplit it into subtasks.`, { agentType: 'planner', label: 'planner', schema: SUBTASKS })
  if (plan.questions.length) {
    log(`Planner needs user decisions: ${plan.questions.join(' | ')}`)
    return { status: 'needs-user', questions: plan.questions, subtasks: plan.subtasks }
  }
  assigned = await agent(
    `Add a "tools" hint to each subtask per TOOLS.md and return the same list (unchanged otherwise):\n${JSON.stringify(plan.subtasks)}`,
    { agentType: 'orchestrator', label: 'orchestrator:assign', schema: SUBTASKS })
}

// Layering is deterministic code: dependencies first, then no file overlap within a layer, at most maxDevs per layer.
const done = new Set()
let pending = assigned.subtasks.slice()
const layers = []
while (pending.length) {
  const ready = pending.filter(t => t.dependsOn.every(d => done.has(d)))
  if (!ready.length) throw new Error(`Dependency cycle among: ${pending.map(t => t.id).join(', ')}`)
  const layer = [], held = new Set()
  for (const t of ready) {
    if (layer.length >= maxDevs || t.files.some(f => held.has(f))) continue
    t.files.forEach(f => held.add(f))
    layer.push(t)
  }
  layer.forEach(t => done.add(t.id))
  pending = pending.filter(t => !done.has(t.id))
  layers.push(layer)
}
log(`${assigned.subtasks.length} subtasks in ${layers.length} layers (max ${maxDevs} devs)`)

phase('Build')
const results = []
for (let li = 0; li < layers.length; li++) {
  // Each subtask: develop -> write tests -> run -> fix loop. Red blocks the next layer.
  const outcomes = await pipeline(
    layers[li],
    (t, _, i) => agent(`Implement subtask:\n${fmt(t)}`, { agentType: 'developer', label: `dev-${i + 1}:${t.id}`, phase: 'Build' }),
    (dev, t) => agent(`Write edge-case tests for subtask:\n${fmt(t)}\nDeveloper report:\n${dev}`, { agentType: 'test-writer', label: `tests:${t.id}`, phase: 'Build' }),
    async (tests, t, i) => {
      let report = await agent(`Run tests for ${t.id}. Test-writer output:\n${tests}`, { agentType: 'test-runner', label: `run:${t.id}`, phase: 'Build', schema: REPORT })
      for (let round = 1; !report.passed && round <= MAX_FIX_ROUNDS; round++) {
        const fix = await agent(`A failing test report needs a corrective subtask. Code or test wrong? Give the smallest fix instruction.\nSubtask:\n${fmt(t)}\nReport:\n${JSON.stringify(report)}`, { agentType: 'orchestrator', label: `replan:${t.id}#${round}`, phase: 'Build' })
        await agent(`Fix round ${round} for subtask:\n${fmt(t)}\nOrchestrator instruction:\n${fix}`, { agentType: 'developer', label: `dev-${i + 1}:fix:${t.id}#${round}`, phase: 'Build' })
        report = await agent(`Re-run the tests for ${t.id} (same commands as before).\n${tests}`, { agentType: 'test-runner', label: `rerun:${t.id}#${round}`, phase: 'Build', schema: REPORT })
      }
      return { id: t.id, title: t.title, report }
    },
  )
  const ok = outcomes.filter(Boolean)
  results.push(...ok)
  const red = ok.filter(o => !o.report.passed)
  if (red.length || ok.length < layers[li].length) {
    log(`Layer ${li + 1} still red after ${MAX_FIX_ROUNDS} fix rounds: ${red.map(r => r.id).join(', ') || 'agent dropped'}. Stopping.`)
    phase('Record')
    await agent(`Record a BLOCKED run. Goal: ${goal}. Date: ${args.date}. Results: ${JSON.stringify(results)}`, { agentType: 'orchestrator', label: 'orchestrator:record' })
    return { status: 'blocked', layer: li + 1, results }
  }
}

phase('Record')
await agent(`Record a completed run. Goal: ${goal}. Date: ${args.date}. Results: ${JSON.stringify(results)}`, { agentType: 'orchestrator', label: 'orchestrator:record' })
return { status: 'green', results }
