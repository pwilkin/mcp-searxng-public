## mcp-searxng-public
An MCP server that queries public SearXNG instances, parsing HTML contents into a JSON result

# Rationale

All the MCP servers for SearXNG that I've seen use "json" as the output format. While that is certainly a *faster* way to code a SearXNG MCP server, it will make it fail on virtually all public servers since they don't expose the JSON format.

This server will read from up to three public SearXNG servers (using one as main and the others as fallback) and will parse the results into JSON.
