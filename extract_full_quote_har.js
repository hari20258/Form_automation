const fs = require('fs');
const path = require('path');

// 1. Load the HAR file
const harFile = 'data/amsuite.amiquote-fullquote.har';
const rawData = fs.readFileSync(harFile, 'utf8');
const harData = JSON.parse(rawData);

// 2. Filter for relevant POST requests
const entries = harData.log.entries;
const meaningful = entries.filter(entry => {
    const url = entry.request.url;
    // We want POST requests to edge services
    return url.includes('/edge/') &&
        entry.request.method === 'POST';
});

console.log(`\n📦 HAR: ${harFile}`);
console.log(`   Found ${meaningful.length} meaningful API requests`);

// 3. Extract and Save Payloads
meaningful.forEach((entry, idx) => {
    const text = entry.request.postData?.text;
    if (!text) return;

    try {
        const payload = JSON.parse(text);
        let rpcMethod = payload.method || 'unknown';

        // Handle batch/array payloads if any
        if (Array.isArray(payload)) {
            rpcMethod = payload[0]?.method || 'batch';
        }

        const urlParts = entry.request.url.split('/');
        const endpointName = urlParts[urlParts.length - 1]; // e.g. "quote" or "submission"

        let pageContext = 'unknown';

        // Check params for pageContext
        if (payload.params && payload.params[0] && payload.params[0].pageContext) {
            pageContext = payload.params[0].pageContext;
        }

        console.log(`   #${idx + 1} ${rpcMethod.padEnd(25)} → ${endpointName} (Ctx: ${pageContext})`);

        // METHODS TO CAPTURE
        if (['updateDraftSubmission', 'updateCustomQuoteCoverages', 'addManualPriorLosses', 'saveAndQuote', 'addVehicleToSubmission', 'updateCustomQuote', 'updateCustomAMIGQuote'].includes(rpcMethod)) {

            // Log interesting features
            const params = payload.params?.[0] || {};
            const lobData = params.lobData?.personalAuto || {};

            // Check for Quotes/Premiums
            const totalPremium = params.quote?.premium?.totalPremium;
            if (totalPremium) {
                console.log(`      💰 Total Premium: ${totalPremium}`);
            }

            // Check for Finalized Coverages
            const policyCoverages = lobData.offerings?.[0]?.coverages?.lineCoverages;
            if (policyCoverages && policyCoverages.length > 0) {
                console.log(`      ✅ FOUND FINALIZED POLICY COVERAGES (${policyCoverages.length} terms)`);
            }

            // Check for Vehicle Coverages
            const vehicleCoverages = lobData.offerings?.[0]?.coverages?.vehicleCoverages;
            if (vehicleCoverages && vehicleCoverages.length > 0) {
                console.log(`      ✅ FOUND FINALIZED VEHICLE COVERAGES (${vehicleCoverages.length} vehicles)`);
            }

            // Save this specific payload for deep inspection
            const filename = `data/steps/har7_fullquote_${idx + 1}_${rpcMethod}.json`;
            const fileContent = JSON.stringify({
                endpoint: entry.request.url,
                rpcMethod,
                pageContext,
                payload,
                response: entry.response.content.text ? JSON.parse(entry.response.content.text) : null
            }, null, 2);

            fs.writeFileSync(filename, fileContent);
        }

    } catch (e) {
        console.log(`   Error parsing #${idx + 1}: ${e.message}`);
    }
});
