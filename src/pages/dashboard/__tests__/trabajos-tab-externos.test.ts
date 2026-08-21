import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const trabajosFilePath = resolve(__dirname, '../trabajos.astro');
const trabajosContent = readFileSync(trabajosFilePath, 'utf-8');

function extractTemplate(source: string): string {
  const fmEnd = source.indexOf('\n---\n', 3);
  if (fmEnd === -1) return source;
  const scriptStart = source.indexOf('\n  <script>', fmEnd + 5);
  if (scriptStart === -1) return source.slice(fmEnd + 5);
  return source.slice(fmEnd + 5, scriptStart);
}

const template = extractTemplate(trabajosContent);

describe('Scenario: Tab "Externos" is default and overrides legacy bookmarks', () => {
  it('Test 1: Default "Externos" tab is active on page load', () => {
    // The "Externos" button should be first in the tab list with the active class initially
    expect(template).toContain('id="tab-externos"');
    expect(template).toContain('id="panel-externos"');

    // Verify the Externos tab has primary color indicator initially (matches ACTIVE_TAB_CLASS pattern)
    const tabExternos = template.match(
      /id="tab-externos"[^>]*class="border-b-2 border-primary[^"]*text-primary/,
    );
    expect(tabExternos).toBeTruthy();

    // The panel should come before the internos panel (visual hierarchy)
    const externIndex = template.indexOf('id="panel-externos"');
    const internIndex = template.indexOf('id="panel-internos"');
    expect(externIndex).toBeLessThan(internIndex);
  });

  it('Test 11: Error state message text is present and distinct from empty state', () => {
    expect(template).toContain('id="external-jobs-error"');
    expect(template).toContain('external-jobs-error');

    // Verify error div is distinct from empty state
    expect(template).toContain('id="external-jobs-empty"');
    expect(template).toContain('search_off');

    // Error div should have different styling class (error vs neutral)
    const errorDiv = template.match(
      /id="external-jobs-error"[^>]*class="[^"]*error[^"]*"/,
    );
    expect(errorDiv).toBeTruthy();

    // Empty state has different icon and text
    expect(template).toContain('No se encontraron ofertas externas');
  });
});

describe('Scenario: In-page tab navigation respects URL state', () => {
  it('Test 2: Tab "Internos" button text (no longer "Disponibles")', () => {
    // Verify "Disponibles" is NOT present
    expect(template).not.toContain('>Disponibles<');

    // Verify "Internos" IS present as the renamed tab
    expect(template).toContain('id="tab-internos"');
    expect(template).toContain('>Internos<');

    // Verify panel is also renamed
    expect(template).toContain('id="panel-internos"');
    expect(template).not.toContain('id="panel-disponibles"');
  });

  it('Test 3: URL updates to ?tab=internos when clicking "Internos" tab', () => {
    // Verify the script contains setTab function that syncs to URL
    expect(trabajosContent).toContain('function setTab(');
    expect(trabajosContent).toContain("url.searchParams.set('tab', tab)");

    // Verify the case for internos is handled
    expect(trabajosContent).toContain("if (tab === 'internos'");
    expect(trabajosContent).toContain('tab-internos');

    // Verify the internos button has a click listener
    expect(trabajosContent).toContain(
      "tabInternos.addEventListener('click', () => setTab('internos', true))",
    );

    // Verify getTabFromUrl returns 'internos' for the tab param
    expect(trabajosContent).toContain("if (tab === 'internos') return 'internos'");
  });

  it('Test 15: Old ?tab=disponibles param is no longer present (renamed to ?tab=internos)', () => {
    // Ensure no reference to 'disponibles' as a tab value in the script
    expect(trabajosContent).not.toContain("'disponibles'");
    expect(trabajosContent).not.toContain('"disponibles"');

    // Verify 'internos' is used instead
    expect(trabajosContent).toContain("'internos'");
  });

  it('Test 14: URL state includes q, categoryName, page, and tab params', () => {
    // Verify syncExternalFiltersToUrl function writes all params
    expect(trabajosContent).toContain('function syncExternalFiltersToUrl()');
    expect(trabajosContent).toContain("url.searchParams.set('tab', 'externos')");
    expect(trabajosContent).toContain("url.searchParams.set('q',");
    expect(trabajosContent).toContain("url.searchParams.set('categoryName',");
    expect(trabajosContent).toContain("url.searchParams.set('page',");

    // Verify params are also read on init
    expect(trabajosContent).toContain("urlParams.get('q')");
    expect(trabajosContent).toContain("urlParams.get('categoryName')");
    expect(trabajosContent).toContain("urlParams.get('page')");
  });
});

describe('Scenario: Category dropdown displays with counts and caches across filter changes', () => {
  it('Test 4: External category dropdown exists with count format <name> (<count>)', () => {
    expect(template).toContain('id="external-category-filter"');
    expect(template).toContain('<option value="">Todas las categorías</option>');

    // Verify the rendering logic includes count format
    expect(trabajosContent).toContain('populateExternalCategories');
    expect(trabajosContent).toContain('${cat.name} (${cat.count})');
  });

  it('Test 5: "Todas las categorías" is the first option in the dropdown', () => {
    const categoryStart = template.indexOf('id="external-category-filter"');
    const categoryEnd = template.indexOf('</select>', categoryStart);
    const categorySection = template.slice(categoryStart, categoryEnd);

    // First option should be "Todas las categorías"
    const firstOption = categorySection.match(/<option[^>]*>([^<]*)<\/option>/);
    expect(firstOption?.[1]).toBe('Todas las categorías');
  });

  it('Test 9: Pagination buttons ("Anterior" and "Siguiente") exist with proper id attributes', () => {
    expect(template).toContain('id="external-jobs-prev"');
    expect(template).toContain('id="external-jobs-next"');

    // Find the button text by searching around the button ID
    const prevMatch = template.match(/id="external-jobs-prev"[^>]*>[\s\S]*?<\/button>/);
    const nextMatch = template.match(/id="external-jobs-next"[^>]*>[\s\S]*?<\/button>/);

    expect(prevMatch?.[0] || '').toContain('Anterior');
    expect(nextMatch?.[0] || '').toContain('Siguiente');

    // Both buttons should have type="button"
    expect(template).toContain(
      'id="external-jobs-prev" type="button"',
    );
    expect(template).toContain(
      'id="external-jobs-next" type="button"',
    );
  });
});

describe('Scenario: Debounced search 300ms updates listings and syncs URL state', () => {
  it('Test 6: Search input exists and has debounce indicator (or placeholder text suggesting search)', () => {
    expect(template).toContain('id="external-search-input"');
    expect(template).toContain('placeholder="Título, empresa…"');
    expect(template).toContain('type="search"');

    // Verify label
    expect(template).toContain('for="external-search-input"');
    expect(template).toContain('Buscar');
  });

  it('Test 13: Debounce logic is present in script (setTimeout + clearTimeout pattern)', () => {
    // Check for debounce variable declaration
    expect(trabajosContent).toContain('let searchDebounce: ReturnType<typeof setTimeout>');

    // Verify the debounce pattern
    expect(trabajosContent).toContain('clearTimeout(searchDebounce)');
    expect(trabajosContent).toContain('searchDebounce = setTimeout');

    // Verify it's specifically 300ms
    expect(trabajosContent).toContain('setTimeout(() => void fetchAndRenderExternalJobs(), 300)');

    // Verify the input event listener
    expect(trabajosContent).toContain(
      "externalSearchInput.addEventListener('input',",
    );
  });
});

describe('Scenario: Job cards display all fields and open in new tab with security headers', () => {
  it('Test 7: Job cards render with source mapping (getonboard → "Get on Board")', () => {
    // Verify SOURCE_LABELS is imported
    expect(trabajosContent).toContain('SOURCE_LABELS');

    // Verify mapping is used in renderExternalJobCards
    expect(trabajosContent).toContain(
      'SOURCE_LABELS[job.source] ?? job.source',
    );

    // Verify renderExternalJobCards function exists and uses the mapping
    expect(trabajosContent).toContain('function renderExternalJobCards');

    // Verify SOURCE_LABELS is imported from externalJobsService
    expect(trabajosContent).toContain('from \'../../services/externalJobsService\'');
  });

  it('Test 8: "Ver oferta" buttons have rel="noopener noreferrer" and target="_blank"', () => {
    // Verify the link element with both security attributes in the full file content
    // (not in static template but in the dynamic template strings in the script)
    expect(trabajosContent).toContain('target="_blank"');
    expect(trabajosContent).toContain('rel="noopener noreferrer"');

    // Verify the text "Ver oferta" is in a link with the correct attributes
    const verOfertaPattern = /href="\$\{escapeHtml\(job\.url\)\}"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/;
    expect(trabajosContent).toMatch(verOfertaPattern);

    // Also verify the text "Ver oferta" appears in the template (may have whitespace)
    expect(trabajosContent).toMatch(/Ver\s+oferta\s*<\/a>/);
  });

  it('Test 10: Empty state displays search_off icon when data is empty', () => {
    expect(template).toContain('id="external-jobs-empty"');
    expect(template).toContain('search_off');
    expect(template).toContain(
      'No se encontraron ofertas externas con ese criterio',
    );
  });

  it('Test 12: Loading state with spinner indicator and text exists', () => {
    expect(template).toContain('id="external-jobs-loading"');
    expect(template).toContain('Cargando ofertas externas…');

    // Verify loading has spinner animation
    const loadingSection = template.indexOf('id="external-jobs-loading"');
    const loadingContent = template.slice(loadingSection, loadingSection + 500);
    expect(loadingContent).toContain('animate-spin');
  });
});
