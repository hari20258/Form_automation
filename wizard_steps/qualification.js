/**
 * Handles the "Qualification" step of the Quote Wizard.
 * 
 * @param {Object} quoteApi - The QuoteApi instance (for calling updateDraftSubmission)
 * @param {Object} submission - The current submission object
 * @param {Object} customer - The customer data object (NBOA Structure)
 * @returns {Promise<Object>} - The updated submission object
 */
module.exports = async function saveQualifications(quoteApi, submission, customer) {
    console.log('✅ Updating Qualifications...');

    // Check for violations in vessel or any operator
    const vesselViolations = customer.vessel?.prev_violations;
    const operatorViolations = customer.operators?.some(op => op.prev_violations);
    const hasViolations = (vesselViolations || operatorViolations) ? "true" : "false";

    // Check for claims
    const vesselClaims = customer.vessel?.prev_claims;
    const operatorClaims = customer.operators?.some(op => op.prev_claims);
    const hasClaims = (vesselClaims || operatorClaims) ? "true" : "false";

    if (submission.lobData && submission.lobData.personalAuto && submission.lobData.personalAuto.preQualQuestionSets) {
        const qualSet = submission.lobData.personalAuto.preQualQuestionSets.find(s => s.code === 'PA_Qualification_1');
        if (qualSet) {
            // Validate Mandatory Consents
            const consents = customer.consents || {};
            const missingFields = [];

            const consentMap = {
                "Loss History Report": "loss_history_report", // PA_QSLossHistoryReport_1
                "Credit Report": "credit_report",             // PA_QSCreditReport_12
                "MVR Report": "mvr_report",                   // PA_QSMotorVehicleReport_1
                "Disclaimer": "disclaimer_accepted"           // PA_QSDisclaimerVerification_1
            };

            // Check if fields exist in data
            if (!consents.loss_history_report) missingFields.push("Loss History Report");
            if (!consents.credit_report) missingFields.push("Credit Report");
            if (!consents.mvr_report) missingFields.push("MVR Report");
            if (!consents.disclaimer_accepted) missingFields.push("Disclaimer");

            if (missingFields.length > 0) {
                console.error(`❌ Missing Mandatory Consent Fields: ${missingFields.join(', ')}`);
                throw new Error(`Data Validation Failed: Missing mandatory consents for ${missingFields.join(', ')}. Please add them to 'consents' object in NBOA data.`);
            }

            // --- Validate Mandatory Qualification Answers ---
            // Consents were validated above. Now validating the Q&A part.
            const qualifications = customer.qualifications || {};

            const qaMap = {
                "License Suspended/Revoked": "license_suspended",   // PA_QSLicenseSuspendedRevoked_1
                "Financial Responsibility (FR44)": "fr44_filing",   // PA_QSFR44_1
                "Titled Owner Verification": "titled_owner",        // PA_QSVerifyTitledOwner_1
                "Vehicle for Rent": "vehicle_for_rent",             // PA_QSVehicleForRent_1
                "Vehicle for Sale": "vehicle_for_sale",             // PA_QSVehicleForSaleConsignment_1
                "SR22 Filing": "sr22_filing",                       // PA_QSSR22_1
                "Felony Conviction": "felony_conviction",           // PA_QSFelonyConviction_7
                "Unrepaired Damage": "unrepaired_damage"            // PA_QSUnrepairedDamage_1
            };

            for (const [label, fieldKey] of Object.entries(qaMap)) {
                if (qualifications[fieldKey] === undefined || qualifications[fieldKey] === null) {
                    missingFields.push(label);
                }
            }

            if (missingFields.length > 0) {
                console.error(`❌ Missing Mandatory Qualification Fields: ${missingFields.join(', ')}`);
                throw new Error(`Data Validation Failed: Missing mandatory fields for ${missingFields.join(', ')}. Please add them to 'consents' or 'qualifications' object in NBOA data.`);
            }

            const qualAnswers = {
                "PA_QSLossHistoryReport_1": consents.loss_history_report,
                "PA_QSCreditReport_12": consents.credit_report,
                "PA_QSMotorVehicleReport_1": consents.mvr_report,
                "PA_QSDisclaimerVerification_1": consents.disclaimer_accepted,
                "PA_QSLicenseSuspendedRevoked_1": qualifications.license_suspended,
                "PA_QSFR44_1": qualifications.fr44_filing,
                "PA_QSVerifyTitledOwner_1": qualifications.titled_owner,
                "PA_QSVehicleForRent_1": qualifications.vehicle_for_rent,
                "PA_QSVehicleForSaleConsignment_1": qualifications.vehicle_for_sale,
                "PA_QSSR22_1": qualifications.sr22_filing,
                "PA_QSFelonyConviction_7": qualifications.felony_conviction,
                "PA_QSUnrepairedDamage_1": qualifications.unrepaired_damage
            };
            Object.assign(qualSet.answers, qualAnswers);

            // --- Print Consents & Qualifications ---
            const qualFields = [
                { field: 'Loss History Report', key: 'PA_QSLossHistoryReport_1', value: consents.loss_history_report },
                { field: 'Credit Report', key: 'PA_QSCreditReport_12', value: consents.credit_report },
                { field: 'MVR Report', key: 'PA_QSMotorVehicleReport_1', value: consents.mvr_report },
                { field: 'Disclaimer Accepted', key: 'PA_QSDisclaimerVerific..', value: consents.disclaimer_accepted },
                { field: 'License Suspended', key: 'PA_QSLicenseSuspended..', value: qualifications.license_suspended },
                { field: 'FR44 Filing', key: 'PA_QSFR44_1', value: qualifications.fr44_filing },
                { field: 'Titled Owner', key: 'PA_QSVerifyTitledOwner_1', value: qualifications.titled_owner },
                { field: 'Vehicle for Rent', key: 'PA_QSVehicleForRent_1', value: qualifications.vehicle_for_rent },
                { field: 'Vehicle for Sale', key: 'PA_QSVehicleForSaleCo..', value: qualifications.vehicle_for_sale },
                { field: 'SR22 Filing', key: 'PA_QSSR22_1', value: qualifications.sr22_filing },
                { field: 'Felony Conviction', key: 'PA_QSFelonyConviction_7', value: qualifications.felony_conviction },
                { field: 'Unrepaired Damage', key: 'PA_QSUnrepairedDamage_1', value: qualifications.unrepaired_damage },
            ];
            console.log('\n   ┌─────────────────────────────────────────────────────────────────┐');
            console.log('   │          QUALIFICATIONS - Consents & Q&A Fields                │');
            console.log('   ├──────────────────────────┬───────────────────────┬─────────────┤');
            console.log('   │ Field                    │ AMSuite Key           │ Value       │');
            console.log('   ├──────────────────────────┼───────────────────────┼─────────────┤');
            qualFields.forEach(f => {
                const field = f.field.padEnd(24);
                const key = String(f.key).substring(0, 21).padEnd(21);
                const val = String(f.value).substring(0, 11).padEnd(11);
                console.log(`   │ ${field} │ ${key} │ ${val} │`);
            });
            console.log('   └──────────────────────────┴───────────────────────┴─────────────┘\n');
        }

        const policyInfoSet = submission.lobData.personalAuto.preQualQuestionSets.find(s => s.code === 'PA_PolicyInfo_1');
        if (policyInfoSet) {
            const discounts = customer.policy_discounts || {};
            const missingPolicyFields = [];

            const policyMap = {
                "Multi-Policy Discount": "multi_policy_discount",
                "Paid in Full": "paid_in_full",
                "Paperless Delivery": "paperless_delivery",
                "Applicant Primary Residence": "primary_residence",
                "Prior Insurance (31 Days)": "prior_insurance",
                "Watercraft Losses/Accidents": "watercraft_losses"
            };

            for (const [label, fieldKey] of Object.entries(policyMap)) {
                if (discounts[fieldKey] === undefined || discounts[fieldKey] === null) {
                    missingPolicyFields.push(label);
                }
            }

            if (missingPolicyFields.length > 0) {
                console.error(`❌ Missing Mandatory Policy Discount Fields: ${missingPolicyFields.join(', ')}`);
                throw new Error(`Data Validation Failed: Missing mandatory policy fields for ${missingPolicyFields.join(', ')}. Please add them to 'policy_discounts' object in NBOA data.`);
            }

            const discountAnswers = {
                "PA_QSMultiPolicyDiscount_1": discounts.multi_policy_discount,
                "PA_QSPaidInFullDiscount_1": discounts.paid_in_full,
                "PA_QSPaperlessDiscount_1": discounts.paperless_delivery,
                "PA_QSApplicantPrimaryResidence_1": discounts.primary_residence,
                "PA_QSPriorInsurance_1": discounts.prior_insurance,
                "PA_QSWatercraftLossesAccidents_1": discounts.watercraft_losses
            };
            Object.assign(policyInfoSet.answers, discountAnswers);

            // --- Print Policy Discounts ---
            const discountFields = [
                { field: 'Multi-Policy Discount', key: 'PA_QSMultiPolicyDisc..', value: discounts.multi_policy_discount },
                { field: 'Paid in Full', key: 'PA_QSPaidInFullDisc..', value: discounts.paid_in_full },
                { field: 'Paperless Delivery', key: 'PA_QSPaperlessDiscou..', value: discounts.paperless_delivery },
                { field: 'Primary Residence', key: 'PA_QSApplicantPrimar..', value: discounts.primary_residence },
                { field: 'Prior Insurance', key: 'PA_QSPriorInsurance_1', value: discounts.prior_insurance },
                { field: 'Watercraft Losses', key: 'PA_QSWatercraftLosse..', value: discounts.watercraft_losses },
            ];
            console.log('   ┌─────────────────────────────────────────────────────────────────┐');
            console.log('   │          QUALIFICATIONS - Policy Discount Fields                │');
            console.log('   ├──────────────────────────┬───────────────────────┬─────────────┤');
            console.log('   │ Field                    │ AMSuite Key           │ Value       │');
            console.log('   ├──────────────────────────┼───────────────────────┼─────────────┤');
            discountFields.forEach(f => {
                const field = f.field.padEnd(24);
                const key = String(f.key).substring(0, 21).padEnd(21);
                const val = String(f.value).substring(0, 11).padEnd(11);
                console.log(`   │ ${field} │ ${key} │ ${val} │`);
            });
            console.log('   └──────────────────────────┴───────────────────────┴─────────────┘\n');
        }
    }

    const result = await quoteApi.updateDraftSubmission(submission, 'QUESTION');

    // Check for Blocking Errors (Declinations)
    if (result.validationResult && result.validationResult.shouldBlockPage) {
        if (result.validationResult.validationMessages && result.validationResult.validationMessages.errors && result.validationResult.validationMessages.errors.length > 0) {
            console.error('❌ [Qualification Declined] The submission was blocked by underwriting rules:');
            result.validationResult.validationMessages.errors.forEach(e => {
                console.error(`   - ${e.errorMessage}`);
            });
            throw new Error('Submission Declined by Underwriting Rules.');
        }
    }

    return result;
};
