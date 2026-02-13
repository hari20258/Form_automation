const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TOKENS_FILE = path.join(__dirname, 'manual_tokens.json');

async function executeBridge(targetUrl) {
    console.log('\n🌉 Starting Auth Bridge...');

    if (!fs.existsSync(TOKENS_FILE)) {
        throw new Error('manual_tokens.json not found.');
    }
    const data = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));

    // Launch Playwright (Visible for verification, can be headless later)
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();

    // 1. Inject Cookies from Manual Sync
    if (data.cookies) {
        const cookies = data.cookies.map(c => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path,
            secure: c.secure,
            httpOnly: c.httpOnly,
            sameSite: c.sameSite,
            expires: c.expirationDate
        })).filter(c => !c.domain.startsWith('.')); // sometimes dot domains cause issues if not accurate
        // Actually, dot domains are fine, but Playwright is strict. 
        // Let's try to add them. If it fails, we catch.

        try {
            await context.addCookies(data.cookies.map(c => ({
                name: c.name,
                value: c.value,
                domain: c.domain,
                path: c.path || '/',
                secure: c.secure,
                httpOnly: c.httpOnly
            })));
        } catch (e) {
            console.warn('Warning adding cookies:', e.message);
        }
    }

    const page = await context.newPage();

    console.log(`🚀 Navigating to Signed URL: ${targetUrl.substring(0, 60)}...`);

    try {
        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });

        // Wait for gateway portal to load
        // It usually ends up at https://amsuite.amig.com/gateway-portal/dist/html/index.html#/....
        try {
            await page.waitForURL(url => url.toString().includes('gateway-portal'), { timeout: 30000 });
        } catch (e) {
            console.log('Timeout waiting for gateway-portal URL pattern. Proceeding with current state.');
        }

        console.log(`📍 Current URL: ${page.url()}`);

        // Grab the cookies now that we are (hopefully) authenticated
        const finalCookies = await context.cookies();

        // Filter for amsuite.amig.com and .amig.com
        const sessionCookies = finalCookies.filter(c => c.domain.includes('amig.com'));

        const cookieStr = sessionCookies.map(c => `${c.name}=${c.value}`).join('; ');
        console.log(`✅ Captured ${sessionCookies.length} session cookies.`);

        await browser.close();
        return cookieStr;

    } catch (e) {
        console.error('❌ Bridge Execution Failed:', e);
        await browser.close();
        throw e;
    }
}

module.exports = { executeBridge };
