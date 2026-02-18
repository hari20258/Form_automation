/**
 * Extracts payloads from the new Qualifications HAR file.
 * Focuses on finding the Additional Insured data and the Qualifications step payload.
 */
const fs = require('fs');
const path = require('path');

const harFile = 'data/amsuite.amiquote-qualificationsfull.har';
const outputDir = 'data/steps';

if (!fs.existsSync(harFile)) {
    console.log(`❌ File not found: ${harFile}`);
    process.exit(1);
}

const har = JSON.parse(fs.readFileSync(harFile, 'utf8'));
const entries = har.log?.entries || [];

// Filter meaningful POST requests
const meaningful = entries.filter(e => {
    if (e.request?.method !== 'POST' || !e.request?.postData?.text) return false;
    const url = e.request.url;
    if (url.includes('/tell') || url.includes('rb_bf') || url.includes('dynatrace')) return false;
    return true;
});

console.log(`\n📦 HAR: ${harFile}`);
console.log(`   Found ${meaningful.length} meaningful API requests`);

meaningful.forEach((entry, idx) => {
    let payload;
    try { payload = JSON.parse(entry.request.postData.text); } catch { payload = entry.request.postData.text; }

    const rpcMethod = payload?.method || 'unknown';
    const endpoint = entry.request.url.split('/').pop();

    // Save to file
    const filename = `har3_qual_${String(idx + 1).padStart(2, '0')}_${rpcMethod}.json`;
    const outputPath = path.join(outputDir, filename);

    fs.writeFileSync(outputPath, JSON.stringify({
        endpoint: entry.request.url,
        rpcMethod,
        payload,
        response: JSON.parse(entry.response?.content?.text || '{}')
    }, null, 2));

    console.log(`   #${idx + 1} ${rpcMethod.padEnd(35)} → ${endpoint}`);

    // Check for Additional Insureds in updateDraftSubmission
    if (rpcMethod === 'updateDraftSubmission') {
        const additionalInsureds = payload.params?.[0]?.baseData?.additionalInsureds;
        if (additionalInsureds && additionalInsureds.length > 0) {
            console.log(`      ✅ FOUND ADDITIONAL INSURED in request #${idx + 1}`);
            console.log(JSON.stringify(additionalInsureds, null, 2));
        }

        // Also check persons array for non-account holders
        const persons = payload.params?.[0]?.persons;
        if (persons) {
            const others = persons.filter(p => !p.accountHolder);
            if (others.length > 0) {
                console.log(`      ✅ FOUND OTHER PERSONS in request #${idx + 1}`);
                console.log(JSON.stringify(others, null, 2));
            }
        }
    }
});
