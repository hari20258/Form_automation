/**
 * Handles the "Policy Info" step (Post-Quote).
 * Updates Email, Phone number, and Consent indicators.
 */
module.exports = async function savePolicyInfo(quoteApi, submission, customer) {
    console.log('\n--- STEP 9: Policy Info ---');

    console.log(`📝 Updating Policy Info for Quote ${submission.quoteID}...`);

    // Default data mapping
    const email = customer.applicant.email || '';
    const phone = customer.applicant.phone || customer.applicant.mobile || '';
    const consent = customer.consents?.marketing_consent === 'true'; // Example mapping

    // 1. Retrieve current "Quoted" state
    // We need the latest state to perform an update
    const sessionUUID = submission.sessionUUID;
    const quoteID = submission.quoteID;

    // We must use the EXISTING baseData structure and just update the specific fields
    // Creating a partial object often causes 500 errors because internal IDs/checksums are lost
    const baseDataUpdate = { ...submission.baseData };

    if (baseDataUpdate.accountHolder) {
        baseDataUpdate.accountHolder.emailAddress1 = email;
        baseDataUpdate.accountHolder.primaryPhoneType = "mobile";
        baseDataUpdate.accountHolder.cellNumber = phone;
        baseDataUpdate.accountHolder.customerCallOptInIndicator = consent;
    } else {
        console.warn('   ⚠️ No accountHolder found in baseData. Update might fail.');
    }

    try {
        const result = await quoteApi.updateQuotedSubmission(quoteID, sessionUUID, baseDataUpdate);
        console.log('   ✅ Policy Info Updated successfully.');

        if (result && result.validationResult && result.validationResult.validationMessages?.errors?.length > 0) {
            console.warn('   ⚠️ Validation Errors in Policy Info:', result.validationResult.validationMessages.errors);
        }

        return result;

    } catch (error) {
        console.error(`ERROR: Failed to update Policy Info: ${error.message}`);
        throw error;
    }
};
