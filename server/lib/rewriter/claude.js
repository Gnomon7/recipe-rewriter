const Anthropic = require('@anthropic-ai/sdk');
const config = require('../../config');

const REWRITE_TOOL = {
  name: 'submit_rewritten_steps',
  description: 'Submit the rewritten instruction steps with ingredient measurements inlined.',
  input_schema: {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        items: { type: 'string' },
        description: 'Rewritten instruction steps, same order and count as the input steps.',
      },
    },
    required: ['steps'],
  },
};

async function rewriteClaude({ ingredients, instructions }) {
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to .env or set REWRITE_ENGINE=local.');
  }

  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const ingredientList = ingredients.map((i) => `- ${i}`).join('\n');
  const stepList = instructions.map((s, idx) => `${idx + 1}. ${s}`).join('\n');

  const prompt = `You are formatting a recipe for a cookbook. Here is the ingredient list with quantities, and the instruction steps.

Ingredients:
${ingredientList}

Instructions:
${stepList}

Rewrite the instruction steps so that the FIRST time each ingredient is mentioned in the instructions, its quantity and unit from the ingredient list is inserted immediately before it, wrapped in double curly braces, e.g. "whisk together the {{2 cups}} flour, {{1/3 cup}} sugar".

Rules:
- Wrap ONLY the inserted quantity/unit text in {{ }}. Do not wrap anything else.
- Do not change the wording, order, or number of steps otherwise.
- Only insert a quantity the first time an ingredient is mentioned across all steps; leave later mentions of the same ingredient unmodified.
- If an ingredient has no clear quantity (e.g. "salt to taste"), leave it unmodified.
- Do not invent measurements that are not in the ingredient list.
- Call the submit_rewritten_steps tool with exactly ${instructions.length} steps, in the same order as the input.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 4096,
    tools: [REWRITE_TOOL],
    tool_choice: { type: 'tool', name: 'submit_rewritten_steps' },
    messages: [{ role: 'user', content: prompt }],
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse || !Array.isArray(toolUse.input.steps) || toolUse.input.steps.length !== instructions.length) {
    throw new Error('Claude did not return rewritten steps in the expected format.');
  }

  return { instructions: toolUse.input.steps };
}

module.exports = { rewriteClaude };
