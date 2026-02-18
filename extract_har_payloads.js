/**
 * Extracts ONLY meaningful API payloads (no telemetry/tell)
 * and writes them to individual JSON files in data/steps/
 */
const fs = require('fs');
const path = require('path');

const harFiles = [
    { label: 'HAR1_Draft', file: 'data/amsuite.amiquote-policy details.har', prefix: 'har1_draft' },
    { label: 'HAR2_Full', file: 'data/amsuite.amiquote-policydetails full.har', prefix: 'har2_full' }
];

const allResults = {};

for (const { label, file, prefix } of harFiles) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) { console.log(`❌ ${file} not found`); continue; }

    const har = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const entries = har.log?.entries || [];

    // Filter meaningful API requests (skip telemetry/tracking)
    const meaningful = entries.filter(e => {
        if (e.request?.method !== 'POST' || !e.request?.postData?.text) return false;
        const url = e.request.url;
        // Skip dynatrace, telemetry, tracking
        if (url.includes('/tell') || url.includes('rb_bf') || url.includes('dynatrace') || url.includes('talkdesk')) return false;
        return true;
    });

    const results = [];
    meaningful.forEach((entry, idx) => {
        let payload;
        try { payload = JSON.parse(entry.request.postData.text); } catch { payload = entry.request.postData.text; }

        const rpcMethod = payload?.method || 'unknown';
        let responseResult = null;
        try {
            const resp = JSON.parse(entry.response?.content?.text || '{}');
            responseResult = resp.result || null;
        } catch { }

        results.push({
            order: idx + 1,
            endpoint: entry.request.url,
            rpcMethod,
            httpStatus: entry.response?.status,
            payload,
            response: responseResult
        });

        // Save individual file
        const filename = `data/steps/${prefix}_${String(idx + 1).padStart(2, '0')}_${rpcMethod}.json`;
        fs.writeFileSync(path.join(__dirname, filename), JSON.stringify({
            endpoint: entry.request.url,
            rpcMethod,
            payload,
            response: responseResult
        }, null, 2));
    });

    allResults[label] = results;
    console.log(`\n📦 ${label}: ${results.length} meaningful API requests`);
    results.forEach(r => {
        console.log(`   #${r.order} ${r.rpcMethod.padEnd(35)} → ${r.endpoint.split('/').pop()}`);
    });
}

// Summary comparison
console.log('\n\n=== FLOW COMPARISON ===');
for (const [label, results] of Object.entries(allResults)) {
    console.log(`\n${label}:`);
    results.forEach(r => {
        const paramKeys = r.payload?.params?.[0] ? Object.keys(r.payload.params[0]) : [];
        console.log(`  Step ${r.order}: ${r.rpcMethod} → [${paramKeys.join(', ')}]`);
    });
}
