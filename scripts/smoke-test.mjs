#!/usr/bin/env node

const sources = [
  [
    "geo.api.gouv.fr",
    "https://geo.api.gouv.fr/"
  ],
  [
    "data.gouv.fr API",
    "https://doc.data.gouv.fr/api/reference/"
  ],
  [
    "BAN",
    "https://adresse.data.gouv.fr/"
  ],
  [
    "INSEE official statistics",
    "https://www.insee.fr/"
  ]
];
let failures = 0;

for (const [title, url] of sources) {
  try {
    const response = await fetch(url, { headers: { Accept: 'text/html,application/json,*/*', 'User-Agent': 'mcp-commune-france-smoke/0.1' } });
    const body = await response.text();
    const ok = response.ok && body.length > 50;
    console.log(`${ok ? 'OK' : 'FAIL'} ${response.status} ${title} ${url}`);
    if (!ok) failures += 1;
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${title} ${url} ${error.message}`);
  }
}

process.exitCode = failures === 0 ? 0 : 1;
