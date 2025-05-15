#!/usr/bin/node
import { ContentResult, FastMCP, TextContent } from 'fastmcp';
import { z } from 'zod';

const server = new FastMCP({
    name: 'SearXNGScraper',
    version: '1.0.0',
});

const baseUrl = process.env.SEARXNG_BASE_URL;
const baseUrl2 = process.env.SEARXNG_URL_2;
const baseUrl3 = process.env.SEARXNG_URL_3;

async function fetchResults(query: string, time_range: string, baseUrl: string): Promise<ContentResult> {

    if (!baseUrl) {
        throw new Error('SEARXNG_BASE_URL environment variable is not set.');
    }
    // Construct URL without format=json
    const url = `${baseUrl}/search?q=${encodeURIComponent(query)}${time_range ? `&time_range=${time_range}` : ''}`;
    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const html = await response.text();

        // Basic HTML parsing to find result blocks, URLs, and summaries.
        // This is a naive approach and may not work for all SearXNG instances
        // due to variations in HTML structure. A proper HTML parser would be more robust.
        const resultsArray: { url: string; summary: string }[] = [];
        // Corrected regex to use standard HTML tags instead of escaped ones
        // Updated regex to match article tags with class 'result'
        const resultBlockRegex = /<article[^>]*class=["'][^"']*result[^"']*["'][^>]*>(.*?)<\/article>/gis;
        let blockMatch;

        while ((blockMatch = resultBlockRegex.exec(html)) !== null) {
            const blockHtml = blockMatch[1];
            // Updated regex to match the URL within the 'url_header' class link
            const urlMatch = blockHtml.match(/<a[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*url_header[^"']*["']/i);
            // Updated regex to match the summary within the 'content' class paragraph
            const summaryMatch = blockHtml.match(/<p[^>]*class=["'][^"']*content[^"']*["'][^>]*>(.*?)<\/p>/is);

            const url = urlMatch ? urlMatch[1] : 'No URL found';
            const summary = summaryMatch ? summaryMatch[1].replace(/<[^>]*>/g, '').trim() : 'No summary found'; // Remove HTML tags from summary

            // Add result only if a URL is found (even if summary is not)
            if (url !== 'No URL found') {
                resultsArray.push({ url, summary });
            }
        }
        return {
            content: [{ type: 'text', text: JSON.stringify(resultsArray) }],
        };
    } catch (error) {
        throw new Error(`Error fetching from SearXNG: ${error instanceof Error ? error.message : String(error)}`);
    }
}

server.addTool({
    name: 'search',
    description: 'Performs a web search for a given query using the public SearXNG search servers. Returns an array of result objects with \'url\' and \'summary\' for each result.',
    parameters: z.object({
        query: z.string({ description: 'The search query.' }),
        time_range: z.string({ description: 'The optional time range for the search, from: [day, month, year].' }).optional().default(''),
    }),
    execute: async (params) => {
        const { query, time_range } = params;
        let response = await fetchResults(query, time_range, baseUrl!);
        let baseUrlToTry = [baseUrl, baseUrl2, baseUrl3].filter(Boolean);
        let retries = 0;
        while (retries < 3 && ((!response.content) || (response.content[0] as TextContent)?.text?.length < 10)) {
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second before retrying
            // Try next base URL if available
            if (baseUrlToTry.length > 1) {
                baseUrlToTry = baseUrlToTry.slice(1);
                response = await fetchResults(query, time_range, baseUrlToTry[0]!);
            } else {
                response = await fetchResults(query, time_range, baseUrl!);
            }
            retries++;
        }
        return response;
    },
});

process.on('SIGINT', async () => {
    process.exit(0);
});

process.stdout.on('error', (err) => {
    if (err.code === 'EPIPE') {
        process.exit(0);
    } else {
        throw err;
    }
});

server.start({ transportType: 'stdio' });
