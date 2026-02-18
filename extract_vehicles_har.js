/**
 * Extracts payloads from the new Vehicles HAR file.
 * Focuses on finding the Vehicles step payload and Additional Interests.
 */
const fs = require('fs');
const path = require('path');

const harFile = 'data/amsuite.amiquote-vehiclesfull.har';
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
    let pageContext = 'unknown';

    if (rpcMethod === 'updateDraftSubmission') {
        pageContext = payload.params?.[0]?.pageContext || 'N/A';

        // Log key vehicle data if found
        const vehicles = payload.params?.[0]?.lobData?.personalAuto?.coverables?.vehicles;
        if (vehicles && vehicles.length > 0) {
            console.log(`      ✅ FOUND VEHICLES in request #${idx + 1} (${pageContext})`);
            vehicles.forEach((v, vIdx) => {
                console.log(`         Vehicle ${vIdx + 1}: ${v.year} ${v.make} ${v.model} (VIN: ${v.vin})`);

                // Check for Additional Interests on the vehicle
                if (v.additionalInterests && v.additionalInterests.length > 0) {
                    console.log(`         🔗 Found ${v.additionalInterests.length} Additional Interest(s) for this vehicle`);
                    v.additionalInterests.forEach(ai => {
                        console.log(`            - ${ai.contact?.displayName} (${ai.interestType})`);
                    });
                }
            });
        }
    }

    // Save to file
    const filename = `har5_vehicles_${String(idx + 1).padStart(2, '0')}_${rpcMethod}.json`;
    const outputPath = path.join(outputDir, filename);

    // Add pageContext to the saved file
    const fileContent = {
        endpoint: entry.request.url,
        rpcMethod,
        pageContext,
        payload,
        response: JSON.parse(entry.response?.content?.text || '{}')
    };

    fs.writeFileSync(outputPath, JSON.stringify(fileContent, null, 2));

    console.log(`   #${idx + 1} ${rpcMethod.padEnd(30)} → ${endpoint} (Ctx: ${pageContext})`);
});
