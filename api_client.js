const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const TOKENS_FILE = path.join(__dirname, 'manual_tokens.json');
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

class ApiClient {
    constructor() {
        this.cookies = '';
        this.bearerToken = '';
        this.subscriptionKey = '72c31938a0b148f69159203a559e02f6'; // From HAR
        this.gatewayUrl = 'https://amsuite.amig.com/pc/service/edge';
        this.restUrl = 'https://api-prod.munichre.com/amod/ap/prod/V1';
        this.amsuitePlusUrl = 'https://amsuiteplus-api.amig.com';
    }

    /**
     * Loads tokens from manual_tokens.json
     * Extracts Bearer token from localStorage/sessionStorage if available
     * Extracts initial cookies
     */
    loadTokens() {
        if (!fs.existsSync(TOKENS_FILE)) {
            throw new Error(`Tokens file not found at ${TOKENS_FILE}. Please run the extension sync.`);
        }

        const data = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));

        // 1. Extract Bearer Token
        // Search in localStorage/sessionStorage for known keys or patterns
        // Based on previous logs, it might be in sessionStorage 
        // keys like: msal.client.info, or specifically finding a token.
        // For now, let's look for a large string starting with eyJ... in storage or just use the first one found that looks like a token if explicit key isn't known.
        // Actually, previous logs showed us capturing it from a request header. 
        // In the manual sync, we synced storage. 
        // Let's assume the user might not have easily identified the token key.
        // We will try to find a key that looks like an access token.

        let foundToken = null;
        const potentialStorages = [data.storage?.sessionStorage, data.storage?.localStorage];

        for (const store of potentialStorages) {
            if (!store) continue;
            for (const [key, val] of Object.entries(store)) {
                if (typeof val === 'string' && val.startsWith('eyJ') && val.length > 500) {
                    // Primitive check for JWT
                    foundToken = val;
                    break;
                }
                // MSAL specific check
                if (key.includes('accessToken')) {
                    // MSAL stores complicated objects, this might need parsing
                }
            }
            if (foundToken) break;
        }

        // Fallback: Check if we saved it explicitly in a previous run or if the extensions saves it differently
        if (!foundToken && data.bearerToken) {
            foundToken = data.bearerToken;
        }

        if (foundToken) {
            this.bearerToken = foundToken;
            console.log('✅ Loaded Bearer Token');
        } else {
            console.warn('⚠️ No Bearer Token found in synced data. REST calls might fail.');
        }

        // 2. Extract Cookies
        if (data.cookies) {
            // We want cookies for relevant domains
            const relevantCookies = data.cookies.filter(c =>
                c.domain.includes('amig.com') || c.domain.includes('munichre.com')
            );
            this.cookies = relevantCookies.map(c => `${c.name}=${c.value}`).join('; ');
            console.log(`✅ Loaded ${relevantCookies.length} cookies`);
        }
    }

    setSessionCookies(cookieString) {
        this.cookies = cookieString;
        console.log('✅ Updated API Client with Session Cookies');
    }

    /**
     * Generic REST GET
     */
    async get(url, config = {}) {
        return axios.get(url, {
            ...config,
            headers: {
                'Authorization': `Bearer ${this.bearerToken}`,
                'Ocp-Apim-Subscription-Key': this.subscriptionKey,
                'User-Agent': USER_AGENT,
                'Cookie': this.cookies,
                ...config.headers
            }
        });
    }

    /**
     * JSON-RPC POST
     */
    async callRpc(endpoint, method, params) {
        const url = `${this.gatewayUrl}${endpoint}`;
        const payload = {
            jsonrpc: '2.0',
            method: method,
            params: params,
            id: `rpc-${Date.now()}`
        };

        // Log to file instead of console
        logger.debug(`📤 [RPC REQUEST] ${method} -> ${url}`);
        logger.debug('PAYLOAD:', payload);

        try {
            const response = await axios.post(url, payload, {
                headers: {
                    'Cookie': this.cookies,
                    'User-Agent': USER_AGENT,
                    'Content-Type': 'application/json',
                    'Origin': 'https://amsuite.amig.com',
                    'Referer': 'https://amsuite.amig.com/gateway-portal/dist/html/index.html'
                }
            });

            logger.debug(`📥 [RPC RESPONSE] ${method} <- Status: ${response.status}`);

            // Should be object. If string, it's an error (HTML/Gateway rejection)
            if (typeof response.data === 'string') {
                const errMsg = `⚠️ Warning: RPC [${method}] returned a STRING. Likely HTML error page.`;
                logger.error(errMsg);
                logger.debug('RESPONSE DATA (Partial):', response.data.substring(0, 500));
                throw new Error(`RPC Request returned HTML/String instead of JSON. Session invalid or endpoint wrong.`);
            }

            // Log full response data to file
            logger.debug('RESPONSE DATA:', response.data);

            if (response.data.error) {
                logger.error(`❌ RPC Error [${method}]:`, response.data.error);
                throw new Error(`RPC Error: ${response.data.error.message}`);
            }

            return response.data.result;
        } catch (error) {
            logger.error(`❌ RPC Call Failed [${method}]: ${error.message}`);
            if (error.response) {
                logger.debug('Response Data:', error.response.data);
            }
            throw error;
        }
    }
}

module.exports = new ApiClient();
