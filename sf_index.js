const fs = require('fs');
const path = require('path');
const DataMapper = require('./utility/mapper');
const { ACCOUNT_SCHEMA, VEHICLE_BOAT_SCHEMA, DRIVER_SCHEMA } = require('./schemas/salesforce_schemas');

// Original automation imports
const apiClient = require('./api_client');
const quoteApi = require('./quote_api');
const { executeBridge } = require('./auth_bridge');

// Wizard Steps
const savePolicyDetails = require('./wizard_steps/policy_details');
const saveQualifications = require('./wizard_steps/qualification');
const saveDrivers = require('./wizard_steps/drivers');
const saveVehicles = require('./wizard_steps/vehicles');
const { saveCoverages } = require('./wizard_steps/coverages');
const savePriorLosses = require('./wizard_steps/prior_losses');

async function main() {
    console.log('🚀 Starting AMSuite Automation (Salesforce Data Flow)...');

    try {
        // 0. Load Salesforce Data
        const sfData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'FromSalesforce.json'), 'utf8'));
        console.log(`📂 Loaded Salesforce Data for: ${sfData.leadDetails.name}`);

        // 1. Map Salesforce Data to AMSuite structure (Shim)
        // We'll create a 'customer' object that matches the structure expected by existing wizard steps
        // BUT using the DataMapper for key components.

        const accountData = DataMapper.map(sfData, ACCOUNT_SCHEMA);
        const boatData = DataMapper.map(sfData, VEHICLE_BOAT_SCHEMA);
        const driver1Data = DataMapper.map(sfData, DRIVER_SCHEMA);
        const engineData = DataMapper.map(sfData, ENGINE_SCHEMA);
        const trailerData = DataMapper.map(sfData, TRAILER_SCHEMA);

        // Construct the legacy customer object structure
        const customer = {
            applicant: accountData,
            address: accountData.address,
            vessel: {
                mfgr_name: boatData.make,
                model_name: boatData.model,
                model_year: boatData.year,
                length_ft: boatData.length,
                hull_material: sfData.opportunityDetails.watercraft.hull_material__c,
                purchase_price: boatData.purchasePrice,
                hull_value: boatData.vehicleValue,
                purchase_date: sfData.opportunityDetails.watercraft.purchase_date__c, // raw for date converter in step
                max_speed: boatData.speed,
                primary_use: boatData.primaryUse
            },
            engine_trailer: {
                propulsion_type: engineData.propulsion_type,
                fuel_type: engineData.fuel_type,
                hp_total: engineData.hp_total,
                num_engines: engineData.num_engines,
                engine_mfgr: engineData.engine_mfgr,
                engine_year: engineData.engine_year,
                engine_model: engineData.engine_model,
                // Trailer fields
                trailer_mfgr: trailerData.trailer_mfgr,
                trailer_year: trailerData.trailer_year,
                trailer_value: trailerData.trailer_value,
                trailer_model: trailerData.trailer_model
            },
            hins: {
                hin_vessel: boatData.hullId,
                hin_trailer: sfData.opportunityDetails.trailerAndTender.trailer_vin__c || ''
            },
            location_storage: {
                loc_address: boatData.storageAddress.addressLine1,
                city: boatData.storageAddress.city,
                state: boatData.storageAddress.state,
                zip: boatData.storageAddress.postalCode,
                storage_type: sfData.opportunityDetails.storageLocation.storage_type__c,
                prim_loc: sfData.opportunityDetails.storageLocation.storage_loc_prim_res__c
            },
            operators: [
                {
                    first_name: driver1Data.person.firstName,
                    last_name: driver1Data.person.lastName,
                    dob: sfData.opportunityDetails.operators.operator_1_dob__c,
                    gender: 'Male', // Default or derived
                    marital_status: driver1Data.person.maritalStatus,
                    experience_years: driver1Data.experienceYears,
                    dl_number: driver1Data.person.licenseNumber,
                    dl_state: driver1Data.person.licenseState
                }
            ],
            currently_insured: accountData.currently_insured
        };

        console.log(`✅ Data Mapped. Applicant: ${customer.applicant.first_name} ${customer.applicant.last_name}`);

        // 2. Load Tokens & Auth
        apiClient.loadTokens();
        let sessionCookies = apiClient.cookies;
        if (!sessionCookies?.includes('JSESSIONID')) {
            console.log('⚠️ No session cookies found. Attempting Bridge...');
            sessionCookies = await executeBridge("https://amsuite.amig.com/gateway-portal/dist/html/index.html");
            apiClient.setSessionCookies(sessionCookies);
        }

        // 3. Start Session
        console.log('\n--- STEP 1: Initialization ---');
        const producerCode = await quoteApi.startQuoteSession();
        const producerInfo = await quoteApi.getProducerProducts(producerCode);

        // 4. Resolve Account
        console.log('\n--- STEP 2: Account ---');
        const newCustomerData = {
            first_name: customer.applicant.first_name,
            last_name: customer.applicant.last_name,
            dob: customer.operators[0].dob,
            phone: customer.applicant.phone,
            address: customer.address
        };
        const account = await quoteApi.getOrCreateAccount(newCustomerData, producerCode);
        const accountNumber = account.accountNumber;
        const postalCode = account.accountHolder?.primaryAddress?.postalCode || '34471';

        // 5. Create Submission
        const saveCreateSubmission = require('./wizard_steps/create_submission');
        const submissionResult = await saveCreateSubmission(quoteApi, accountNumber, producerInfo);
        const jobNumber = submissionResult.jobNumber;

        // 6. Wizard Steps
        let submission = await quoteApi.retrieveQuote(jobNumber, postalCode);

        console.log('\n--- STEP 4: Policy Details ---');
        submission = await savePolicyDetails(quoteApi, submission, customer);

        console.log('\n--- STEP 4.5: Additional Insured ---');
        const saveAdditionalInsured = require('./wizard_steps/additional_insured');
        submission = await saveAdditionalInsured(quoteApi, submission, customer);

        console.log('\n--- STEP 5: Qualification ---');
        submission = await saveQualifications(quoteApi, submission, customer);

        console.log('\n--- STEP 6: Drivers ---');
        submission = await saveDrivers(quoteApi, submission, customer);

        console.log('\n--- STEP 7: Vehicles ---');
        submission = await saveVehicles(quoteApi, submission, customer);

        console.log('\n--- STEP 8: Coverages ---');
        submission = await saveCoverages(submission, customer);

        console.log('\n--- STEP 9: Prior Losses & Policies ---');
        submission = await savePriorLosses(quoteApi, submission, customer);

        console.log('\n--- STEP 10: Final Quote Generation ---');
        const quoteResult = await quoteApi.rate(submission.quoteID || jobNumber, submission.sessionUUID);

        // --- Finalize ---
        console.log('\n========================================');
        console.log('🎉 Salesforce Data Automation Successful!');
        console.log(`Job Number: ${submission.job?.jobNumber || jobNumber}`);
        if (quoteResult?.quoteData?.offeredQuotes?.[0]?.premium) {
            const prem = quoteResult.quoteData.offeredQuotes[0].premium;
            console.log(`Final Premium: $${prem.total?.amount}`);
        }
        console.log('========================================\n');

    } catch (e) {
        console.error('\n❌ Automation Failed:', e.message);
        process.exit(1);
    }
}

main();
