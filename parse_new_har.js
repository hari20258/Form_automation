const fs = require('fs');

const harFile = 'data/amsuite.amig.new.har';
if (!fs.existsSync(harFile)) {
    console.error(`File not found: ${harFile}`);
    process.exit(1);
}

const har = JSON.parse(fs.readFileSync(harFile, 'utf8'));

const rpcCalls = har.log.entries
    .filter(entry => entry.request.method === 'POST' && entry.request.url.includes('/pc/service/edge/'))
    .map(entry => {
        try {
            const body = JSON.parse(entry.request.postData.text);
            return {
                url: entry.request.url,
                method: body.method,
                params: body.params,
                fullBody: body
            };
        } catch (e) {
            return null;
        }
    })
    .filter(call => call !== null);

console.log(`Found ${rpcCalls.length} JSON-RPC calls.`);

rpcCalls.forEach((call, index) => {
    console.log(`\n--- Call #${index + 1} ---`);
    console.log(`URL: ${call.url}`);
    console.log(`Method: ${call.method}`);
    console.log(`Params: ${JSON.stringify(call.params, null, 2)}`);
});
