import { GateSyntaxBuilder } from './GateSyntaxBuilder';
import './styles/theme.css';

const UI_FILES = ['main.ui', 'controls.ui', 'binding.ui', 'commands.ui', 'data.ui'];

async function boot(): Promise<void> {
  const root = document.getElementById('root')!;
  root.innerHTML =
    `<div class="gs-loading"><div class="gs-spinner"></div><span>Loading GateSyntaxWebb…</span></div>`;

  const sources = await Promise.all(
    UI_FILES.map(f =>
      fetch(`/UI/${f}`)
        .then(r => { if (!r.ok) throw new Error(`Cannot load ${f}`); return r.text(); })
        .then(content => ({ content, name: f })),
    ),
  );

  root.innerHTML = '';
  GateSyntaxBuilder.fromContents(sources).build().mount('#root');
}

boot().catch(err => {
  const root = document.getElementById('root');
  if (root) root.innerHTML = `<div class="gs-error"><h2>Load error</h2><pre>${err}</pre></div>`;
});
