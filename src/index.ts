#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const CONFIG = {
  "name": "mcp-commune-france",
  "prefix": "commune_france",
  "description": "MCP server for French commune intelligence: geo.api.gouv.fr, postal codes, departments, regions, and dataset discovery.",
  "sources": [
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
  ]
} as const;

interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

function jsonResult(data: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

function errorResult(message: string): ToolResult {
  const data = { error: message };
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
    isError: true,
  };
}

function textFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json,*/*',
      'User-Agent': `${CONFIG.name}/0.1 (+https://github.com/Hug0x0/${CONFIG.name})`,
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${url}`);
  }
  return response.json() as Promise<T>;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,text/plain,application/xml,*/*',
      'User-Agent': `${CONFIG.name}/0.1 (+https://github.com/Hug0x0/${CONFIG.name})`,
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${url}`);
  }
  return response.text();
}

function dataGouvDatasetSummary(dataset: Record<string, unknown>) {
  return {
    id: dataset.id,
    slug: dataset.slug,
    title: dataset.title,
    page: dataset.page,
    organization: dataset.organization && typeof dataset.organization === 'object'
      ? (dataset.organization as Record<string, unknown>).name
      : undefined,
    resources_count: Array.isArray(dataset.resources) ? dataset.resources.length : undefined,
  };
}

async function searchDataGouv(query: string, pageSize: number) {
  const url = new URL('https://www.data.gouv.fr/api/1/datasets/');
  url.searchParams.set('q', query);
  url.searchParams.set('page_size', String(pageSize));
  const data = await fetchJson<{ data?: Array<Record<string, unknown>>; total?: number }>(url.toString());
  return {
    query,
    total: data.total,
    datasets: (data.data ?? []).map(dataGouvDatasetSummary),
  };
}

function normalizePortalUrl(portalUrl: string): string {
  return portalUrl.replace(/\/$/, '');
}

async function odsRecords(portalUrl: string, dataset: string, params: Record<string, string | number | undefined>) {
  const url = new URL(`${normalizePortalUrl(portalUrl)}/api/explore/v2.1/catalog/datasets/${encodeURIComponent(dataset)}/records`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }
  return fetchJson<Record<string, unknown>>(url.toString());
}

const server = new McpServer({ name: CONFIG.name, version: '0.1.0' });

server.tool(
  `${CONFIG.prefix}_get_sources`,
  'List curated sources used by this MCP.',
  {},
  async () => jsonResult({ server: CONFIG.name, description: CONFIG.description, sources: CONFIG.sources })
);

server.tool(
  `${CONFIG.prefix}_fetch_source_excerpt`,
  'Fetch a short text excerpt from a curated source by index or title keyword.',
  {
    source_key: z.string().describe('Source index, title keyword, or URL fragment.'),
    max_chars: z.number().int().min(200).max(4000).default(1200),
  },
  async ({ source_key, max_chars }) => {
    const normalized = source_key.toLowerCase();
    const source = CONFIG.sources.find((item, index) =>
      String(index + 1) === normalized ||
      item.title.toLowerCase().includes(normalized) ||
      item.url.toLowerCase().includes(normalized)
    );
    if (!source) return errorResult(`Unknown source: ${source_key}`);
    try {
      const text = await fetchText(source.url);
      return jsonResult({ source, excerpt: textFromHtml(text).slice(0, max_chars) });
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : 'Failed to fetch source excerpt');
    }
  }
);


server.tool('commune_france_find_commune', 'Resolve French communes by name, INSEE code, or postal code using geo.api.gouv.fr.', {
  query: z.string(),
  limit: z.number().int().min(1).max(20).default(10),
}, async ({ query, limit }) => {
  try {
    const isCode = /^\d{5}$/.test(query);
    const url = new URL(isCode ? `https://geo.api.gouv.fr/communes/${query}` : 'https://geo.api.gouv.fr/communes');
    if (!isCode) { url.searchParams.set(/^\d{5}$/.test(query) ? 'codePostal' : 'nom', query); url.searchParams.set('boost', 'population'); url.searchParams.set('limit', String(limit)); }
    url.searchParams.set('fields', 'nom,code,codesPostaux,departement,region,population,centre');
    url.searchParams.set('format', 'json');
    const data = await fetchJson<Record<string, unknown> | Array<Record<string, unknown>>>(url.toString());
    return jsonResult({ query, communes: Array.isArray(data) ? data : [data] });
  } catch (error) { return errorResult(error instanceof Error ? error.message : 'Failed to resolve commune'); }
});

server.tool('commune_france_list_department_communes', 'List communes in a French department using geo.api.gouv.fr.', {
  department_code: z.string().describe('Department code, e.g. 75, 13, 974.'),
}, async ({ department_code }) => {
  try { return jsonResult({ department_code, communes: await fetchJson<Array<Record<string, unknown>>>(`https://geo.api.gouv.fr/departements/${department_code}/communes?fields=nom,code,codesPostaux,population,centre&format=json`) }); }
  catch (error) { return errorResult(error instanceof Error ? error.message : 'Failed to list department communes'); }
});

server.tool('commune_france_profile', 'Build a source-oriented commune profile with geo identity and suggested public-data queries.', {
  code_insee: z.string().regex(/^\d{5}$/),
}, async ({ code_insee }) => {
  try {
    const commune = await fetchJson<Record<string, unknown>>(`https://geo.api.gouv.fr/communes/${code_insee}?fields=nom,code,codesPostaux,departement,region,population,centre&format=json`);
    return jsonResult({ commune, suggested_queries: [`population ${commune.nom}`, `écoles ${commune.nom}`, `risques ${commune.nom}`, `SIRENE ${commune.nom}`, `marchés publics ${commune.nom}`] });
  } catch (error) { return errorResult(error instanceof Error ? error.message : 'Failed to build commune profile'); }
});

server.tool('commune_france_geocode_address', 'Geocode a French address with the Base Adresse Nationale API and return commune identifiers when available.', {
  address: z.string().describe('Address query, e.g. "20 avenue de Ségur Paris" or "rue de Paris Saint-Denis".'),
  limit: z.number().int().min(1).max(10).default(5),
}, async ({ address, limit }) => {
  try {
    const url = new URL('https://api-adresse.data.gouv.fr/search/');
    url.searchParams.set('q', address);
    url.searchParams.set('limit', String(limit));
    const data = await fetchJson<{ features?: Array<Record<string, unknown>> }>(url.toString());
    return jsonResult({
      address,
      source: url.toString(),
      matches: (data.features ?? []).map((feature) => {
        const properties = feature.properties && typeof feature.properties === 'object'
          ? feature.properties as Record<string, unknown>
          : {};
        return {
          label: properties.label,
          score: properties.score,
          type: properties.type,
          name: properties.name,
          postcode: properties.postcode,
          city: properties.city,
          citycode: properties.citycode,
          context: properties.context,
          geometry: feature.geometry,
        };
      }),
    });
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : 'Failed to geocode address');
  }
});

server.tool('commune_france_address_profile', 'Resolve an address to its most likely commune, then return the geo.api commune profile and suggested public-data queries.', {
  address: z.string().describe('Address or place query.'),
}, async ({ address }) => {
  try {
    const geocodeUrl = new URL('https://api-adresse.data.gouv.fr/search/');
    geocodeUrl.searchParams.set('q', address);
    geocodeUrl.searchParams.set('limit', '1');
    const geocode = await fetchJson<{ features?: Array<Record<string, unknown>> }>(geocodeUrl.toString());
    const first = geocode.features?.[0];
    const properties = first?.properties && typeof first.properties === 'object'
      ? first.properties as Record<string, unknown>
      : undefined;
    const citycode = properties?.citycode;
    if (typeof citycode !== 'string') {
      return errorResult('Address could not be resolved to a commune code');
    }

    const commune = await fetchJson<Record<string, unknown>>(`https://geo.api.gouv.fr/communes/${citycode}?fields=nom,code,codesPostaux,departement,region,population,centre&format=json`);
    return jsonResult({
      address,
      geocode_match: {
        label: properties?.label,
        score: properties?.score,
        geometry: first?.geometry,
      },
      commune,
      suggested_queries: [`population ${commune.nom}`, `écoles ${commune.nom}`, `risques ${commune.nom}`, `SIRENE ${commune.nom}`, `marchés publics ${commune.nom}`],
    });
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : 'Failed to build address profile');
  }
});


async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
  console.error(`${CONFIG.name} running on stdio`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
