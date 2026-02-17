const fs = require('fs');
const har = JSON.parse(fs.readFileSync('data/amsuite.amiquote.har', 'utf8'));

// Find the updateCustomQuoteCoverages request
const updateIndex = har.log.entries.findIndex(e => {
    return (e.request.postData?.text || '').includes('updateCustomQuoteCoverages');
});

if (updateIndex === -1) {
    console.log('Could not find updateCustomQuoteCoverages in HAR.');
    process.exit(1);
}

console.log(`Found updateCustomQuoteCoverages at index ${updateIndex}`);

// Look backwards for the last 'quote' or 'retrieve' response
for (let i = updateIndex - 1; i >= 0; i--) {
    const entry = har.log.entries[i];
    const text = entry.request.postData?.text || '';

    // We are looking for a response that might contain the quote data
    if (entry.response.content.text) {
        if (entry.response.content.text.includes('personalAuto')) {
            console.log(`--- Potential Quote State in Entry ${i} ---`);
            console.log(`Request: ${entry.request.url}`);

            try {
                const body = JSON.parse(entry.response.content.text);
                const result = body.result;
                if (!result) continue;

                // Navigate to personalAuto
                const lob = result.lobData?.personalAuto || result.lobs?.personalAuto;
                if (lob) {
                    console.log(`Found personalAuto in Entry ${i}`);
                    console.log(`Keys: ${Object.keys(lob).join(', ')}`);

                    if (lob.coverables && lob.coverables.vehicles) {
                        const v = lob.coverables.vehicles[0];
                        console.log(`Vehicle Keys: ${Object.keys(v).join(', ')}`);
                        if (v.coverages) {
                            console.log(`✅ Found 'coverages' in vehicle! It is an array of ${v.coverages.length} items.`);
                            // Print one coverage to see structure
                            console.log(JSON.stringify(v.coverages[0], null, 2));
                        } else {
                            console.log(`❌ Vehicle found, but NO 'coverages' property.`);
                        }
                    }

                    // Check top-level lobs just in case
                    if (result.lobs && result.lobs.personalAuto) {
                        console.log('Also found result.lobs.personalAuto');
                        const v = result.lobs.personalAuto.vehicleCoverages;
                        if (v) {
                            console.log(`Found 'vehicleCoverages' in result.lobs.personalAuto with ${v.length} items.`);
                        }
                    }

                    break; // Stop after finding the most relevant recent state
                }
            } catch (e) {
                // Not JSON or parse error coverage
            }
        }
    }
}
