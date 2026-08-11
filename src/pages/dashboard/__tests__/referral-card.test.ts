import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dashboardFilePath = resolve(__dirname, '../index.astro');
const dashboardContent = readFileSync(dashboardFilePath, 'utf-8');

function extractTemplate(source: string): string {
  const fmEnd = source.indexOf('\n---\n', 3);
  if (fmEnd === -1) return source;
  const scriptStart = source.indexOf('\n  <script>', fmEnd + 5);
  if (scriptStart === -1) return source.slice(fmEnd + 5);
  return source.slice(fmEnd + 5, scriptStart);
}

const template = extractTemplate(dashboardContent);

describe('dashboard referral card', () => {
  it('renders referral card in an extra 4-column row after the 8 metric cards', () => {
    const firstGridIndex = template.indexOf('grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4');
    const firstGridEnd = template.indexOf('</div>', firstGridIndex);
    const secondGridIndex = template.indexOf('grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4', firstGridEnd);
    const referralCardIndex = template.indexOf('id="referral-card"');

    expect(firstGridIndex).toBeGreaterThan(0);
    expect(secondGridIndex).toBeGreaterThan(firstGridIndex);
    expect(referralCardIndex).toBeGreaterThan(secondGridIndex);
    // Fila de 4 columnas: referral-card + plan-card + 2 empty slots.
    expect(template).toContain('data-referral-empty-slot="1"');
    expect(template).toContain('data-referral-empty-slot="2"');
    expect(template).not.toContain('data-referral-empty-slot="3"');
  });

  it('keeps copy button disabled by default and exposes manage action', () => {
    expect(template).toContain('id="referral-copy-button"');
    expect(template).toContain('Copiar link');
    expect(template).toContain('disabled');
    expect(template).toContain('id="referral-manage-button"');
    expect(template).toContain('Gestionar código');
  });

  it('uses hardcoded referral base URL and copy feedback timing', () => {
    expect(dashboardContent).toContain('const REFERRAL_BASE_URL = "https://tramacowork.com/registro?ref=";');
    expect(dashboardContent).toContain('const COPY_SUCCESS_LABEL = "¡Copiado!";');
    expect(dashboardContent).toContain('const COPY_RESET_DELAY_MS = 2000;');
  });

  it('wires manage button to modal entrypoint and syncs referral updates from modal event', () => {
    expect(dashboardContent).toContain('(window as any).openReferralModal?.(referralCode);');
    expect(dashboardContent).toContain('document.addEventListener("referral-code-updated", (event) => {');
    expect(dashboardContent).toContain('referralCode = detail.referralCode;');
    expect(dashboardContent).toContain('updateReferralCardState();');
  });
});
