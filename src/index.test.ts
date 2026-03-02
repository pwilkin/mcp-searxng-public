import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
    addUniqueResults, 
    shuffleAndFilterUrls, 
    fetchResults, 
    fetchMultiplePages, 
    fetchWithRetry,
    Log 
} from './index.js';
import { UserError } from 'fastmcp';

// Mock logger
const createMockLog = (): Log => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
});

// Sample HTML response for SearXNG search results
const sampleSearchHtml = `
<!DOCTYPE html>
<html>
<body>
    <article class="result">
        <a href="https://example.com/result1" class="url_header">Result 1</a>
        <p class="content">This is the first result summary.</p>
    </article>
    <article class="result">
        <a href="https://example.com/result2" class="url_header">Result 2</a>
        <p class="content">This is the second result summary.</p>
    </article>
    <article class="result">
        <a href="https://example.com/result3" class="url_header">Result 3</a>
        <p class="content">This is the third result <strong>with bold</strong> text.</p>
    </article>
</body>
</html>
`;

// HTML with index endpoint (redirect scenario)
const indexEndpointHtml = `
<!DOCTYPE html>
<html>
<body class="index_endpoint">
    <p>Main page</p>
</body>
</html>
`;

// HTML with CSS link
const htmlWithCssLink = `
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="/static/themes/simple/css/client.min.css">
</head>
<body>
</body>
</html>
`;

// Empty results HTML
const emptyResultsHtml = `
<!DOCTYPE html>
<html>
<body>
    <p>No results found</p>
</body>
</html>
`;

describe('addUniqueResults', () => {
    it('should add new unique results to the array', () => {
        const allResults: { url: string; summary: string }[] = [];
        const processedUrls = new Set<string>();
        
        const newResults = [
            { url: 'https://example.com/1', summary: 'Summary 1' },
            { url: 'https://example.com/2', summary: 'Summary 2' },
        ];
        
        addUniqueResults(allResults, newResults, processedUrls);
        
        expect(allResults).toHaveLength(2);
        expect(allResults[0]).toEqual({ url: 'https://example.com/1', summary: 'Summary 1' });
        expect(allResults[1]).toEqual({ url: 'https://example.com/2', summary: 'Summary 2' });
        expect(processedUrls.size).toBe(2);
    });

    it('should not add duplicate URLs', () => {
        const allResults: { url: string; summary: string }[] = [
            { url: 'https://example.com/1', summary: 'Summary 1' },
        ];
        const processedUrls = new Set(['https://example.com/1']);
        
        const newResults = [
            { url: 'https://example.com/1', summary: 'Different summary' },
            { url: 'https://example.com/2', summary: 'Summary 2' },
        ];
        
        addUniqueResults(allResults, newResults, processedUrls);
        
        expect(allResults).toHaveLength(2);
        expect(allResults[0].summary).toBe('Summary 1'); // Original summary preserved
        expect(allResults[1]).toEqual({ url: 'https://example.com/2', summary: 'Summary 2' });
    });

    it('should handle empty new results array', () => {
        const allResults: { url: string; summary: string }[] = [
            { url: 'https://example.com/1', summary: 'Summary 1' },
        ];
        const processedUrls = new Set(['https://example.com/1']);
        
        addUniqueResults(allResults, [], processedUrls);
        
        expect(allResults).toHaveLength(1);
    });

    it('should handle multiple calls with overlapping results', () => {
        const allResults: { url: string; summary: string }[] = [];
        const processedUrls = new Set<string>();
        
        addUniqueResults(allResults, [
            { url: 'https://example.com/1', summary: 'Summary 1' },
            { url: 'https://example.com/2', summary: 'Summary 2' },
        ], processedUrls);
        
        addUniqueResults(allResults, [
            { url: 'https://example.com/2', summary: 'Different' },
            { url: 'https://example.com/3', summary: 'Summary 3' },
        ], processedUrls);
        
        expect(allResults).toHaveLength(3);
        expect(processedUrls.size).toBe(3);
    });
});

describe('shuffleAndFilterUrls', () => {
    it('should filter out undefined values', () => {
        const urls = ['https://example.com/1', undefined, 'https://example.com/2', undefined];
        
        const result = shuffleAndFilterUrls(urls);
        
        expect(result).toHaveLength(2);
        expect(result).toContain('https://example.com/1');
        expect(result).toContain('https://example.com/2');
    });

    it('should filter out null-like values', () => {
        const urls = ['https://example.com/1', null as unknown as undefined, 'https://example.com/2'];
        
        const result = shuffleAndFilterUrls(urls);
        
        expect(result).toHaveLength(2);
    });

    it('should return empty array for all undefined values', () => {
        const urls = [undefined, undefined, undefined];
        
        const result = shuffleAndFilterUrls(urls);
        
        expect(result).toHaveLength(0);
    });

    it('should return empty array for empty input', () => {
        const result = shuffleAndFilterUrls([]);
        expect(result).toHaveLength(0);
    });

    it('should preserve all URLs (shuffled order)', () => {
        const urls = ['https://a.com', 'https://b.com', 'https://c.com', 'https://d.com'];
        
        // Run multiple times to check shuffling happens at least sometimes
        const results = new Set<string>();
        for (let i = 0; i < 10; i++) {
            const result = shuffleAndFilterUrls([...urls]);
            expect(result).toHaveLength(4);
            expect(result.sort()).toEqual(urls.sort());
        }
    });
});

describe('fetchResults', () => {
    let mockLog: Log;
    let originalFetch: typeof global.fetch;
    
    beforeEach(() => {
        mockLog = createMockLog();
        originalFetch = global.fetch;
    });
    
    afterEach(() => {
        global.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it('should throw UserError when baseUrl is empty', async () => {
        await expect(fetchResults(mockLog, 'test query', '')).rejects.toThrow(UserError);
        await expect(fetchResults(mockLog, 'test query', '')).rejects.toThrow('Base URL not provided');
    });

    it('should parse HTML and return results', async () => {
        const mockFetch = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(htmlWithCssLink),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(''),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(sampleSearchHtml),
            });
        
        global.fetch = mockFetch;
        
        const result = await fetchResults(mockLog, 'test query', 'https://searx.example.com');
        
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');
        
        const textContent = result.content[0] as { type: 'text'; text: string };
        const parsedResults = JSON.parse(textContent.text);
        expect(parsedResults).toHaveLength(3);
        expect(parsedResults[0].url).toBe('https://example.com/result1');
        expect(parsedResults[0].summary).toBe('This is the first result summary.');
    });

    it('should handle HTML with no results', async () => {
        const mockFetch = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('<html><body></body></html>'),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(emptyResultsHtml),
            });
        
        global.fetch = mockFetch;
        
        const result = await fetchResults(mockLog, 'test query', 'https://searx.example.com');
        
        const textContent = result.content[0] as { type: 'text'; text: string };
        const parsedResults = JSON.parse(textContent.text);
        expect(parsedResults).toHaveLength(0);
    });

    it('should strip HTML tags from summary', async () => {
        const mockFetch = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('<html><body></body></html>'),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(`
                    <html>
                    <body>
                        <article class="result">
                            <a href="https://example.com" class="url_header">Link</a>
                            <p class="content">Summary with <b>bold</b> and <i>italic</i> text.</p>
                        </article>
                    </body>
                    </html>
                `),
            });
        
        global.fetch = mockFetch;
        
        const result = await fetchResults(mockLog, 'test query', 'https://searx.example.com');
        
        const textContent = result.content[0] as { type: 'text'; text: string };
        const parsedResults = JSON.parse(textContent.text);
        expect(parsedResults[0].summary).toBe('Summary with bold and italic text.');
    });

    it('should throw UserError when HTTP request fails', async () => {
        const mockFetch = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('<html><body></body></html>'),
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
            });
        
        global.fetch = mockFetch;
        
        await expect(fetchResults(mockLog, 'test query', 'https://searx.example.com')).rejects.toThrow(UserError);
    });

    it('should throw UserError when redirected to index page on second attempt', async () => {
        const mockFetch = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('<html><body></body></html>'),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(indexEndpointHtml),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('<html><body></body></html>'),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(indexEndpointHtml),
            });
        
        global.fetch = mockFetch;
        
        await expect(fetchResults(mockLog, 'test query', 'https://searx.example.com')).rejects.toThrow('Redirected to index page');
    });

    it('should include time_range parameter in URL', async () => {
        const mockFetch = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('<html><body></body></html>'),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(sampleSearchHtml),
            });
        
        global.fetch = mockFetch;
        
        await fetchResults(mockLog, 'test query', 'https://searx.example.com', 'day');
        
        const searchCall = mockFetch.mock.calls.find(call => 
            call[0].toString().includes('/search?')
        );
        expect(searchCall?.[0]).toContain('time_range=day');
    });

    it('should include language parameter in URL', async () => {
        const mockFetch = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('<html><body></body></html>'),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(sampleSearchHtml),
            });
        
        global.fetch = mockFetch;
        
        await fetchResults(mockLog, 'test query', 'https://searx.example.com', undefined, 'en');
        
        const searchCall = mockFetch.mock.calls.find(call => 
            call[0].toString().includes('/search?')
        );
        expect(searchCall?.[0]).toContain('language=en');
    });

    it('should include page number parameter when page > 1', async () => {
        const mockFetch = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('<html><body></body></html>'),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(sampleSearchHtml),
            });
        
        global.fetch = mockFetch;
        
        await fetchResults(mockLog, 'test query', 'https://searx.example.com', undefined, undefined, 2);
        
        const searchCall = mockFetch.mock.calls.find(call => 
            call[0].toString().includes('/search?')
        );
        expect(searchCall?.[0]).toContain('pageno=2');
    });

    it('should not include page number when page is 1', async () => {
        const mockFetch = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('<html><body></body></html>'),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(sampleSearchHtml),
            });
        
        global.fetch = mockFetch;
        
        await fetchResults(mockLog, 'test query', 'https://searx.example.com', undefined, undefined, 1);
        
        const searchCall = mockFetch.mock.calls.find(call => 
            call[0].toString().includes('/search?')
        );
        expect(searchCall?.[0]).not.toContain('pageno');
    });

    it('should URL encode the query parameter', async () => {
        const mockFetch = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('<html><body></body></html>'),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(sampleSearchHtml),
            });
        
        global.fetch = mockFetch;
        
        await fetchResults(mockLog, 'test query with spaces & special=chars', 'https://searx.example.com');
        
        const searchCall = mockFetch.mock.calls.find(call => 
            call[0].toString().includes('/search?')
        );
        expect(searchCall?.[0]).toContain('q=test%20query%20with%20spaces%20%26%20special%3Dchars');
    });
});

describe('fetchMultiplePages', () => {
    let mockLog: Log;
    let originalFetch: typeof global.fetch;
    
    beforeEach(() => {
        mockLog = createMockLog();
        originalFetch = global.fetch;
    });
    
    afterEach(() => {
        global.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it('should fetch multiple pages and combine results', async () => {
        const mockFetch = vi.fn()
            // Page 1 - first request (base URL + CSS fetch + search)
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('<html><body></body></html>'),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(`
                    <html><body>
                        <article class="result">
                            <a href="https://example.com/1" class="url_header">Link 1</a>
                            <p class="content">Summary 1</p>
                        </article>
                    </body></html>
                `),
            })
            // Page 2
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('<html><body></body></html>'),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(`
                    <html><body>
                        <article class="result">
                            <a href="https://example.com/2" class="url_header">Link 2</a>
                            <p class="content">Summary 2</p>
                        </article>
                    </body></html>
                `),
            })
            // Page 3
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('<html><body></body></html>'),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(`
                    <html><body>
                        <article class="result">
                            <a href="https://example.com/3" class="url_header">Link 3</a>
                            <p class="content">Summary 3</p>
                        </article>
                    </body></html>
                `),
            });
        
        global.fetch = mockFetch;
        
        const result = await fetchMultiplePages(mockLog, 'test', 'https://searx.example.com', 3);
        
        expect(result).toHaveLength(3);
        expect(result[0].url).toBe('https://example.com/1');
        expect(result[1].url).toBe('https://example.com/2');
        expect(result[2].url).toBe('https://example.com/3');
    });

    it('should deduplicate results across pages', async () => {
        const mockFetch = vi.fn()
            // Page 1
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('<html><body></body></html>'),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(`
                    <html><body>
                        <article class="result">
                            <a href="https://example.com/1" class="url_header">Link 1</a>
                            <p class="content">Summary 1</p>
                        </article>
                    </body></html>
                `),
            })
            // Page 2 - same URL as page 1
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('<html><body></body></html>'),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(`
                    <html><body>
                        <article class="result">
                            <a href="https://example.com/1" class="url_header">Link 1</a>
                            <p class="content">Different summary</p>
                        </article>
                        <article class="result">
                            <a href="https://example.com/2" class="url_header">Link 2</a>
                            <p class="content">Summary 2</p>
                        </article>
                    </body></html>
                `),
            });
        
        global.fetch = mockFetch;
        
        const result = await fetchMultiplePages(mockLog, 'test', 'https://searx.example.com', 2);
        
        expect(result).toHaveLength(2);
        expect(result[0].summary).toBe('Summary 1'); // First occurrence preserved
    });

    it('should handle errors gracefully for individual pages', async () => {
        const mockFetch = vi.fn()
            // Page 1 - succeeds
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('<html><body></body></html>'),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(`
                    <html><body>
                        <article class="result">
                            <a href="https://example.com/1" class="url_header">Link 1</a>
                            <p class="content">Summary 1</p>
                        </article>
                    </body></html>
                `),
            })
            // Page 2 - fails
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('<html><body></body></html>'),
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 500,
            })
            // Page 3 - succeeds
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('<html><body></body></html>'),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(`
                    <html><body>
                        <article class="result">
                            <a href="https://example.com/3" class="url_header">Link 3</a>
                            <p class="content">Summary 3</p>
                        </article>
                    </body></html>
                `),
            });
        
        global.fetch = mockFetch;
        
        const result = await fetchMultiplePages(mockLog, 'test', 'https://searx.example.com', 3);
        
        expect(result).toHaveLength(2);
        expect(mockLog.warn).toHaveBeenCalled();
    });

    it('should return empty array when all pages fail', async () => {
        const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
        
        global.fetch = mockFetch;
        
        const result = await fetchMultiplePages(mockLog, 'test', 'https://searx.example.com', 2);
        
        expect(result).toHaveLength(0);
    });
});

describe('fetchWithRetry', () => {
    let mockLog: Log;
    let originalFetch: typeof global.fetch;
    
    beforeEach(() => {
        mockLog = createMockLog();
        originalFetch = global.fetch;
    });
    
    afterEach(() => {
        global.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it('should return result on first successful fetch', async () => {
        const mockFetch = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('<html><body></body></html>'),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(`
                    <html><body>
                        <article class="result">
                            <a href="https://example.com/1" class="url_header">Link 1</a>
                            <p class="content">Summary 1</p>
                        </article>
                    </body></html>
                `),
            });
        
        global.fetch = mockFetch;
        
        const result = await fetchWithRetry(mockLog, 'test', ['https://searx.example.com'], 3);
        
        expect(result).toBeDefined();
        expect(result!.content).toBeDefined();
    });

    it('should try next URL when current URL fails', async () => {
        const mockFetch = vi.fn()
            // First URL fails
            .mockRejectedValueOnce(new Error('Network error'))
            .mockRejectedValueOnce(new Error('Network error'))
            // Second URL succeeds
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('<html><body></body></html>'),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(`
                    <html><body>
                        <article class="result">
                            <a href="https://example.com/1" class="url_header">Link 1</a>
                            <p class="content">Summary 1</p>
                        </article>
                    </body></html>
                `),
            });
        
        global.fetch = mockFetch;
        
        const result = await fetchWithRetry(
            mockLog, 
            'test', 
            ['https://searx1.example.com', 'https://searx2.example.com'], 
            5
        );
        
        expect(result).toBeDefined();
    });

    it('should return undefined when all retries fail', async () => {
        const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
        
        global.fetch = mockFetch;
        
        const result = await fetchWithRetry(mockLog, 'test', ['https://searx.example.com'], 2);
        
        expect(result).toBeUndefined();
    });

    it('should log error messages during retries', async () => {
        const mockFetch = vi.fn()
            .mockRejectedValueOnce(new Error('Network error'))
            .mockRejectedValueOnce(new Error('Network error'))
            .mockRejectedValueOnce(new Error('Network error'));
        
        global.fetch = mockFetch;
        
        await fetchWithRetry(mockLog, 'test', ['https://searx.example.com'], 2);
        
        expect(mockLog.error).toHaveBeenCalled();
    });
});
