#!/usr/bin/node
import { ContentResult, FastMCP, SerializableValue, TextContent, UserError } from 'fastmcp';
import { z } from 'zod';

const server = new FastMCP({
    name: 'SearXNGScraper',
    version: '1.0.6',
});

const baseUrl: string[] | undefined = process.env.SEARXNG_BASE_URL?.split(";");

type Log = {
    debug: (message: string, data?: SerializableValue) => void;
    error: (message: string, data?: SerializableValue) => void;
    info: (message: string, data?: SerializableValue) => void;
    warn: (message: string, data?: SerializableValue) => void;
}

async function fetchResults(log: Log, query: string, time_range: string, baseUrl: string): Promise<ContentResult> {
    if (!baseUrl) {
        throw new UserError('SEARXNG_BASE_URL environment variable is not set.');
    }
    // Construct URL without format=json
    const url = `${baseUrl}/search?q=${encodeURIComponent(query)}${time_range ? `&time_range=${time_range}` : ''}`;
    try {
        log.debug('Fetching results from SearXNG', { url });
        let response;
        try {
            response = await fetch(url);
        } catch (error) {
            log.error('Error fetching results from SearXNG', { error: error instanceof Error ? error.message : String(error) });
        }
        if (response === undefined || !response.ok) {
            throw new UserError(`HTTP error! Response: ${JSON.stringify(response ?? 'undefined')}`);
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
            } else {
                log.warn('No URL found in result block', { blockHtml });
            }
        }
        return {
            content: [{ type: 'text', text: JSON.stringify(resultsArray) }],
        };
    } catch (error) {
        throw new UserError(`Error fetching "${query}" results from SearXNG ${baseUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

server.addTool({
    name: 'search',
    description: 'Performs a web search for a given query using the public SearXNG search servers. Returns an array of result objects with \'url\' and \'summary\' for each result.',
    parameters: z.object({
        query: z.string({ description: 'The search query.' }),
        time_range: z.string({ description: 'The optional time range for the search, from: [day, month, year].' }).optional().default(''),
    }),
    execute: async (params, { log }) => {
        const { query, time_range } = params;
        if (baseUrl === undefined || baseUrl.length === 0) {
            throw new UserError('SEARXNG_BASE_URL environment variable is not set.');
        }
        let baseUrlToTry = baseUrl.filter(Boolean);
        let shuffledUrls = baseUrlToTry.sort(() => Math.random() - 0.5); // Shuffle the URLs
        let response = await fetchResults(log, query, time_range, shuffledUrls[0]);
        let retries = 0;
        while (retries < 5 && ((!response.content) || (response.content[0] as TextContent)?.text?.length < 10)) {
            await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for 1 second before retrying
            // Try next base URL if available
            try {
                if (shuffledUrls.length > 1) {
                    shuffledUrls = shuffledUrls.slice(1);
                    response = await fetchResults(log, query, time_range, shuffledUrls[0]!);
                } else {
                    response = await fetchResults(log, query, time_range, shuffledUrls[0]);
                }
            } catch (error) {
                log.error('Error fetching results, trying next base URL', { error: error instanceof Error ? error.message : String(error) });
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
