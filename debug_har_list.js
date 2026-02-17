const fs = require('fs');
const har = JSON.parse(fs.readFileSync('data/amsuite.amiquote.har', 'utf8'));

console.log(`Total entries: ${har.log.entries.length}`);
har.log.entries.slice(0, 10).forEach((e, i) => {
    console.log(`[${i}] ${e.request.method} ${e.request.url}`);
    if (e.request.postData?.text) {
        console.log(`    Payload: ${e.request.postData.text.substring(0, 100)}...`);
    }
});
