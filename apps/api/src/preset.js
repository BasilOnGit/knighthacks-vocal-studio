export function validatePrompt(body) {
  if (!body || typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 1000) {
    throw new Error('Provide a vocal style description between 1 and 1000 characters.');
  }
  return body.prompt.trim();
}
export async function generatePreset(prompt) {
  // Implement a Hugging Face provider adapter after selecting an available model.
  // Keep HF_TOKEN on the server; validate and clamp all model output before returning it.
  const error = new Error('Hugging Face generation is not implemented yet. See docs/BUILD_PLAN.md.');
  error.status = 501;
  throw error;
}
