#!/usr/bin/env node
import { randomInt } from 'crypto';
import { ContentResult, FastMCP, SerializableValue, TextContent, UserError } from 'fastmcp';
import { z } from 'zod';

const version = "1.2.5"

const server = new FastMCP({
    name: 'SearXNGScraper',
    version: version,
});

const baseUrl: string[] | undefined = process.env.SEARXNG_BASE_URL?.split(";");

type Log = {
    debug: (message: string, data?: SerializableValue) => void;
    error: (message: string, data?: SerializableValue) => void;
    info: (message: string, data?: SerializableValue) => void;
    warn: (message: string, data?: SerializableValue) => void;
}

// Helper method to add unique results to the results array
function addUniqueResults(
    allResults: { url: string; summary: string }[],
    newResults: { url: string; summary: string }[],
    processedUrls: Set<string>
): void {
    for (const result of newResults) {
        if (!processedUrls.has(result.url)) {
            allResults.push(result);
            processedUrls.add(result.url);
        }
    }
}

// Helper method to shuffle and filter base URLs
function shuffleAndFilterUrls(urls: (string | undefined)[]): string[] {
    return (urls.filter(Boolean) as string[]).sort(() => Math.random() - 0.5);
}

// Helper method to fetch multiple pages of results
async function fetchMultiplePages(
    log: Log,
    query: string,
    serverUrl: string,
    maxPages: number = 3,
    time_range?: string,
    language?: string
): Promise<{ url: string; summary: string }[]> {
    const allPageResults: { url: string; summary: string }[] = [];
    const processedUrls = new Set<string>();
    
    for (let page = 1; page <= maxPages; page++) {
        try {
            const pageResponse = await fetchResults(log, query, serverUrl, time_range, language, page);
            if (pageResponse.content && pageResponse.content.length > 0) {
                const pageText = (pageResponse.content[0] as TextContent).text;
                if (pageText && pageText.length > 10) {
                    const pageResults = JSON.parse(pageText);
                    // Add unique results from this page
                    addUniqueResults(allPageResults, pageResults, processedUrls);
                }
            }
        } catch (error) {
            log.warn(`Error fetching page ${page} results`, { error: error instanceof Error ? error.message : String(error) });
        }
    }
    
    return allPageResults;
}

// Helper method to handle retry logic for fetching results
async function fetchWithRetry(
    log: Log,
    query: string,
    shuffledUrls: string[],
    maxRetries: number = 5,
    time_range?: string,
    language?: string,
): Promise<ContentResult | undefined> {
    let response: ContentResult | undefined;
    let currentUrls = [...shuffledUrls];
    
    try {
        response = await fetchResults(log, query, currentUrls[0], time_range, language);
    } catch (error) {
        log.error('Error during first fetch: ', { error: error instanceof Error ? error.message : String(error) });
    }
    
    let retries = 0;
    while (retries < maxRetries && (response === undefined || (!response.content) || (response.content[0] as TextContent)?.text?.length < 10)) {
        if (retries > 0) {
            log.error(`Query to ${currentUrls[0]} yielded no data, retrying...`);
        }
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second before retrying
        // Try next base URL if available
        try {
            if (currentUrls.length > 1) {
                currentUrls = currentUrls.slice(1);
                response = await fetchResults(log, query, currentUrls[0], time_range, language);
            } else {
                response = await fetchResults(log, query, currentUrls[0], time_range, language);
            }
        } catch (error) {
            log.error('Error fetching results, trying next base URL', { error: error instanceof Error ? error.message : String(error) });
        }
        retries++;
    }
    
    return response;
}

export async function fetchResults(log: Log, query: string, baseUrl: string, time_range?: string, language?: string, page?: number, doNotRetryAgain?: boolean): Promise<ContentResult> {
    if (!baseUrl) {
        throw new UserError('Base URL not provided!');
    }
    // Construct URL without format=json
    const url = `${baseUrl}/search?q=${encodeURIComponent(query)}${time_range ? `&time_range=${time_range}` : ''}${language ? `&language=${language}` : ''}${page && page > 1 ? `&pageno=${page}` : ''}`;
    try {
        log.debug('Fetching results from SearXNG', { url });
        let response;
        try {
            // First fetch the base URL to get the main page
            response = await fetch(baseUrl,
                {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'mcp-searxng-public/' + version
                    }
                }
            );
            
            // Get the HTML content to find the client CSS file
            const html = await response.text();
            
            // Look for the client CSS file in the HTML
            const cssLinkMatch = html.match(/<link[^>]*rel=["']stylesheet["'][^>]*href=["'][^"']*\/client[^"']*\.css["'][^>]*>/i);
            if (cssLinkMatch) {
                const cssHrefMatch = cssLinkMatch[0].match(/href=["']([^"']*)["']/i);
                if (cssHrefMatch && cssHrefMatch[1]) {
                    const cssUrl = new URL(cssHrefMatch[1], baseUrl).href;
                    log.debug('Found client CSS file, fetching it', { cssUrl });
                    
                    // Fetch the client CSS file
                    try {
                        await fetch(cssUrl, {
                            method: 'GET',
                            headers: {
                                'Referer': baseUrl,
                                'User-Agent': 'mcp-searxng-public/' + version
                            }
                        });
                    } catch (cssError) {
                        log.warn('Failed to fetch client CSS file, continuing anyway', { cssError: cssError instanceof Error ? cssError.message : String(cssError) });
                    }
                }
            }
            
            await new Promise((resolve) => setTimeout(resolve, randomInt(10, 400)));
            response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Referer': baseUrl,
                    'User-Agent': 'mcp-searxng-public/' + version
                }
            });
        } catch (error) {
            log.error('Error fetching results from SearXNG', { error: error instanceof Error ? error.message : String(error) });
        }
        if (response === undefined || !response.ok) {
            throw new UserError(`HTTP error! Response: ${JSON.stringify(response ?? 'undefined')}`);
        }

        const html = await response.text();
        if (html.includes("body class=\"index_endpoint\"")) {
            // We were thrown to the main page, throw an error and force retry
            if (doNotRetryAgain) {
                throw new UserError("Redirected to index page");
            } else {
                await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for 2 seconds before retrying
                return await fetchResults(log, query, baseUrl, time_range, language, page, true);
            }
        }

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
        if (html.length > 50 && resultsArray.length == 0) {
            log.error(`Got html contents of: \n===========\n${html}\n===========\n but no results parsed.`)
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
        time_range: z.string({ description: 'The optional time range for the search, from: [day, week, month, year].' }).optional(),
        language: z.string({ description: 'The optional language code for the search (e.g., en, es, fr).' }).optional(),
        detailed: z.string({ description: 'Optionally, if true, will perform a more thorough search - will ask for more pages of results and will merge results from multiple servers. Warning: this might overload the servers and cause errors. Do not set to true by default unless explicitly asked to perform a detailed or comprehensive query.'}).optional()
    }),
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: false
    },
    execute: async (params, { log }) => {
        const { query, time_range, language, detailed } = params;
        if (baseUrl === undefined || baseUrl.length === 0) {
            throw new UserError('SEARXNG_BASE_URL environment variable is not set.');
        }
        
        // If detailed search is requested
        if (detailed === 'true') {
            const shuffledUrls = shuffleAndFilterUrls(baseUrl);
            
            // Use up to 3 servers for detailed search
            const serversToUse = shuffledUrls;
            const allResults: { url: string; summary: string }[] = [];
            const processedUrls = new Set<string>();
            let successfulServers = 0;
            
            // Fetch results from each server
            for (const serverUrl of serversToUse) {
                if (successfulServers >= 3) {
                    break;
                }
                try {
                    // Fetch multiple pages of results
                    const serverResults = await fetchMultiplePages(log, query, serverUrl, 3, time_range, language);
                    addUniqueResults(allResults, serverResults, processedUrls);
                    if (serverResults.length > 0) {
                        successfulServers++;
                    }
                } catch (error) {
                    log.error('Error fetching results from server', { serverUrl, error: error instanceof Error ? error.message : String(error) });
                }
            }
            
            return {
                content: [{ type: 'text', text: JSON.stringify(allResults) }],
            };
        } else {
            // Standard search (existing behavior)
            const shuffledUrls = shuffleAndFilterUrls(baseUrl);
            const response = await fetchWithRetry(log, query, shuffledUrls, 5, time_range, language);
            if (response) {
                return response;
            } else {
                throw new UserError('No valid response received after multiple attempts.');
            }
        }
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
