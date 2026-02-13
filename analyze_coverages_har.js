const fs = require('fs');

const harPath = './data/amsuite.amiquote.har';
const harContent = fs.readFileSync(harPath, 'utf8');
const har = JSON.parse(harContent);

const methods = {};
let coveragesPayload = null;

har.log.entries.forEach(entry => {
    if (entry.request && entry.request.postData && entry.request.postData.text) {
        try {
            const body = JSON.parse(entry.request.postData.text);
            const method = body.method;
            if (method) {
                methods[method] = (methods[method] || 0) + 1;
                if (method === 'updateCustomQuoteCoverages') {
                    const len = JSON.stringify(body).length;
                    if (!coveragesPayload || len > JSON.stringify(coveragesPayload).length) {
                        coveragesPayload = body;
                    }
                }
            }
        } catch (e) {
            // ignore non-JSON body
        }
    }
});

console.log('--- RPC Methods Found ---');
console.table(methods);

if (coveragesPayload) {
    fs.writeFileSync('./data/coverages_payload.json', JSON.stringify(coveragesPayload, null, 2));
    console.log('✅ Extracted updateCustomQuoteCoverages payload to data/coverages_payload.json');
} else {
    console.log('⚠️ updateCustomQuoteCoverages not found.');
}
