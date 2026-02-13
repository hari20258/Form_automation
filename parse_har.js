const fs = require('fs');
const path = require('path');

const HAR_FILE = path.join(__dirname, 'data', 'amsuite.amig.start quota page.har');

try {
    const harData = JSON.parse(fs.readFileSync(HAR_FILE, 'utf8'));
    const entries = harData.log.entries;

    console.log(`Analyzing ${entries.length} entries...`);

    const rpcCalls = entries.filter(entry => {
        return entry.request.url.includes('amsuite.amig.com') &&
            entry.request.method === 'POST' &&
            entry.request.postData &&
            entry.request.postData.text &&
            entry.request.postData.text.includes('jsonrpc');
    });

    console.log(`Found ${rpcCalls.length} JSON-RPC calls.`);

    rpcCalls.forEach((entry, index) => {
        try {
            const payload = JSON.parse(entry.request.postData.text);
            console.log(`\n--- Call #${index + 1} ---`);
            console.log(`URL: ${entry.request.url}`);
            console.log(`Method: ${payload.method}`);
            console.log(`Params: ${JSON.stringify(payload.params, null, 2)}`);
        } catch (e) {
            console.log(`\n--- Call #${index + 1} (Parse Error) ---`);
            console.log(entry.request.postData.text.substring(0, 200));
        }
    });

} catch (e) {
    console.error('Error parsing HAR:', e);
}
