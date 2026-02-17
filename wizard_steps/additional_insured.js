/**
 * Handles the "Additional Insured" step.
 * Checks for "Secondary Applicant" or "Co-Applicant" in NBOA data 
 * and adds them to the quote.
 */
module.exports = async function saveAdditionalInsured(quoteApi, submission, customer) {
    console.log('\n--- Additional Insured Step ---');

    // 1. Identify Additional Insureds from NBOA data
    const operators = customer.operators || [];
    const additionalInsureds = operators.filter(op => {
        const type = (op.insured_type || '').toLowerCase();
        return type.includes('secondary') || type.includes('spouse') || type.includes('co-applicant');
    });

    if (additionalInsureds.length === 0) {
        console.log('   ℹ️ No Additional Insureds found in data.');
        return submission; // No change
    }

    console.log(`   👥 Found ${additionalInsureds.length} potential Additional Insured(s).`);

    const quoteID = submission.quoteID;
    const sessionUUID = submission.sessionUUID;

    for (const insured of additionalInsureds) {
        // Construct basic data object
        const nameParts = (insured.name || '').split(' ');
        const insuredData = {
            firstName: nameParts[0] || '',
            lastName: nameParts.slice(1).join(' ') || '',
            dateOfBirth: insured.dob || null, // Format YYYY-MM-DD
            maritalStatus: 'M', // Defaulting to Married for Spouse/Co-App usually
            phone: insured.phone || '',
            email: insured.email || ''
        };

        try {
            await quoteApi.addAdditionalInsured(quoteID, sessionUUID, insuredData);
            console.log(`   ✅ Added Additional Insured: ${insured.name}`);
        } catch (error) {
            console.warn(`   ⚠️ Failed to add Additional Insured ${insured.name}: ${error.message}`);
            // Don't block the whole flow, but log strictly
        }
    }

    return submission;
};
