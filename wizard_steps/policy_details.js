/**
 * Handles the "Policy Details" step of the Quote Wizard.
 * 
 * @param {Object} quoteApi - The QuoteApi instance (for calling updateDraftSubmission)
 * @param {Object} submission - The current submission object
 * @param {Object} customer - The customer data object (NBOA Structure)
 * @returns {Promise<Object>} - The updated submission object
 */
module.exports = async function savePolicyDetails(quoteApi, submission, customer) {
    console.log('📋 Updating Policy Details...');

    // NBOA Data Mapping
    const policyType = 'boat';

    // Apply defaults and dynamic values
    const baseDataFields = [];
    if (submission.baseData) {
        submission.baseData.pAPolicyType = policyType;
        submission.baseData.isAddressChangedRecently = false;
        baseDataFields.push({ field: 'Policy Type', key: 'pAPolicyType', value: policyType });
        baseDataFields.push({ field: 'Address Changed Recently', key: 'isAddressChangedRecently', value: false });
    }

    // Set Policy Info answers
    const policyInfoFields = [];
    if (submission.lobData && submission.lobData.personalAuto && submission.lobData.personalAuto.preQualQuestionSets) {
        const policyInfoSet = submission.lobData.personalAuto.preQualQuestionSets.find(s => s.code === 'PA_PolicyInfo_1');
        if (policyInfoSet) {
            const answers = {
                "PA_QSPaperlessDiscount_1": "false",
                "PA_QSMultiPolicyDiscount_1": "false",
                "PA_QSPaidInFullDiscount_1": "false",
                "PA_QSPriorInsurance_1": (customer.currently_insured === 'Yes' ? 'Yes' : 'No'),
                "PA_QSApplicantPrimaryResidence_1": (customer.location_storage?.prim_loc === 'Yes' ? 'OwnHome' : 'Other')
            };
            Object.assign(policyInfoSet.answers, answers);
            policyInfoFields.push({ field: 'Paperless Discount', key: 'PA_QSPaperlessDiscount_1', value: 'false' });
            policyInfoFields.push({ field: 'Multi-Policy Discount', key: 'PA_QSMultiPolicyDiscount_1', value: 'false' });
            policyInfoFields.push({ field: 'Paid In Full Discount', key: 'PA_QSPaidInFullDiscount_1', value: 'false' });
            policyInfoFields.push({ field: 'Prior Insurance', key: 'PA_QSPriorInsurance_1', value: answers.PA_QSPriorInsurance_1 });
            policyInfoFields.push({ field: 'Primary Residence', key: 'PA_QSApplicantPrimaryResidence_1', value: answers.PA_QSApplicantPrimaryResidence_1 });
        }
    }

    // --- Print Summary ---
    console.log('\n   ┌─────────────────────────────────────────────────────────────────┐');
    console.log('   │              POLICY DETAILS - Fields Being Filled              │');
    console.log('   ├──────────────────────────┬───────────────────────┬─────────────┤');
    console.log('   │ Field                    │ AMSuite Key           │ Value       │');
    console.log('   ├──────────────────────────┼───────────────────────┼─────────────┤');
    [...baseDataFields, ...policyInfoFields].forEach(f => {
        const field = f.field.padEnd(24);
        const key = f.key.substring(0, 21).padEnd(21);
        const val = String(f.value).substring(0, 11).padEnd(11);
        console.log(`   │ ${field} │ ${key} │ ${val} │`);
    });
    console.log('   └──────────────────────────┴───────────────────────┴─────────────┘\n');

    const result = await quoteApi.updateDraftSubmission(submission, 'POLICYDETAILS');

    // Check for validation warnings (e.g., Address not deliverable)
    if (result.validationResult &&
        result.validationResult.validationMessages &&
        result.validationResult.validationMessages.warnings &&
        result.validationResult.validationMessages.warnings.length > 0) {

        result.validationResult.validationMessages.warnings.forEach(w => {
            console.warn(`⚠️ [Policy Details Warning] ${w.warningMessage}`);
        });
    }

    return result;
};
