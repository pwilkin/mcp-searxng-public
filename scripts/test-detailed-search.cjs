#!/usr/bin/env node

// Test script for verifying the detailed search functionality
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Set up environment variables
process.env.SEARXNG_BASE_URL = process.env.SEARXNG_BASE_URL || 'https://search.ononoki.org;https://searx.tiekoetter.com;https://opnxng.com';

async function runTest(query, detailed = false) {
    return new Promise((resolve, reject) => {
        console.log(`\n=== Testing ${detailed ? 'detailed' : 'standard'} search for: "${query}" ===`);
        
        // Start the MCP server
        const serverPath = path.join(__dirname, '../src/index.ts');
        const child = spawn('npx', ['tsx', serverPath], {
            env: process.env,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let stdoutData = '';
        let stderrData = '';
        
        // Send request after a short delay to allow server to start
        setTimeout(() => {
            const testRequest = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {
                    "name": "search",
                    "arguments": {
                        "query": query,
                        "detailed": detailed ? "true" : "false",
                        "language": "en"
                    }
                }
            };
            
            child.stdin.write(JSON.stringify(testRequest) + '\n');
            // Close stdin to signal end of requests
            child.stdin.end();
        }, 1000);
        
        child.stdout.on('data', (data) => {
            stdoutData += data.toString();
        });
        
        child.stderr.on('data', (data) => {
            stderrData += data.toString();
        });
        
        child.on('close', (code) => {
            if (code !== 0) {
                console.error(`Process exited with code ${code}`);
                console.error('stderr:', stderrData);
                reject(new Error(`Process exited with code ${code}`));
                return;
            }
            
            try {
                // Parse the response
                const lines = stdoutData.split('\n');
                let response = null;
                
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const parsed = JSON.parse(line);
                            if (parsed.id === 1) {
                                response = parsed;
                                break;
                            }
                        } catch (e) {
                            // Not a JSON line, continue
                        }
                    }
                }
                
                if (response) {
                    console.log(`Response:`, JSON.stringify(response, null, 2));
                    if (response.result && response.result.content && response.result.content[0]) {
                        const results = JSON.parse(response.result.content[0].text);
                        console.log(`Found ${results.length} results`);
                        console.log('First 3 results:');
                        results.slice(0, 3).forEach((result, index) => {
                            console.log(`${index + 1}. ${result.url}`);
                        });
                    }
                    console.log(`STDOUT data: ${stdoutData}`);
                    console.log(`STDERR data: ${stderrData}`);
                    resolve(response);
                } else {
                    console.error('No valid response found in output');
                    console.error('stdout:', stdoutData);
                    reject(new Error('No valid response found'));
                }
            } catch (error) {
                console.error('Error parsing response:', error);
                console.error('stdout:', stdoutData);
                reject(error);
            }
        });
        
        // Kill the process after 30 seconds if it hasn't finished
        setTimeout(() => {
            if (child.pid) {
                child.kill();
            }
        }, 30000);
    });
}

async function main() {
    try {
        console.log('Starting tests for SearXNG MCP server...');
        
        // Test 1: Standard search
        await runTest('OpenAI news', false);
        
        // Test 2: Detailed search
        await runTest('OpenAI news', true);
        
        console.log('\n=== All tests completed ===');
    } catch (error) {
        console.error('Test failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { runTest };
