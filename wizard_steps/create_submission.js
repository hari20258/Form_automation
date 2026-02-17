/**
 * Handles the "Create Submission" step.
 * This corresponds to the "New Quote: Policy Details" screen where 
 * Product, Policy Type, Producer, and Effective Date are selected.
 *
 * @param {Object} quoteApi - The QuoteApi instance
 * @param {string} accountNumber - The verified account number
 * @param {Object} producerInfo - Producer code and underwriting company
 * @returns {Promise<Object>} - The submission result (containing jobNumber)
 */
module.exports = async function createSubmission(quoteApi, accountNumber, producerInfo) {
    console.log('\n--- STEP 3: Create Submission (Policy Details) ---');
    console.log('📝 Configuring New Quote...');

    // hardcoded data matching the HAR and requirements
    const effectiveDate = new Date().toISOString();
    const state = 'FL';
    const productCode = 'PersonalAuto'; // API Value for "Boat" in this context
    const policyType = 'boat';
    const producerCode = producerInfo.producerCode || '029610';
    const uwCompany = producerInfo.uWCompany || '071';

    // --- Log the fields for the User ---
    const fields = [
        { field: 'Account Number', value: accountNumber },
        { field: 'Producer Code', value: producerCode },
        { field: 'Product', value: productCode }, // User asked to see this
        { field: 'Policy Type', value: policyType }, // User asked to see this
        { field: 'Effective Date', value: effectiveDate }, // User asked to see this
        { field: 'Rating State', value: state },
        { field: 'UW Company', value: uwCompany }
    ];

    console.log(`\n   ┌────────────────────────────────────────────────────────────┐`);
    console.log(`   │   NEW QUOTE DETAILS - Fields Being Sent                    │`);
    console.log(`   ├──────────────────────┬─────────────────────────────────────┤`);
    console.log(`   │ Field                │ Value                               │`);
    console.log(`   ├──────────────────────┼─────────────────────────────────────┤`);
    fields.forEach(f => {
        const field = f.field.padEnd(20);
        const val = String(f.value).substring(0, 35).padEnd(35);
        console.log(`   │ ${field} │ ${val} │`);
    });
    console.log(`   └──────────────────────┴─────────────────────────────────────┘\n`);

    // Execute the API call
    // Passing the optional parameters to ensure consistency with logs
    const submissionResult = await quoteApi.createNewSubmission(accountNumber, producerInfo, {
        effectiveDate,
        state,
        productCode,
        policyType
    });

    // Add job number to result for logging
    if (submissionResult && submissionResult.jobNumber) {
        console.log(`✅ Submission Created Successfully: ${submissionResult.jobNumber}`);
    } else {
        console.warn(`⚠️ Submission created but Job Number is missing in result.`);
    }

    return submissionResult;
};
