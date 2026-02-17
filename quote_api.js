const apiClient = require('./api_client');

const QUOTE_CONFIG = {
    state: 'FL',
    effectiveDate: new Date().toISOString().split('T')[0], // Today
    product: 'Boat',
};

// Map based upon HAR and CSV
const API_ENDPOINTS = {
    profile: '/agents/{prismId}/profile',
    products: '/selectable-products',
    redirect: '/modernlink-redirect',
};

const JSON_RPC = {
    getCurrentUser: 'getCurrentUser',
    getAvailableProducerCodes: 'getAvailableProducerCodesForCurrentUser',
    getPotentialExistingAccounts: 'getPotentialExistingAccounts',
    createNewSubmission: 'createNewSubmission',
    rate: 'rate',
    updateDraftSubmission: 'updateDraftSubmission'
};

class QuoteApi {

    constructor() {
        this.userId = null;
        this.agentCode = null;
        this.sectionCode = null; // e.g. 303 for Boat
    }

    async getProfile(email) {
        // 1. Get User Profile (Contact)
        // Adjust based on HAR: /contact-profile?emailAddress=...
        // Actually, we need the ciamId from token usually, or email.
        console.log(`🔍 Fetching profile for ${email}...`);
        try {
            // We might just need the agent profile directly if we know the prismId or username
            // The previous script used 'jberndt' as userId.
            // We should extract userId from the token or use a known one.
            // For now, let's assume 'jberndt' as per previous successful logs, 
            // OR derive it from the 'sub' claim in the token if possible.
            // Let's rely on the previous logic:
            this.userId = 'jberndt'; // Placeholder/Default

            const profile = await apiClient.get(`${apiClient.restUrl}/agents/${this.userId}/profile?domain=default`);
            this.agentCode = profile.data.agentCode;
            console.log(`✅ Agent Code: ${this.agentCode}`);
        } catch (e) {
            console.error('Failed to get profile:', e.message);
            throw e;
        }
    }

    async getProductConfig() {
        console.log('🔍 Fetching product configuration...');
        const params = new URLSearchParams({
            userId: this.userId,
            agentCode: this.agentCode,
            state: QUOTE_CONFIG.state,
            effectiveDate: QUOTE_CONFIG.effectiveDate
        });

        const res = await apiClient.get(`${apiClient.restUrl}${API_ENDPOINTS.products}?${params}`);
        const products = res.data.portalProducts || [];

        const target = products.find(p => p.description === QUOTE_CONFIG.product);
        if (!target) {
            throw new Error(`Product ${QUOTE_CONFIG.product} not found in state ${QUOTE_CONFIG.state}`);
        }
        this.sectionCode = target.sectionCode;
        console.log(`✅ Selected Product: ${target.description} (Section: ${this.sectionCode})`);
    }

    async getSignedRedirectUrl() {
        console.log('🔑 Generating Signed Redirect URL...');
        // Format date MM/DD/YYYY
        const [y, m, d] = QUOTE_CONFIG.effectiveDate.split('-');
        const effDate = `${m}/${d}/${y}`;

        const params = new URLSearchParams({
            userId: this.userId,
            policyQuoteNumber: 'null',
            gpa: 'gpaNewQuote',
            pc: 'false',
            agencyCode: this.agentCode,
            ratingEffDate: effDate,
            ratingState: QUOTE_CONFIG.state,
            sectionCode: this.sectionCode,
            nonce: `api${Date.now()}`
        });

        const res = await apiClient.get(`${apiClient.amsuitePlusUrl}${API_ENDPOINTS.redirect}?${params}`);
        const url = res.data; // usually text/plain
        console.log(`✅ Signed URL generated.`);
        return url;
    }

    // --- JSON-RPC Methods (Post-Bridge) ---

    async startQuoteSession() {
        console.log('🚀 Initializing Gateway Session...');
        // Verify User
        const user = await apiClient.callRpc('/gateway/user', JSON_RPC.getCurrentUser);
        console.log(`   User Info: ${JSON.stringify(user)}`);

        // Ensure Agent context and get Producer Code
        // Result is array of producer codes
        const producers = await apiClient.callRpc('/gateway/user', JSON_RPC.getAvailableProducerCodes);
        if (producers && producers.length > 0) {
            const code = producers[0].code; // Assuming structure based on HAR logic
            console.log(`✅ Found Producer Code: ${code}`);
            return code;
        } else {
            console.warn('⚠️ No producer codes found for user. Using default.');
            return '029610';
        }
    }

    // --- Wizard Flow Methods ---

    // --- RPC Methods from HAR ---

    async getProducerProducts(producerCode) {
        console.log(`🔍 Fetching Producer Products (RPC) using code: ${producerCode}...`);

        // Use provided code or default
        const codeToUse = producerCode || '029610';

        // Matches Call #9 in HAR
        // Extract effective date parts
        const [year, month, day] = QUOTE_CONFIG.effectiveDate.split('-').map(Number);

        const params = [{
            effectiveDt: {
                year: year,
                month: month,
                day: day,
                isMasked: false
            },
            userName: this.userId || 'jberndt',
            state: QUOTE_CONFIG.state,
            jobType: 'QUOTE',
            chAsgnId: codeToUse, // Added missing parameter
            PrAsgnId: ""         // Added empty param from HAR
        }];

        try {
            const result = await apiClient.callRpc('/prism/auth', 'getProducerProducts', params);
            // Result is likely an array of products.
            // We need to find the one matching "PersonalAuto" / "boat"
            // For now, returning mocked values based on HAR to ensure flow continuity
            // Real implementation would parse `result` to find correct `companyNum` (uWCompany)
            return { producerCode: codeToUse, uWCompany: '071' };
        } catch (e) {
            console.warn('⚠️ getProducerProducts failed, using HAR defaults:', e.message);
            return { producerCode: codeToUse, uWCompany: '071' };
        }
    }

    async getOrCreateAccount(customer, producerCode) {
        console.log(`🆕 Creating/Retrieving Account for: ${customer.first_name} ${customer.last_name}...`);

        const dobDate = new Date(customer.dob);
        const producer = producerCode || '029610';
        // GW uses 0-indexed months (Jan=0, Feb=1, etc.) — same as JS Date.getMonth()
        const dob = { year: dobDate.getFullYear(), month: dobDate.getMonth(), day: dobDate.getDate() };

        // --- Print Account Fields ---
        const fields = [
            { field: 'First Name', value: customer.first_name },
            { field: 'Last Name', value: customer.last_name },
            { field: 'Date of Birth', value: `${dob.year}-${dob.month}-${dob.day}` },
            { field: 'Address Line 1', value: customer.address.address_line_1 },
            { field: 'City', value: customer.address.city },
            { field: 'State', value: customer.address.state },
            { field: 'Postal Code', value: customer.address.zip },
            { field: 'Phone', value: customer.phone },
            { field: 'Producer Code', value: producer },
        ];
        console.log('\n   ┌──────────────────────────────────────────────┐');
        console.log('   │     ACCOUNT CREATION - Fields Being Sent     │');
        console.log('   ├──────────────────────┬───────────────────────┤');
        console.log('   │ Field                │ Value                 │');
        console.log('   ├──────────────────────┼───────────────────────┤');
        fields.forEach(f => {
            const field = f.field.padEnd(20);
            const val = String(f.value).substring(0, 21).padEnd(21);
            console.log(`   │ ${field} │ ${val} │`);
        });
        console.log('   └──────────────────────┴───────────────────────┘\n');

        const params = [{
            accountHolder: {
                firstName: customer.first_name,
                lastName: customer.last_name,
                contactName: `${customer.first_name} ${customer.last_name}`,
                subtype: "Person",
                dateOfBirth: dob,
                primaryAddress: {
                    addressLine1: customer.address.address_line_1,
                    addressLine2: customer.address.address_line_2 || "",
                    city: customer.address.city,
                    state: customer.address.state,
                    postalCode: customer.address.zip,
                    country: "US",
                    addressType: "home",
                    standardizeStatus: "standardized"
                },
                primaryPhoneType: "mobile",
                cellNumber: customer.phone,
                producerCode: producer
            },
            producerCodes: [{ code: producer }]
        }];

        try {
            const result = await apiClient.callRpc('/gateway/account', 'getOrCreateAccount', params);
            if (result && result.accountNumber) {
                console.log(`✅ Account Created/Retrieved: ${result.accountNumber}`);
                return result;
            } else {
                throw new Error("No account number returned from getOrCreateAccount");
            }
        } catch (e) {
            console.error("❌ Failed to create account:", e.message);
            throw e;
        }
    }

    async getPotentialExistingAccounts(firstName, lastName, targetAccountNumber = null) {
        console.log(`🔎 Searching for existing accounts: ${firstName} ${lastName}...`);
        const params = [{
            country: 'US',
            contactType: 'person',
            firstName: firstName,
            lastName: lastName
        }];

        try {
            const result = await apiClient.callRpc('/gateway/account', 'getPotentialExistingAccounts', params);

            if (result && result.length > 0) {
                console.log(`   Debug: Found ${result.length} potential matches: ${result.map(r => r.accountNumber).join(', ')}`);
                let match = result[0]; // Default to first match

                // If a specific account number is targeted, try to find it
                if (targetAccountNumber) {
                    const exactMatch = result.find(acc => acc.accountNumber === targetAccountNumber);
                    if (exactMatch) {
                        console.log(`✅ Found exact match for target account: ${targetAccountNumber}`);
                        match = exactMatch;
                    } else {
                        console.warn(`⚠️ Target account ${targetAccountNumber} not found in search results. Defaulting to first match: ${match.accountNumber}`);
                    }
                } else {
                    console.log(`✅ Found ${result.length} matches. Using first match: ${match.accountNumber}`);
                }

                // The address is nested in accountHolder.primaryAddress
                // Flatten it to match what index.js expects (account.primaryAddress)
                if (match.accountHolder && match.accountHolder.primaryAddress) {
                    match.primaryAddress = match.accountHolder.primaryAddress;
                }
                return match;
            }
            return null;
        } catch (e) {
            console.warn(`⚠️ Account search failed: ${e.message}`);
            return null;
        }
    }

    /**
     * Adds a driver to the submission via RPC.
     * @param {Object} driver - The driver payload (person, relationship, driverQuestionSets, etc.)
     * @param {string} submissionNumber - The submission/job number
     * @returns {Promise<Object>} - The created driver object with publicID
     */
    async addDriverToSubmission(driver, submissionNumber) {
        const driverName = `${driver.person?.firstName || '?'} ${driver.person?.lastName || '?'}`;
        console.log(`   ➕ Adding Driver: ${driverName} to Submission ${submissionNumber}...`);

        const params = [{
            driver: driver,
            submissionNumber: submissionNumber
        }];

        const result = await apiClient.callRpc('/gatewayquote/driver', 'addDriverToSubmission', params);
        this.logRpcValidation(result, 'Add Driver');
        console.log(`   ✅ Driver Added: ${driverName} (publicID: ${result?.publicID || 'N/A'})`);
        return result;
    }

    /**
     * Adds a vehicle (boat or trailer) to the submission via RPC.
     * @param {Object} vehicle - The vehicle payload
     * @param {string} submissionNumber - The submission/job number
     * @param {string} sessionUUID - Session UUID from the submission
     * @param {string} policyType - e.g. 'boat'
     * @param {string} ratingState - e.g. 'FL'
     * @returns {Promise<Object>} - The created vehicle object
     */
    async addVehicleToSubmission(vehicle, submissionNumber, sessionUUID, policyType, ratingState) {
        const vType = vehicle.vehicleType || 'unknown';
        console.log(`   ➕ Adding Vehicle (${vType}): ${vehicle.year || '?'} ${vehicle.make || '?'} ${vehicle.model || '?'} to ${submissionNumber}...`);

        const params = [{
            SubmissionNumber: submissionNumber,
            SessionUUID: sessionUUID || '',
            Vehicle: vehicle,
            PolicyType: policyType || 'boat',
            RatingState: ratingState || 'FL'
        }];

        const result = await apiClient.callRpc('/gatewayquote/vehicle', 'addVehicleToSubmission', params);
        this.logRpcValidation(result, `Add Vehicle ${vType}`);
        console.log(`   ✅ Vehicle Added (${vType}): publicID ${result?.publicID || 'N/A'}`);
        return result;
    }

    /**
     * VMM Lookup: Get available boat lengths for a make/year/vehicleType.
     */
    async getBoatLengths({ vehicleType, year, make }) {
        const params = [{
            Year: String(year),
            VehicleType: vehicleType || 'boat',
            PolicyType: 'boat',
            Make: make
        }];
        console.log(`   🔍 VMM getBoatLengths: ${vehicleType} ${year} ${make}...`);
        const result = await apiClient.callRpc('/vmm/lookup', 'getBoatLengthsModels', params);
        return result?.lengths || [];
    }

    /**
     * VMM Lookup: Get available models for a make/year/vehicleType/length.
     */
    async getModels({ vehicleType, year, make, boatLength }) {
        const params = [{
            Year: String(year),
            VehicleType: vehicleType || 'boat',
            PolicyType: 'boat',
            Make: make,
            UnitConvSource: 'NONCONV',
            BoatLength: parseInt(boatLength) || 24
        }];
        console.log(`   🔍 VMM getModels: ${vehicleType} ${year} ${make} len=${boatLength}...`);
        const result = await apiClient.callRpc('/vmm/lookup', 'getModels', params);
        return result?.models || [];
    }

    /**
     * Calls the VMM (Vehicle Make/Model) lookup to get eligibility and rating info.
     * This is what the UI's make/model dropdown uses to validate vehicles.
     * @returns {Promise<Object>} - { eligibleInd, availableInd, vMMGroup, version, fuelType, ... }
     */
    async getUnitInfo({ vehicleType, year, make, model, boatLength, totalHP, state, effectiveDate }) {
        const params = [{
            VehicleType: vehicleType || 'boat',
            PolicyType: 'boat',
            Year: String(year),
            Make: make,
            Model: model,
            BoatLength: parseInt(boatLength) || 24,
            CompanyNumber: '071',
            TotalHorsePower: String(totalHP || '0'),
            transactionType: 'Submission',
            State: state || 'FL',
            UnitConvSource: 'NONCONV',
            EffectiveDate: effectiveDate || new Date().toISOString()
        }];

        console.log(`   🔍 VMM getUnitInfo: ${vehicleType} ${year} ${make} ${model}...`);
        const result = await apiClient.callRpc('/vmm/lookup', 'getUnitInfo', params);
        console.log(`   ✅ VMM Result: eligibleInd=${result?.eligibleInd}, availableInd=${result?.availableInd}, vMMGroup=${result?.vMMGroup}`);
        return result;
    }

    /**
     * Retrieves the full submission object (baseData, lobData, etc.)
     */
    async retrieveQuote(quoteID, postalCode, pageContext = null) {
        console.log(`📡 Retrieving Full Quote State for ${quoteID} (Context: ${pageContext})...`);

        const params = [{
            quoteID: quoteID,
            postalCode: postalCode,
            productCode: null,
            effectiveDate: null,
            gatewayportalnewsubmission: true,
            displayYourInfoStep: null,
            account: null,
            shouldUpdateEffectiveDate: null,
            pageContext: pageContext
        }];

        const result = await apiClient.callRpc('/gatewayquote/quote', 'retrieve', params);
        return result;
    }

    async retrieveCustomQuote(quoteID, sessionUUID) {
        console.log(`📡 Retrieving Custom Quote State for ${quoteID}...`);
        // Param structure guessed based on updateCustomQuoteCoverages peers
        // or standard retrieve params. Let's try standard params first.
        const params = [{
            quoteID: quoteID,
            sessionUUID: sessionUUID
        }];

        // Trying 'getCustomQuote' or 'retrieve' on the custom endpoint
        try {
            return await apiClient.callRpc('/gatewayquote/customquote', 'retrieve', params);
        } catch (e) {
            console.warn('   ⚠️ retrieve on customquote failed. Trying getQuote...');
            return await apiClient.callRpc('/gatewayquote/customquote', 'getQuote', params);
        }
    }

    async createNewSubmission(accountNumber, producerInfo, options = {}) {
        console.log(`📝 Creating Submission for Account ${accountNumber}...`);

        const params = [{
            effectiveDate: options.effectiveDate || new Date().toISOString(),
            producerCode: producerInfo.producerCode,
            state: options.state || QUOTE_CONFIG.state,
            productCode: options.productCode || 'PersonalAuto',
            policyType: options.policyType || 'boat',
            uWCompany: producerInfo.uWCompany,
            country: 'US',
            accountNumber: accountNumber
        }];

        // Returns the full submission object needed for updates
        // Returns the full submission object needed for updates
        const result = await apiClient.callRpc('/gateway/submission', 'createNewSubmission', params);
        this.logRpcValidation(result, 'Create Submission');
        return result;
    }

    /**
     * Generic method to update the submission (Wizard Save & Next)
     */
    async updateDraftSubmission(submissionObj, pageContext) {
        console.log(`💾 Saving Step: ${pageContext}...`);

        // Ensure pageContext is updated in the object
        submissionObj.pageContext = pageContext;

        const params = [submissionObj];
        const result = await apiClient.callRpc('/gatewayquote/quote', 'updateDraftSubmission', params);
        this.logRpcValidation(result, `Save Step: ${pageContext}`);
        return result; // Returns the updated submission object
    }

    /**
     * Saves the submission AND triggers the rating engine to generate a premium.
     * This is the key call that produces quoted premium amounts.
     * @param {Object} submissionObj - The full submission object
     * @param {string} pageContext - The wizard step name (e.g. 'VEHICLE')
     * @returns {Promise<Object>} - The rated submission with quoteData.offeredQuotes[].premium
     */
    async saveAndQuote(submissionObj, pageContext) {
        console.log(`💰 Save & Quote (Rating) Step: ${pageContext}...`);
        submissionObj.pageContext = pageContext;

        const params = [submissionObj];
        const result = await apiClient.callRpc('/gatewayquote/quote', 'saveAndQuote', params);
        this.logRpcValidation(result, `SaveAndQuote: ${pageContext}`);

        // Extract premium from response
        const offeredQuotes = result?.quoteData?.offeredQuotes || [];
        if (offeredQuotes.length > 0 && offeredQuotes[0].premium) {
            const premium = offeredQuotes[0].premium;
            console.log(`   💵 Premium: $${premium.total?.amount} (Monthly: $${premium.monthlyPremium?.amount})`);
        } else {
            console.warn('   ⚠️ No premium returned from saveAndQuote.');
        }

        return result;
    }



    async updateCustomQuoteCoverages(quoteObject, quoteID, sessionUUID) {
        console.log(`   📝 Updating Coverages for Quote ${quoteID}...`);

        const params = [{
            quote: quoteObject,
            quoteID: quoteID,
            sessionUUID: sessionUUID
        }];

        const result = await apiClient.callRpc('/gatewayquote/customquote', 'updateCustomQuoteCoverages', params);
        this.logRpcValidation(result, 'Update Coverages');

        if (result && result.premium) {
            const total = result.premium.total?.amount || 0;
            console.log(`   💰 New Premium: $${total}`);
        }

        return result;
    }

    /**
     * Adds an Additional Insured (e.g., Secondary Applicant)
     */
    async addAdditionalInsured(quoteID, sessionUUID, insuredData) {
        console.log(`➕ Adding Additional Insured to Quote ${quoteID}...`);

        // Construct the payload based on standard Person pattern
        const params = [{
            sessionUUID: sessionUUID,
            quoteID: quoteID,
            additionalInsured: {
                // If it's a person
                subtype: "Person",
                firstName: insuredData.firstName,
                lastName: insuredData.lastName,
                dateOfBirth: insuredData.dateOfBirth ? {
                    year: parseInt(insuredData.dateOfBirth.split('-')[0]),
                    month: parseInt(insuredData.dateOfBirth.split('-')[1]) - 1,
                    day: parseInt(insuredData.dateOfBirth.split('-')[2]),
                    isMasked: false
                } : null,
                maritalStatus: insuredData.maritalStatus,
                primaryPhoneType: "mobile", // Default
                cellNumber: insuredData.phone || "",
                emailAddress1: insuredData.email || "",
                additionalInsuredType: "person" // Explicit type from HAR
            }
        }];

        return await apiClient.callRpc('/gatewayquote/quote', 'addAdditionalInsured', params);
    }

    /**
     * Updates the Quoted Submission (Policy Info Step - Email/Phone/Consent)
     */
    async updateQuotedSubmission(quoteID, sessionUUID, baseDataUpdate) {
        console.log(`📝 Updating Quoted Submission (Policy Info) for ${quoteID}...`);

        const params = [{
            sessionUUID: sessionUUID,
            quoteID: quoteID,
            baseData: baseDataUpdate
        }];

        return await apiClient.callRpc('/gatewayquote/quote', 'updateQuotedSubmission', params);
    }

    /**
     * Explicitly rates the quote to get premium.
     */
    async rate(quoteID, sessionUUID) {
        console.log(`💰 Rating Quote ${quoteID}...`);
        const params = [{
            sessionUUID: sessionUUID,
            quoteID: quoteID
        }];
        const result = await apiClient.callRpc('/gatewayquote/quote', 'rate', params);
        this.logRpcValidation(result, 'Rate Quote');
        return result;
    }

    /**
     * Helper to log validation errors/warnings from RPC response.
     * NOW THROWS ERROR if action is blocking or errors are present.
     */
    logRpcValidation(result, context = '') {
        if (!result || !result.validationResult) return;

        const vr = result.validationResult;
        const prefix = context ? `[${context}] ` : '';
        let hasBlockingErrors = false;

        // 1. Log Errors (Always Blocking)
        if (vr.errors && vr.errors.length > 0) {
            console.error(`❌ ${prefix}Validation Errors:`);
            vr.errors.forEach(e => console.error(`   - ${e.errorMessage || JSON.stringify(e)}`));
            hasBlockingErrors = true;
        }

        // 2. Log Warnings (May be blocking)
        if (vr.warnings && vr.warnings.length > 0) {
            console.warn(`⚠️ ${prefix}Validation Warnings:`);
            vr.warnings.forEach(w => console.warn(`   - ${w.warningMessage || JSON.stringify(w)}`));
        }

        // 3. Check Blocking Flag
        if (vr.shouldBlockPage) {
            console.error(`🚫 ${prefix}Action BLOCKING Page Navigation!`);
            hasBlockingErrors = true;
        }

        // 4. Halt Execution (with Smart Override for Warnings)
        if (hasBlockingErrors) {
            const messages = vr.validationMessages || {};
            const errors = messages.errors || vr.errors || [];
            const warnings = messages.warnings || vr.warnings || [];

            const onlyWarnings = errors.length === 0 && warnings.length > 0;

            if (onlyWarnings) {
                // Critical warning patterns that MUST halt execution
                const CRITICAL_PATTERNS = [
                    'ineligible',
                    'may not be submitted',
                    'cannot be quoted',
                    'cannot be bound',
                    'declined',
                    'rejected',
                ];

                const warningTexts = warnings.map(w => (w.warningMessage || w.message || '').toLowerCase());
                const hasCriticalWarning = warningTexts.some(text =>
                    CRITICAL_PATTERNS.some(pattern => text.includes(pattern))
                );

                if (hasCriticalWarning) {
                    console.error(`🛑 ${prefix}CRITICAL WARNING detected — halting automation.`);
                    warnings.forEach(w => {
                        console.error(`   ❌ ${w.warningMessage || w.message}`);
                    });
                    console.error('   🔍 Full Validation Object:', JSON.stringify(vr, null, 2));
                    throw new Error(`Critical Warning in ${context}`);
                }

                // Non-critical warnings (e.g. address deliverability) — bypass
                console.warn(`⚠️ ${prefix}Blocking Warning(s) detected, but none are critical. Bypassing...`);
                warnings.forEach(w => {
                    console.warn(`   ⚠️ ${w.warningMessage || w.message}`);
                });
                return;
            }

            console.error(`🛑 HALTING AUTOMATION due to blocking validation errors in ${context}.`);
            console.error('   🔍 Full Validation Object:', JSON.stringify(vr, null, 2));
            throw new Error(`Blocking Validation Errors in ${context}`);
        }
    }
}

module.exports = new QuoteApi();
