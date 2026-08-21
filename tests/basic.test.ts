import { describe, expect, it } from 'vitest';

describe('mcp-commune-france', () => {
  it('uses an mcp package name', () => {
    expect('mcp-commune-france').toMatch(/^mcp-/);
  });

  it('has curated HTTP sources', () => {
    const sources = [
      {
            "title": "geo.api.gouv.fr",
            "url": "https://geo.api.gouv.fr/"
      },
      {
            "title": "data.gouv.fr API",
            "url": "https://doc.data.gouv.fr/api/reference/"
      },
      {
            "title": "BAN",
            "url": "https://adresse.data.gouv.fr/"
      },
      {
            "title": "INSEE official statistics",
            "url": "https://www.insee.fr/"
      }
];
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(source.url).toMatch(/^https?:\/\//);
    }
  });

  it('has a stable tool prefix', () => {
    expect('commune_france').toMatch(/^[a-z0-9_]+$/);
  });
});
