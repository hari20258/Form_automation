/**
 * Handles the "Drivers" step of the Quote Wizard.
 * Adds each operator from the NBOA data as a driver via the
 * addDriverToSubmission API, then saves the DRIVER step.
 *
 * @param {Object} quoteApi - The QuoteApi instance
 * @param {Object} submission - The current submission object (from retrieve)
 * @param {Object} customer - The customer data object (NBOA Structure)
 * @returns {Promise<Object>} - The updated submission object
 */
module.exports = async function saveDrivers(quoteApi, submission, customer) {
    console.log('✅ Updating Drivers...');

    const operators = customer.operators || [];
    if (operators.length === 0) {
        console.warn('⚠️ No operators found in customer data. Skipping driver addition.');
        return await quoteApi.updateDraftSubmission(submission, 'DRIVER');
    }

    const submissionNumber = submission.quoteID || submission.jobNumber;
    if (!submissionNumber) {
        throw new Error('Missing submissionNumber for addDriverToSubmission');
    }

    // Marital status mapping
    const maritalMap = { 'Single': 'S', 'Married': 'M', 'Divorced': 'D', 'Widowed': 'W', 'Separated': 'P' };

    // Get the existing persons from the submission (account holder info populated by server)
    const existingPersons = submission.persons || [];

    const addedDrivers = [];

    for (let i = 0; i < operators.length; i++) {
        const op = operators[i];
        const nameParts = (op.name || '').split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        const isPrimary = i === 0 || (op.insured_type || '').toLowerCase().includes('primary');
        const relationship = isPrimary ? 'pni_ext' : 'SP'; // pni_ext = primary named insured, SP = spouse

        // Parse DOB
        const dobDate = op.dob ? new Date(op.dob) : null;
        const dob = dobDate ? {
            year: dobDate.getFullYear(),
            month: dobDate.getMonth(), // 0-indexed (Standard JS)
            day: dobDate.getDate(),
            isMasked: false // Must be false to apply the date, especially for new drivers
        } : { year: 0, month: 0, day: 0, isMasked: false };

        // Map marital status
        const maritalCode = maritalMap[op.marital_status] || op.marital_status || 'S';

        // Try to match with existing person from the submission (by name)
        const existingPerson = existingPersons.find(p =>
            p.firstName?.toLowerCase() === firstName.toLowerCase() &&
            p.lastName?.toLowerCase() === lastName.toLowerCase()
        );

        // Build person object
        const person = existingPerson ? {
            ...existingPerson,
            maritalStatus: maritalCode,
            dateOfBirth: dob,
        } : {
            firstName: firstName,
            lastName: lastName,
            displayName: op.name,
            contactName: op.name,
            subtype: "Person",
            maritalStatus: maritalCode,
            dateOfBirth: dob,
            primaryPhoneType: "mobile",
            cellNumber: customer.applicant?.mobile || customer.applicant?.res_phone || '',
            additionalInsuredType: "person",
            primaryAddress: {
                addressLine1: customer.location_storage?.loc_address || '',
                city: customer.location_storage?.city || '',
                state: customer.location_storage?.state || '',
                postalCode: customer.location_storage?.zip || '',
                country: "US",
                addressType: "home",
                standardizeStatus: "standardized"
            }
        };

        // Build driver question sets
        const yearsExp = op.years_experience || "0";
        const safetyCourse = op.safety_course_date || null;

        const driverQuestionSets = [{
            code: "PA_DriverRoles_1",
            answers: {
                "PA_QSDateCompletedSafetyCourse_1": safetyCourse,
                "PA_QSYearsBoatingExperience_1": yearsExp,
                "PA_QSIneligibleDriver_1": "false"
            }
        }];

        // Build the full driver payload
        const driverPayload = {
            person: person,
            dateOfBirth: dob,
            relationship: relationship,
            accidents: 0,
            violations: 0,
            driverQuestionSets: driverQuestionSets
        };

        // --- Print Driver Summary ---
        const fields = [
            { field: 'Name', key: 'person.displayName', value: op.name },
            { field: 'Relationship', key: 'relationship', value: relationship },
            { field: 'Date of Birth', key: 'person.dateOfBirth', value: `${dob.year}-${dob.month}-${dob.day}` },
            { field: 'Marital Status', key: 'person.maritalStatus', value: `${op.marital_status} → ${maritalCode}` },
            { field: 'Boating Experience', key: 'PA_QSYearsBoatingExp', value: `${yearsExp} yrs` },
            { field: 'Safety Course', key: 'PA_QSDateComplSafety', value: String(safetyCourse || 'N/A') },
            { field: 'Matched Person', key: 'existingPerson', value: existingPerson ? 'Yes' : 'New' },
        ];
        const label = isPrimary ? 'PRIMARY' : `ADDITIONAL #${i}`;
        console.log(`\n   ┌────────────────────────────────────────────────────────────┐`);
        console.log(`   │         DRIVER (${label}) - Fields Being Sent`.padEnd(60) + `│`);
        console.log(`   ├──────────────────────┬────────────────────┬────────────────┤`);
        console.log(`   │ Field                │ Key                │ Value          │`);
        console.log(`   ├──────────────────────┼────────────────────┼────────────────┤`);
        fields.forEach(f => {
            const field = f.field.padEnd(20);
            const key = String(f.key).substring(0, 18).padEnd(18);
            const val = String(f.value).substring(0, 14).padEnd(14);
            console.log(`   │ ${field} │ ${key} │ ${val} │`);
        });
        console.log(`   └──────────────────────┴────────────────────┴────────────────┘`);

        // Call API
        const addedDriver = await quoteApi.addDriverToSubmission(driverPayload, submissionNumber);
        addedDrivers.push(addedDriver);
    }

    console.log(`\n   ✅ Added ${addedDrivers.length} driver(s). Saving DRIVER step...`);

    // Re-retrieve the submission to get the full state with drivers populated
    const postalCode = submission.baseData?.policyAddress?.postalCode ||
        customer.location_storage?.zip || '34471';
    const freshState = await quoteApi.retrieveQuote(submissionNumber, postalCode);

    // Save the DRIVER step
    const result = await quoteApi.updateDraftSubmission(freshState, 'DRIVER');

    // Check for Blocking Errors
    if (result.validationResult && result.validationResult.shouldBlockPage) {
        if (result.validationResult.validationMessages?.errors?.length > 0) {
            console.error('❌ [Drivers Declined] The submission was blocked by underwriting rules:');
            result.validationResult.validationMessages.errors.forEach(e => {
                console.error(`   - ${e.errorMessage}`);
            });
            throw new Error('Submission Declined at Drivers Step.');
        }
    }

    // Log Warnings
    if (result.validationResult?.validationMessages?.warnings) {
        result.validationResult.validationMessages.warnings.forEach(w => {
            console.warn(`⚠️ [Drivers Warning] ${w.warningMessage}`);
        });
    }

    return result;
};
