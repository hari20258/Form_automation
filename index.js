const apiClient = require('./api_client');
const quoteApi = require('./quote_api');
const { executeBridge } = require('./auth_bridge');
const dataLoader = require('./data_loader');

// Wizard Steps
const savePolicyDetails = require('./wizard_steps/policy_details');
const saveQualifications = require('./wizard_steps/qualification');
const saveDrivers = require('./wizard_steps/drivers');
const saveVehicles = require('./wizard_steps/vehicles');

async function main() {
    console.log('🚀 Starting AMSuite Automation (NBOA Data - Debug Mode)...');

    try {
        // 0. Load Data
        const customer = dataLoader.getCustomer();
        if (!customer) throw new Error("Applicant data not found");
        console.log(`📂 Loaded Applicant: ${customer.applicant.first_name} ${customer.applicant.last_name}`);

        // 1. Load Tokens
        apiClient.loadTokens();

        // 2. Pre-Auth / Bridge Check
        let sessionCookies = apiClient.cookies;

        if (sessionCookies && sessionCookies.includes('JSESSIONID')) {
            console.log('⏩ Skipping Auth Bridge (Session Cookies found in manual sync).');
            apiClient.setSessionCookies(sessionCookies);
        } else {
            console.log('⚠️ No session cookies found. Attempting Bridge...');
            const signedUrl = "https://amsuite.amig.com/gateway-portal/dist/html/index.html";
            sessionCookies = await executeBridge(signedUrl);
            apiClient.setSessionCookies(sessionCookies);
        }

        // 3. Start Quote Session (RPC Flow)
        console.log('\n--- STEP 1: Initialization ---');

        let producerCode = null;
        // Retry logic if session is stale (RPC returns HTML)
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                // Retrieve Producer Code (ChAsgnId)
                producerCode = await quoteApi.startQuoteSession();
                console.log('✅ Session Valid. Producer Code retrieved.');
                break;
            } catch (e) {
                if (attempt === 1 && (e.message.includes('HTML') || e.message.includes('Session invalid'))) {
                    console.warn(`⚠️ Session appears invalid/expired. Triggering Auth Bridge (Attempt ${attempt} of 2)...`);
                    const signedUrl = "https://amsuite.amig.com/gateway-portal/dist/html/index.html";
                    sessionCookies = await executeBridge(signedUrl);
                    apiClient.setSessionCookies(sessionCookies);
                    console.log('🔄 Retrying Session Initialization...');
                } else {
                    throw e; // Fatal or second failure
                }
            }
        }

        // Fetch Product Configuration using the code
        const producerInfo = await quoteApi.getProducerProducts(producerCode);
        console.log(`✅ Producer Context: ${JSON.stringify(producerInfo)}`);

        // --- STEP 2: Account ---
        console.log('\n--- STEP 2: Account ---');

        // --- Helper: Parse Address String ---
        function parseAddressString(addrStr) {
            if (!addrStr) return null;
            // Example: "2576 SE 31st Pl\n\nOcala, FL 34471\n\nUS"
            // Simple logic: Split by newlines, filter empty.
            // Last line is Country (US), 2nd to last is City, State Zip. First is Line 1.
            const lines = addrStr.split('\n').map(l => l.trim()).filter(l => l);
            if (lines.length < 2) return null;

            const line1 = lines[0];
            const lastLine = lines[lines.length - 1] === 'US' ? lines[lines.length - 2] : lines[lines.length - 1];

            // Parse City, State Zip from "Ocala, FL 34471"
            // Regex: (.*), ([A-Z]{2}) (\d{5}(?:-\d{4})?)
            const match = lastLine.match(/^(.*),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/);

            if (match) {
                return {
                    address_line_1: line1,
                    city: match[1],
                    state: match[2],
                    zip: match[3]
                };
            }
            return {
                address_line_1: line1,
                city: '',
                state: 'FL', // Default
                zip: ''
            };
        }

        const applicantData = customer.applicant;
        let account = null;

        // Parse and attach address to customer object for steps to use
        const parsedAddress = parseAddressString(applicantData.billing_address);
        customer.address = parsedAddress || {
            address_line_1: customer.location_storage?.loc_address || '',
            city: customer.location_storage?.city || '',
            state: customer.location_storage?.state || '',
            zip: customer.location_storage?.zip || ''
        };
        console.log(`✅ Parsed Applicant Address: ${JSON.stringify(customer.address)}`);

        // Prepare data for New Customer creation
        const newCustomerData = {
            first_name: applicantData.first_name,
            last_name: applicantData.last_name,
            dob: customer.operators?.[0]?.dob,
            phone: applicantData.mobile || applicantData.res_phone,
            address: customer.address
        };

        if (applicantData.account_number || customer.account?.account_number) {
            const acctNum = applicantData.account_number || customer.account.account_number;
            console.log(`🔍 Search by Account Number: ${acctNum}`);

            // Pass acctNum as the third argument to target specific account
            let potentialAccounts = await quoteApi.getPotentialExistingAccounts(applicantData.first_name, applicantData.last_name, acctNum);

            if (potentialAccounts) {
                if (potentialAccounts.accountNumber === acctNum) {
                    account = potentialAccounts;
                    console.log(`✅ Verified Account: ${account.accountNumber}`);
                } else {
                    console.warn(`⚠️ Account Number mismatch in search. Using result: ${potentialAccounts.accountNumber}`);
                    account = potentialAccounts;
                }

            } else {
                console.warn("⚠️ Account number provided but not found via name search.");
                throw new Error("Account Number provided but Account not found.");
            }

        } else {
            console.log("🆕 No Account Number provided. Executing New Customer Flow...");
            account = await quoteApi.getOrCreateAccount(newCustomerData, producerCode);
        }

        if (!account) {
            throw new Error("Failed to resolve an Account.");
        }

        const resolvedZip = account.accountHolder?.primaryAddress?.postalCode || 'N/A';
        console.log(`✅ Using Account: ${account.accountNumber} (Zip: ${resolvedZip})`);

        const accountNumber = account.accountNumber;
        if (account.primaryAddress) {
            console.log('DEBUG: Account Address:', JSON.stringify(account.primaryAddress));
        }

        // Use account zip if available, otherwise use NBOA zip
        // Rename variable to avoid conflict with later 'postalCode' usage or scoped properly
        const accountPostalCode = account.primaryAddress?.postalCode || addressData.zip || applicantData.billing_address.match(/\d{5}/)?.[0];
        console.log(`✅ Using Account: ${accountNumber} (Zip: ${accountPostalCode})`);

        // 5. Create Initial Submission
        const createSubmission = require('./wizard_steps/create_submission');
        const submissionResult = await createSubmission(quoteApi, accountNumber, producerInfo);
        const jobNumber = submissionResult.jobNumber;

        // 5.5 Retrieve Full Quote Object
        let submission = await quoteApi.retrieveQuote(jobNumber, accountPostalCode);
        console.log('✅ Full Quote State Retrieved.');

        // 6. Policy Details Step
        console.log('\n--- STEP 4: Policy Details ---');
        submission = await savePolicyDetails(quoteApi, submission, customer);
        console.log('✅ Policy Details Saved.');

        // 6.5 Additional Insured Step
        const saveAdditionalInsured = require('./wizard_steps/additional_insured');
        submission = await saveAdditionalInsured(quoteApi, submission, customer);

        // 7. Qualification Step
        console.log('\n--- STEP 5: Qualification ---');
        let qualificationResult = await saveQualifications(quoteApi, submission, customer);
        console.log('✅ Qualification Saved.');

        // --- STEP 6: Drivers ---
        console.log('\n--- STEP 6: Drivers ---');
        console.log('🔄 Refreshing Quote State before Drivers step...');
        const freshPostalCode = submission.baseData?.policyAddress?.postalCode || accountPostalCode || '34471';
        const quoteId = submission.quoteID || submission.jobNumber || jobNumber;
        let freshState = await quoteApi.retrieveQuote(quoteId, freshPostalCode);

        let driversResult = await saveDrivers(quoteApi, freshState, customer);
        console.log('✅ Drivers Step Complete.');

        // --- STEP 7: Vehicles ---
        console.log('\n--- STEP 7: Vehicles ---');
        let vehiclesResult = await saveVehicles(quoteApi, driversResult, customer);
        console.log('✅ Vehicles Step Complete.');

        // --- STEP 7b: Prior Losses & Violations ---
        const savePriorLosses = require('./wizard_steps/prior_losses');
        let priorLossesResult = await savePriorLosses(quoteApi, vehiclesResult, customer);

        // --- STEP 8: Coverages & Quote ---
        const { saveCoverages } = require('./wizard_steps/coverages');
        let quoteResult = await saveCoverages(priorLossesResult, customer);

        // --- STEP 9: Policy Info (Post-Quote) ---
        const savePolicyInfo = require('./wizard_steps/policy_info');
        await savePolicyInfo(quoteApi, quoteResult, customer);

        console.log('\n========================================');
        console.log('🎉 Quote Automation Complete through Policy Info!');
        console.log(`Job Number: ${vehiclesResult.job?.jobNumber}`);
        console.log('Next Step: Payment / Bind');
        console.log('========================================\n');

    } catch (e) {
        console.error('\n❌ Automation Failed:', e.message);
        if (e.response) {
            console.error('API Response:', JSON.stringify(e.response.data));
        }
        process.exit(1);
    }
}

main();
