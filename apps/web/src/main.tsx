import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
function App() {
  const [prompt, setPrompt] = React.useState('');
  const [result, setResult] = React.useState<unknown>(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  async function generate(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setResult(null);
    try {
      const response = await fetch('/api/presets/generate', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({prompt})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Request failed');
      setResult(data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Request failed'); }
    finally { setBusy(false); }
  }
  return <main><p className="eyebrow">KNIGHTHACKS 2026</p><h1>Your voice. Your sound.</h1>
    <p>Describe the vocal effect you want to create.</p>
    <form onSubmit={generate}><label htmlFor="prompt">Vocal style</label>
    <textarea id="prompt" maxLength={1000} value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Warm R&B vocals with a little reverb…" required />
    <button disabled={busy || !prompt.trim()}>{busy ? 'Generating…' : 'Generate preset'}</button></form>
    {error && <p role="alert">{error}</p>}
    {result !== null && <pre>{JSON.stringify(result,null,2)}</pre>}
    <p className="note">Starter project: AI generation, audio effects, and saving presets are upcoming milestones.</p>
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
