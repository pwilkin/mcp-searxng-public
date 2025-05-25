# mcp-searxng-public
An MCP server that queries public SearXNG instances, parsing HTML contents into a JSON result

<a href="https://glama.ai/mcp/servers/@pwilkin/mcp-searxng-public">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@pwilkin/mcp-searxng-public/badge" alt="SearXNG Server MCP server" />
</a>

## Rationale

All the MCP servers for SearXNG that I've seen use "json" as the output format. While that is certainly a *faster* way to code a SearXNG MCP server, it will make it fail on virtually all public servers since they don't expose the JSON format.

This server will read from up to three public SearXNG servers (using one as main and the others as fallback) and will parse the results into JSON.

## Installation

Install via `npm install mcp-searxng-public`.

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
        "SEARXNG_BASE_URL": "https://searx.be;https://searx.tiekoetter.com;https://opnxng.com;https://searxng.world;https://searx.oloke.xyz;https://seek.fyi",
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
        "url": "https://github.com/searxng/searxng",
        "summary": "You can start SearXNG using make run in the terminal or by pressing Ctrl+Shift+B"
      },
      {
        "url": "https://searx.bndkt.io/",
        "summary": "Powered by searxng - 2025.3.22+5986629c6 — a privacy-respecting, open metasearch engine Source code | Issue tracker | Engine stats | Public instances | Contact instance maintainer"
      },
      {
        "url": "https://docs.searxng.org/"
        "summary": "SearXNG is a free internet metasearch engine which aggregates results from up to 243 search services. Users are neither tracked nor profiled. Additionally, SearXNG can be used over Tor …"
      }
      {
        "url": "https://en.wikipedia.org/wiki/SearXNG",
        "summary": "SearXNG is federated, and as such is hosted by several instances, public and private. Private instances are hosted on a local network, or run on the user&#x27;s desktop computer itself, and are …"
      }
]
```