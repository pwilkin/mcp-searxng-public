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

If the server is installed, the run configuration is (for Cursor or Cursor-compatible clients) as follows:

```json
{
  "SearXNGScraper": {
    "command": "npx",
    "args": ["mcp-searxng-public"],
    "capabilities": {
      "tool-calls": true
    },
    "env": {
      "SEARXNG_BASE_URL": "https://metacat.online;https://nyc1.sx.ggtyler.dev;https://ooglester.com;https://search.080609.xyz;https://search.canine.tools;https://search.catboy.house;https://search.citw.lgbt;https://search.einfachzocken.eu;https://search.federicociro.com;https://search.hbubli.cc;https://search.im-in.space;https://search.indst.eu",
      "DEFAULT_LANGUAGE": "en"
    }
  }
}

```
**Note:** You may need to adjust the `env` variables, particularly `SEARXNG_BASE_URL`, to point to your preferred SearXNG instances. The `DEFAULT_LANGUAGE` can also be set as needed. You can run the `report` task to get a report on good (accessible) SearXNG instances which you can put in the URLs line.

[![Add MCP Server sear-xng-scraper to LM Studio](https://files.lmstudio.ai/deeplink/mcp-install-light.svg)](https://lmstudio.ai/install-mcp?name=sear-xng-scraper&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyJtY3Atc2VhcnhuZy1wdWJsaWMiXSwiZW52Ijp7IlNFQVJYTkdfQkFTRV9VUkwiOiJodHRwczovL21ldGFjYXQub25saW5lO2h0dHBzOi8vbnljMS5zeC5nZ3R5bGVyLmRldjtodHRwczovL29vZ2xlc3Rlci5jb207aHR0cHM6Ly9zZWFyY2guMDgwNjA5Lnh5ejtodHRwczovL3NlYXJjaC5jYW5pbmUudG9vbHM7aHR0cHM6Ly9zZWFyY2guY2F0Ym95LmhvdXNlO2h0dHBzOi8vc2VhcmNoLmNpdHcubGdidDtodHRwczovL3NlYXJjaC5laW5mYWNoem9ja2VuLmV1O2h0dHBzOi8vc2VhcmNoLmZlZGVyaWNvY2lyby5jb207aHR0cHM6Ly9zZWFyY2guaGJ1YmxpLmNjO2h0dHBzOi8vc2VhcmNoLmltLWluLnNwYWNlO2h0dHBzOi8vc2VhcmNoLmluZHN0LmV1IiwiREVGQVVMVF9MQU5HVUFHRSI6ImVuIn19)

## Usage

The server exposes one endpoint: `search`. The endpoint takes four arguments:
* `query` - the search query
* `time_range` (optional) - which takes a time range parameter according to the https://docs.searxng.org/dev/search_api.html spec (`day`, `month` or `year`).
* `language` (optional) - the language code for the search (e.g., `en`, `es`, `fr`). If not provided, it defaults to the value of the `DEFAULT_LANGUAGE` environment variable. If neither is set, no language parameter is sent to SearXNG.
* `detailed` (optional) - if set to "true", performs a more thorough search by querying up to 3 servers and fetching multiple pages of results (pages 1, 2, and 3) from each server, then merging and deduplicating the results.

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
