#!/usr/bin/env node

// Script to test SearXNG servers from searx.space using fetchResults from src/index.ts
const fs = require('fs');
const path = require('path');

// Simple log object to match the Log type from src/index.ts
const log = {
    debug: (message, data) => console.log(`[DEBUG] ${message}`, data || ''),
    error: (message, data) => console.error(`[ERROR] ${message}`, data || ''),
    info: (message, data) => console.log(`[INFO] ${message}`, data || ''),
    warn: (message, data) => console.warn(`[WARN] ${message}`, data || '')
};

// Function to fetch and parse searx.space
async function scrapeSearxSpace() {
    console.log('Fetching SearXNG servers from searx.space...');
    
    try {
        // Fetch the instances.json data
        const response = await fetch('https://searx.space/data/instances.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Extract HTTPS URLs from the instances
        const urls = Object.keys(data.instances).filter(url => url.startsWith('https://'));
        console.log(`Found ${urls.length} HTTPS SearXNG servers`);
        
        return urls; // Return all URLs, no limit
    } catch (error) {
        console.error('Error fetching searx.space data:', error);
        // Return some default servers if scraping fails
        return [
            'https://baresearch.org',
            'https://copp.gg',
            'https://darmarit.org/searx',
            'https://etsi.me',
            'https://fairsuch.net',
            'https://find.xenorio.xyz',
            'https://kantan.cat',
            'https://opnxng.com',
            'https://paulgo.io',
            'https://searx.tiekoetter.com',
            'https://searxng.world'
        ];
    }
}

// Function to test a single server with both page 1 and page 2 using fetchResults
async function testServer(url) {
    console.log(`Testing ${url}...`);
    
    try {
        // Test page 1
        const page1Result = await testSearchQuery(url, 1);
        console.log(`  Page 1: ${page1Result.success ? '✓' : '✗'} (${page1Result.resultCount} results)`);
        
        // Test page 2
        const page2Result = await testSearchQuery(url, 2);
        console.log(`  Page 2: ${page2Result.success ? '✓' : '✗'} (${page2Result.resultCount} results)`);
        
        // Categorize server based on results
        if (page1Result.success && page2Result.success) {
            return {
                status: 'good',
                url: url,
                details: {
                    page1: page1Result,
                    page2: page2Result
                }
            };
        } else if (page1Result.success && !page2Result.success) {
            return {
                status: 'ok',
                url: url,
                details: {
                    page1: page1Result,
                    page2: page2Result
                }
            };
        } else {
            return {
                status: 'bad',
                url: url,
                details: {
                    page1: page1Result,
                    page2: page2Result
                }
            };
        }
    } catch (error) {
        console.error(`  Error testing ${url}:`, error.message);
        return {
            status: 'bad',
            url: url,
            details: {
                error: error.message
            }
        };
    }
}

// Function to test a search query on a specific server and page using fetchResults
async function testSearchQuery(baseUrl, page = 1) {
    try {
        // Dynamically import fetchResults from src/index.ts
        const { fetchResults } = await import('../build/index.js');
        
        // Run a test search query
        const result = await fetchResults(
            log,
            'test',
            '',
            'en',
            baseUrl,
            page
        );
        
        // Parse the results
        if (result.content && result.content[0] && result.content[0].text) {
            const results = JSON.parse(result.content[0].text);
            return {
                success: results.length > 0,
                resultCount: results.length,
                results: results
            };
        } else {
            return {
                success: false,
                resultCount: 0,
                error: 'No content returned'
            };
        }
    } catch (error) {
        return {
            success: false,
            resultCount: 0,
            error: error.message || 'Unknown error'
        };
    }
}

// Function to generate and write the report
function generateReport(goodServers, okServers, badServers) {
    const timestamp = new Date().toISOString();
    const report = `
SearXNG Server Test Report
==========================

Generated on: ${timestamp}

Summary:
- Good servers (both page 1 and 2 work): ${goodServers.length}
- OK servers (page 1 works, page 2 fails): ${okServers.length}
- Bad servers (both pages fail): ${badServers.length}

Good Servers (Recommended for reliable searching)
------------------------------------------------
${goodServers.map(server => `✓ ${server.url}`).join('\n') || 'None'}

OK Servers (May work but pagination issues)
------------------------------------------
${okServers.map(server => `~ ${server.url}`).join('\n') || 'None'}

Bad Servers (Not recommended)
----------------------------
${badServers.map(server => `✗ ${server.url}`).join('\n') || 'None'}

Detailed Results
================

Good Servers:
${goodServers.map(server => `
${server.url}:
  Page 1: ${server.details.page1.success ? `✓ ${server.details.page1.resultCount} results` : '✗ Failed'}${server.details.page1.error ? ` (${server.details.page1.error})` : ''}
  Page 2: ${server.details.page2.success ? `✓ ${server.details.page2.resultCount} results` : '✗ Failed'}${server.details.page2.error ? ` (${server.details.page2.error})` : ''}`).join('\n') || 'None'}

OK Servers:
${okServers.map(server => `
${server.url}:
  Page 1: ${server.details.page1.success ? `✓ ${server.details.page1.resultCount} results` : '✗ Failed'}${server.details.page1.error ? ` (${server.details.page1.error})` : ''}
  Page 2: ${server.details.page2.success ? `✓ ${server.details.page2.resultCount} results` : `✗ ${server.details.page2.error || 'Failed'}`}`).join('\n') || 'None'}

Bad Servers:
${badServers.map(server => `
${server.url}:
  ${server.details.error ? `Error: ${server.details.error}` : `
  Page 1: ${server.details.page1.success ? `✓ ${server.details.page1.resultCount} results` : `✗ ${server.details.page1.error || 'Failed'}`}
  Page 2: ${server.details.page2.success ? `✓ ${server.details.page2.resultCount} results` : `✗ ${server.details.page2.error || 'Failed'}`}`}`).join('\n') || 'None'}
`;

    // Write report to file
    const reportPath = path.join(__dirname, 'searxng-server-report.txt');
    fs.writeFileSync(reportPath, report);
    console.log(`\nReport written to: ${reportPath}`);
    
    // Also output summary to console
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Good servers: ${goodServers.length}`);
    console.log(`OK servers: ${okServers.length}`);
    console.log(`Bad servers: ${badServers.length}`);
    console.log('\nRecommended servers (Good):');
    goodServers.forEach(server => console.log(`  ✓ ${server.url}`));
}

// Main function to run the tests
async function main() {
    console.log('SearXNG Server Testing Script');
    console.log('============================\n');
    
    try {
        // Get list of servers
        const urls = await scrapeSearxSpace();
        
        if (urls.length === 0) {
            console.log('No servers found to test.');
            return;
        }
        
        console.log(`\nTesting ${urls.length} SearXNG servers...\n`);
        
        // Test all servers
        const results = [];
        for (const [index, url] of urls.entries()) {
            console.log(`Progress: ${index + 1}/${urls.length}`);
            const result = await testServer(url);
            results.push(result);
            console.log(''); // Empty line for readability
        }
        
        // Categorize results
        const goodServers = results.filter(result => result.status === 'good');
        const okServers = results.filter(result => result.status === 'ok');
        const badServers = results.filter(result => result.status === 'bad');
        
        // Generate report
        generateReport(goodServers, okServers, badServers);
        
        console.log('\nTesting complete!');
        
    } catch (error) {
        console.error('Error during testing:', error);
        process.exit(1);
    }
}

// Run the script if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { scrapeSearxSpace, testServer, testSearchQuery, generateReport };