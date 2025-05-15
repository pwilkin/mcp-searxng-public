# mcp-searxng-public
An MCP server that queries public SearXNG instances, parsing HTML contents into a JSON result

## Rationale

All the MCP servers for SearXNG that I've seen use "json" as the output format. While that is certainly a *faster* way to code a SearXNG MCP server, it will make it fail on virtually all public servers since they don't expose the JSON format.

This server will read from up to three public SearXNG servers (using one as main and the others as fallback) and will parse the results into JSON.

## Installation

Install via `npm install mcp-serxng-public`.

If the server is installed, the run configuration is:
```json
{
      "name": "SearXNGScraper",
      "type": "stdio",
      "command": "npx",
      "args": ["mcp-searxng-public"],
      "capabilities": {
        "tool-calls": true
      },
      "env": {
        "SEARXNG_BASE_URL": "https://searx.be/",
        "SEARXNG_URL_2": "https://searx.tiekoetter.com/",
        "SEARXNG_URL_3": "https://opnxng.com/"
      }
}
```

(you can use any servers from https://searx.space/ as your selected servers)

## Usage

The server exposes one endpoint: `search`. The endpoint takes two arguments: `query` - the search query and an optional `time_range`, which takes a time range parameter according to the https://docs.searxng.org/dev/search_api.html spec (`day`, `month` or `year`).

Returned is an array of objects:
```json
[
      {
        url: 'https://github.com/searxng/searxng',
        summary: 'You can start SearXNG using make run in the terminal or by pressing Ctrl+Shift+B'
      },
      {
        url: 'https://searx.bndkt.io/',
        summary: 'Powered by searxng - 2025.3.22+5986629c6 — a privacy-respecting, open metasearch engine Source code | Issue tracker | Engine stats | Public instances | Contact instance maintainer'
      },
      {
        url: 'https://docs.searxng.org/',
        summary: 'SearXNG is a free internet metasearch engine which aggregates results from up to 243 search services. Users are neither tracked nor profiled. Additionally, SearXNG can be used over Tor …'
      },
      {
        url: 'https://en.wikipedia.org/wiki/SearXNG',
        summary: 'SearXNG is federated, and as such is hosted by several instances, public and private. Private instances are hosted on a local network, or run on the user&#x27;s desktop computer itself, and are …'
      },
      {
        url: 'https://github.com/searxng',
        summary: 'searxng Public SearXNG is a free internet metasearch engine which aggregates results from various search services and databases. Users are neither tracked nor profiled.'
      },
      {
        url: 'https://docs.searxng.org/user/about.html',
        summary: 'SearXNG is a fork from the well-known searx metasearch engine which was inspired by the Seeks project. It provides basic privacy by mixing your queries with searches on other …'
      },
      {
        url: 'https://agentic.so/tools/searxng',
        summary: 'import {SearxngClient } from &#x27;@agentic/searxng&#x27; const searxng = new SearxngClient const res = await searxng. search ({query: &#x27;us election&#x27;, engines: [&#x27;google&#x27;, &#x27;reddit&#x27;, &#x27;hackernews&#x27;]})'
      },
      {
        url: 'https://blog.nuneshiggs.com/searxng-mergulhemos-nas-pesquisas-eficientes-e-sem-publicidade-paga/',
        summary: '26 de set. de 2024 · O SearXNG é uma das implementações mais avançadas e conhecidas de um metasearch engine. Ele é um projeto em opensource e oferece uma interface simples para …'
      },
      {
        url: 'https://docs.searxng.org/admin/installation-searxng.html',
        summary: 'To install SearXNG’s dependencies, exit the SearXNG bash session you opened above and start a new one. Before installing, check if your virtualenv was sourced from the login (~/.profile):'
      },
      {
        url: 'https://dbtechreviews.com/2024/10/23/setting-up-searxng-your-private-search-engine-via-docker/',
        summary: '23 de out. de 2024 · One such tool is SearXNG, a versatile and privacy-respecting meta search engine. This article guides you through setting up your own SearXNG instance using Docker, …'
      }
]
```
