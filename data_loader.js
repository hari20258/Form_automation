const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'nboa_isheet_structured.json');

class DataLoader {
    constructor() {
        this.data = null;
    }

    load() {
        if (!this.data) {
            try {
                const rawData = fs.readFileSync(DATA_FILE, 'utf8');
                this.data = JSON.parse(rawData);
                console.log(`✅ Loaded test data from ${DATA_FILE}`);
            } catch (e) {
                console.error(`❌ Failed to load test data: ${e.message}`);
                this.data = {};
            }
        }
    }

    getCustomer() {
        this.load();
        // The new file is a single object representing the application
        if (!this.data || !this.data.applicant) {
            console.warn('⚠️ No applicant data found in file.');
            return null;
        }
        return this.data;
    }
}

module.exports = new DataLoader();
