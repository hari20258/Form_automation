const fs = require('fs');
const path = require('path');

const files = [
    'data/amsuite.amiquote-additional.har',
    'data/amsuite.amiquote-policyinfo.har'
];

files.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return;
    }

    try {
        const harContent = fs.readFileSync(filePath, 'utf8');
        const har = JSON.parse(harContent);
        const entries = har.log.entries;

        console.log(`\n--- Analyzing ${file} ---`);
        console.log(`Total Entries: ${entries.length}`);

        entries.forEach((entry, index) => {
            const url = entry.request.url;
            const method = entry.request.method;

            if (method === 'POST' && entry.request.postData && entry.request.postData.text) {
                try {
                    const text = entry.request.postData.text;
                    // Check for keywords relevant to the new steps
                    if (text.includes('Additional') || text.includes('Email') || text.includes('Phone') || text.includes('License') || text.includes('consents')) {
                        console.log(`\n[${file}] Found Match in ${url} (RPC Method inside?)`);

                        const json = JSON.parse(text);
                        const methodCall = json.method || (Array.isArray(json) ? json[0].method : 'unknown');
                        console.log(`RPC Method: ${methodCall}`);
                        console.log('Payload Snippet:', JSON.stringify(json, null, 2).substring(0, 1500) + '...');
                    }
                } catch (e) {
                    // ignore
                }
            }
        });

    } catch (e) {
        console.error(`Error processing ${file}: ${e.message}`);
    }
});
