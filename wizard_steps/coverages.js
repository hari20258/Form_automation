const quoteApi = require('../quote_api');
const apiClient = require('../api_client');

async function saveCoverages(submission, nboaData) {
    if (!submission || !submission.quoteID) {
        throw new Error('❌ Cannot save Coverages: Missing submission ID.');
    }

    console.log('\n--- STEP 8: Coverages & Quote ---');
    console.log(`🛡️ Configuring Coverages for Quote ${submission.quoteID}...`);

    // 1. Retrieve the FULL current quote state
    const postalCode = submission.baseData?.policyAddress?.postalCode ||
        nboaData?.location_storage?.zip || '34471';

    let quoteState = await quoteApi.retrieveQuote(submission.quoteID, postalCode);

    // Safety check: The domain model uses 'lobData' for retrieval
    const paLine = quoteState.lobData?.personalAuto || quoteState.lobs?.personalAuto;

    if (!paLine) {
        throw new Error('❌ Unexpected Quote State: Missing personalAuto structure.');
    }

    // --- Helper to select an option by text matching ---
    function selectOption(term, targetText) {
        if (!term.options || term.options.length === 0) return false;

        // Find best match (exact or partial)
        const match = term.options.find(opt => opt.name === targetText) ||
            term.options.find(opt => opt.name.includes(targetText));

        if (match) {
            console.log(`      🔹 Setting ${term.name}: ${match.name}`);
            term.chosenTerm = match.code;
            term.chosenTermValue = match.name;
            term.updated = true;
            return true;
        }
        return false;
    }

    // =========================================================================
    // 2. Transform Internal Structure to Update Structure
    // =========================================================================
    // The Update RPC expects a flat 'lobs' structure with specific coverage arrays
    const updateVehicleCoverages = [];
    const updateLineCoverages = [];

    // Map Vehicles from coverables to vehicleCoverages DTO
    const vehicles = paLine.coverables?.vehicles || [];
    console.log(`   🚤 Found ${vehicles.length} vehicles in state.`);

    vehicles.forEach(v => {
        if (!v.coverages) return;

        console.log(`      Configuring coverages for vehicle: ${v.year} ${v.make} ${v.model} (${v.publicID})`);

        // Apply Defaults to this vehicle's coverages
        v.coverages.forEach(cov => {
            if (cov.name === "Hull") {
                const ded = cov.terms?.find(t => t.name === "Deductible");
                if (ded) selectOption(ded, "500");

                const sett = cov.terms?.find(t => t.name === "Settlement Option");
                if (sett) selectOption(sett, "Agreed Value");
            }

            if (cov.name === "Trailer Physical Damage") {
                const ded = cov.terms?.find(t => t.name === "Deductible");
                if (ded) selectOption(ded, "250");

                const sett = cov.terms?.find(t => t.name === "Settlement Option");
                if (sett) selectOption(sett, "Agreed Value");
            }
        });

        // Add to update list
        updateVehicleCoverages.push({
            publicID: v.publicID,
            coverages: v.coverages
        });
    });

    // Match potential line-level coverages (Liability, etc.)
    // Note: In some versions, Liability might be at the vehicle level or line level
    const lineCoveragesSource = paLine.lineCoverages || paLine.coverages || [];
    lineCoveragesSource.forEach(cov => {
        if (cov.name.includes("Liability") || cov.publicID === "PALiabilityCov") {
            const limit = cov.terms?.find(t => t.name === "Limit");
            if (limit) selectOption(limit, "100,000");
        }
        updateLineCoverages.push(cov);
    });

    // =========================================================================
    // 3. Construct the Update Quote Object
    // =========================================================================
    const updateQuoteObject = {
        publicID: quoteState.quoteID || submission.quoteID,
        branchName: "CUSTOM",
        branchCode: "CUSTOM",
        isCustom: true,
        lobs: {
            personalAuto: {
                vehicleCoverages: updateVehicleCoverages,
                lineCoverages: updateLineCoverages
            }
        },
        sessionUUID: quoteState.sessionUUID || submission.sessionUUID
    };

    // =========================================================================
    // 4. Send Update RPC
    // =========================================================================
    const updateResult = await quoteApi.updateCustomQuoteCoverages(updateQuoteObject);

    console.log('   ✅ Coverages Updated. Finalizing Step...');

    // =========================================================================
    // 5. Save Step
    // =========================================================================
    const finalResult = await quoteApi.updateDraftSubmission(updateResult || quoteState, 'QUOTE');

    if (finalResult.premium && finalResult.premium.total) {
        console.log(`   💰 Final Premium: $${finalResult.premium.total.amount}`);
    }

    console.log('✅ Coverages & Quote Step Complete.');
    return finalResult;
}

module.exports = { saveCoverages };
