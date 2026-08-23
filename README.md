# mcp-commune-france

MCP server for French commune intelligence: geo.api.gouv.fr, postal codes, departments, regions, and dataset discovery.

## Tools

Run the MCP and call `commune_france_get_sources` first to inspect source coverage. This server also exposes domain-specific tools for the topic described above.

Includes commune resolution, department commune lists, commune profiles, and BAN address geocoding.

## Install

```bash
npm install
npm run build
npm test
npm run dev
```

## Claude Desktop

```json
{
  "mcpServers": {
    "commune-france": {
      "command": "npx",
      "args": ["mcp-commune-france"]
    }
  }
}
```

## Sources

- geo.api.gouv.fr: https://geo.api.gouv.fr/
- data.gouv.fr API: https://doc.data.gouv.fr/api/reference/
- BAN: https://adresse.data.gouv.fr/
- INSEE official statistics: https://www.insee.fr/

## Publishing

See [docs/publishing.md](docs/publishing.md).

## Glama / Docker

The repo includes `Dockerfile` and `glama.json`.

Build steps:

```json
["npm install", "npm run build"]
```

CMD arguments:

```json
["node", "dist/index.js"]
```

## Safety

This MCP helps agents discover and summarize public sources. It is not an official authority. Verify decisions against the competent public service or original data producer.

## License

MIT
