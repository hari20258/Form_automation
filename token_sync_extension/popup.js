document.getElementById('syncBtn').addEventListener('click', async () => {
    const status = document.getElementById('status');
    status.textContent = 'Syncing...';

    try {
        // 1. Get Cookies for relevant domains (using domain match to get ALL paths)
        const domains = ['amig.com', 'munichre.com'];
        let allCookies = [];

        for (const domain of domains) {
            // "domain" in getAll defaults to domain and subdomains
            const cookies = await chrome.cookies.getAll({ domain });
            allCookies = allCookies.concat(cookies);
        }

        // Deduplicate based on name+domain+path
        const uniqueCookies = [];
        const seen = new Set();
        for (const c of allCookies) {
            const key = `${c.name}@${c.domain}${c.path}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueCookies.push(c);
            }
        }

        // 2. Get LocalStorage/SessionStorage
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        const storageData = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                return {
                    localStorage: { ...localStorage },
                    sessionStorage: { ...sessionStorage }
                };
            }
        });

        const storage = storageData[0].result;

        // 3. Send to Local Server
        const payload = {
            cookies: uniqueCookies,
            storage: storage
        };

        const response = await fetch('http://localhost:3000/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            status.textContent = '✅ Synced successfully!';
        } else {
            status.textContent = '❌ Server error: ' + response.status;
        }

    } catch (e) {
        console.error(e);
        status.textContent = '❌ Error: ' + e.message;
    }
});
