import { describe, expect, it } from 'vitest';
import { renderReactionBar } from '../comunidad/reactionBar';

describe('renderReactionBar', () => {
  it('incluye targetType y targetId en data-attributes', () => {
    const html = renderReactionBar({ targetType: 'community_post', targetId: 'abc' });
    expect(html).toContain('data-rx-type="community_post"');
    expect(html).toContain('data-rx-id="abc"');
  });

  it('sin reacciones: el trigger dice "Recomendar" y no hay resumen', () => {
    const html = renderReactionBar({ targetType: 'community_comment', targetId: 'c1' });
    expect(html).toContain('Recomendar');
    expect(html).not.toContain('reacciones"');
    expect(html).not.toContain('1 reacción"');
  });

  it('con reacción propia: muestra label ES resaltado y el total', () => {
    const html = renderReactionBar({
      targetType: 'community_post',
      targetId: 'p1',
      reactions: { LIKE: 3, LOVE: 1 },
      myReaction: 'LIKE',
    });
    expect(html).toContain('Me gusta');
    expect(html).toContain('text-primary');
    expect(html).toContain('aria-label="4 reacciones"');
    expect(html).toContain('>4</span>');
  });

  it('el popover expone los 6 aria-label ES', () => {
    const html = renderReactionBar({ targetType: 'community_post', targetId: 'p2' });
    for (const label of ['Me gusta', 'Me encanta', 'Me divierte', 'Me asombra', 'Me entristece', 'No me gusta']) {
      expect(html).toContain(`aria-label="${label}"`);
    }
  });

  it('rx-option class attribute has no double spaces (active or inactive)', () => {
    // inactive: no myReaction — every rx-option must have a clean class string
    const htmlInactive = renderReactionBar({ targetType: 'community_post', targetId: 'p3' });
    const inactiveMatches = [...htmlInactive.matchAll(/class="([^"]*rx-option[^"]*)"/g)];
    expect(inactiveMatches.length).toBeGreaterThan(0);
    for (const m of inactiveMatches) {
      expect(m[1]).not.toContain('  ');
    }

    // active: myReaction set — the active option gets bg-primary/15, still no double spaces
    const htmlActive = renderReactionBar({ targetType: 'community_post', targetId: 'p4', myReaction: 'LIKE' });
    const activeMatches = [...htmlActive.matchAll(/class="([^"]*rx-option[^"]*)"/g)];
    expect(activeMatches.length).toBeGreaterThan(0);
    for (const m of activeMatches) {
      expect(m[1]).not.toContain('  ');
    }
    // the active option itself must include the highlight class
    expect(htmlActive).toContain('bg-primary/15');
  });
});
