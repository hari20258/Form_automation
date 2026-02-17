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
    const sessionUUID = submission.sessionUUID;

    // Use standard retrieval (verified to work and contain 'offerings')
    console.log(`📡 Retrieving Quote State for ${submission.quoteID}...`);
    const quoteState = await quoteApi.retrieveQuote(submission.quoteID, postalCode);

    // Safety check: The domain model uses 'lobData' for retrieval
    const paLine = quoteState.lobData?.personalAuto || quoteState.lobs?.personalAuto;

    if (!paLine) {
        throw new Error('❌ Unexpected Quote State: Missing personalAuto structure.');
    }

    // Inspect Offerings
    if (paLine.offerings) {
        console.log(`   Debug: Found 'offerings' in paLine (${paLine.offerings.length} items).`);
    }

    // --- Helper to select an option by text matching ---
    function selectOption(term, targetText) {
        if (!term.options || term.options.length === 0) return false;

        // Find best match (exact or partial)
        const match = term.options.find(opt => opt.name === targetText) ||
            term.options.find(opt => opt.name.includes(targetText));

        if (match) {
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
    // -------------------------------------------------------------------------
    // DETERMINE SOURCE OF COVERAGES
    // -------------------------------------------------------------------------
    let sourceVehicleCoverages = [];
    let sourceLineCoverages = [];

    // Check offerings first (Custom Quote Flow)
    // Debug: Inspect alternative sources
    if (paLine.vehicleCoverages) console.log(`   Debug: Found 'paLine.vehicleCoverages' (${paLine.vehicleCoverages.length} items).`);
    if (paLine.coverables?.vehicles) console.log(`   Debug: Found 'paLine.coverables.vehicles' (${paLine.coverables.vehicles.length} items).`);

    console.log(`   Debug: paLine keys: ${Object.keys(paLine).join(', ')}`);

    if (paLine.offerings && paLine.offerings.length > 0) {
        const offering = paLine.offerings[0];
        console.log(`   Debug: Offering keys: ${Object.keys(offering).join(', ')}`);
        if (offering.coverages?.lineCoverages?.length > 0) {
            const lineCov = offering.coverages.lineCoverages[0];
            console.log(`   Debug: Line Coverage "${lineCov.name}" terms count: ${lineCov.terms?.length}`);
            if (lineCov.terms?.length > 0) {
                console.log(`   Debug: Line Cov Sample Term: ${JSON.stringify(lineCov.terms[0])}`);
            }
        }
    }

    // Check for terms in coverables
    if (paLine.coverables?.vehicles && paLine.coverables.vehicles.length > 0) {
        const vParams = paLine.coverables.vehicles[0];
        const covs = vParams.coverages || [];
        console.log(`   Debug: 'paLine.coverables.vehicles[0].coverages' count: ${covs.length}`);
        if (covs.length > 0) {
            console.log(`   Debug: coverables sample term count: ${covs[0].terms?.length || 0}`);
            if (covs[0].terms) console.log(`   Debug: coverables sample terms: ${JSON.stringify(covs[0].terms).substring(0, 100)}...`);
        }
    }

    // Check paLine.vehicles directly (sometimes different from coverables)
    if (paLine.vehicles && paLine.vehicles.length > 0) {
        console.log(`   Debug: Found 'paLine.vehicles' (${paLine.vehicles.length} items).`);
        if (paLine.vehicles[0].coverages) {
            const vCovs = paLine.vehicles[0].coverages;
            console.log(`   Debug: 'paLine.vehicles[0].coverages' count: ${vCovs.length}`);
            if (vCovs.length > 0) {
                console.log(`   Debug: paLine.vehicles sample terms: ${JSON.stringify(vCovs[0].terms).substring(0, 100)}...`);
            }
        }
    }

    if (paLine.offerings && paLine.offerings.length > 0 && paLine.offerings[0].coverages) {
        const offeringCovs = paLine.offerings[0].coverages;
        sourceVehicleCoverages = offeringCovs.vehicleCoverages || [];
        sourceLineCoverages = offeringCovs.lineCoverages || [];
    }
    // Fallback to standard locations
    else {
        // Vehicles might be in vehicleCoverages or coverables
        if (paLine.vehicleCoverages) {
            sourceVehicleCoverages = paLine.vehicleCoverages;
        } else if (paLine.coverables && paLine.coverables.vehicles) {
            // If vehicles exist but have no coverages (the issue we faced), this will be empty effective coverage list
            // But we try mapping anyway
            sourceVehicleCoverages = paLine.coverables.vehicles.map(v => ({
                publicID: v.publicID,
                coverages: v.coverages || [], // This was empty before
                // preserve other vehicle props if needed for ID matching
                year: v.year, make: v.make, model: v.model
            }));
        }

        sourceLineCoverages = paLine.lineCoverages || paLine.coverages || [];
    }

    // =========================================================================
    // 3. Construct the Update Quote Object AND Send RPC
    // =========================================================================
    const updateVehicleCoverages = [];
    const updateLineCoverages = [];
    const covConfig = nboaData?.coverage || {};

    // --- Process Vehicle Coverages ---
    sourceVehicleCoverages.forEach(vGroup => {
        // vGroup might be a Vehicle object OR a wrapper {publicID, coverages:[]}
        // In Offering it is { publicID, vehicleName, coverages: [...] }

        const vehicleID = vGroup.publicID;
        const vehicleName = vGroup.vehicleName || `${vGroup.year} ${vGroup.make} ${vGroup.model}` || 'Vehicle';
        const coverages = vGroup.coverages || [];

        if (coverages.length === 0) return;

        // Coverage name → JSON key mapping
        const COVERAGE_MAP = {
            'Hull': 'hull',
            'Haul Out': 'haul_out',
            'Personal Effects': 'personal_effects',
            'Towing and Emergency Expense': 'towing',
            'Trailer Physical Damage': 'trailer_physical_damage'
        };

        // Use covConfig from NBOA JSON

        // Apply selections from JSON data
        coverages.forEach(cov => {

            const jsonKey = COVERAGE_MAP[cov.name];

            // Debug: Inspect terms for the first vehicle coverage to see why we aren't matching
            if (!global.hasLoggedVehicleTerms) {
                console.log(`   🔍 [Debug] Inspecting Coverage Object for "${cov.name}":`);
                console.log(`      FULL OBJECT: ${JSON.stringify(cov, null, 2)}`);
                console.log(`      Type of terms: ${typeof cov.terms}`);
                console.log(`      Is Array: ${Array.isArray(cov.terms)}`);
                console.log(`      Value: ${JSON.stringify(cov.terms, null, 2)}`);

                if (cov.terms && cov.terms.length > 0) {
                    console.log(`      Terms found: ${cov.terms.length}`);
                    cov.terms.forEach(t => {
                        console.log(`      - Term: "${t.name}" (Code: ${t.code})`);
                        if (t.options && t.options.length > 0) {
                            console.log(`        Options: [${t.options.map(o => `"${o.name}"`).join(', ')}]`);
                        } else {
                            console.log(`        Options: NONE (undefined or empty)`);
                        }
                    });
                } else {
                    console.log(`      ⚠️ NO TERMS FOUND in this coverage object (length constraint failed).`);
                }
                global.hasLoggedVehicleTerms = true;
            }

            if (!jsonKey) return; // Not a coverage we configure

            const cfg = covConfig[jsonKey] || {};

            // Set selected (default: true for known coverages if present in config)
            if (cfg.selected !== undefined) {
                cov.selected = cfg.selected;
            } else if (jsonKey) {
                // If the key exists in our map but not in JSON, default to true
                cov.selected = true;
            }

            // Apply term values from JSON config
            if (cfg.deductible) {
                const ded = cov.terms?.find(t => t.name === "Deductible");
                if (ded) {
                    const matched = selectOption(ded, cfg.deductible);
                    if (!matched) console.log(`   ⚠️ ${cov.name} Deductible: no match for "${cfg.deductible}" in [${(ded.options || []).map(o => o.name).join(', ')}]`);
                }
            }
            if (cfg.limit) {
                const limit = cov.terms?.find(t => t.name === "Limit");
                if (limit) {
                    const matched = selectOption(limit, cfg.limit);
                    if (!matched) console.log(`   ⚠️ ${cov.name} Limit: no match for "${cfg.limit}" in [${(limit.options || []).map(o => o.name).join(', ')}]`);
                }
            }
            if (cfg.settlement_option) {
                const sett = cov.terms?.find(t => t.name === "Settlement Option");
                if (sett) {
                    const matched = selectOption(sett, cfg.settlement_option);
                    if (!matched) console.log(`   ⚠️ ${cov.name} Settlement: no match for "${cfg.settlement_option}" in [${(sett.options || []).map(o => o.name).join(', ')}]`);
                }
            }
        });

        // Add to update list
        updateVehicleCoverages.push({
            publicID: vehicleID,
            vehicleName: vehicleName,
            coverages: coverages
        });
    });

    // --- Line Coverage name → JSON key mapping ---
    const LINE_COVERAGE_MAP = {
        'Liability': 'liability',
        'PALiabilityCov': 'liability',
        'Medical Payments': 'medical_payments',
        'Uninsured': 'uninsured_boaters',
        'Accidental Spill Pollution': 'accidental_spill_pollution',
        'Pet Protection': 'pet_protection'
    };

    // covConfig already declared above

    // --- Process Line Coverages ---
    sourceLineCoverages.forEach(cov => {
        // Find matching JSON config by checking name against keys
        let cfg = null;
        for (const [pattern, jsonKey] of Object.entries(LINE_COVERAGE_MAP)) {
            if (cov.name.includes(pattern) || cov.publicID === pattern) {
                cfg = covConfig[jsonKey] || {};
                break;
            }
        }

        if (cfg) {
            // Set selected if specified
            if (cfg.selected !== undefined) {
                cov.selected = cfg.selected;
            }
            // Apply limit from JSON
            if (cfg.limit) {
                const limit = cov.terms?.find(t => t.name === "Limit");
                if (limit) selectOption(limit, cfg.limit);
            }
        }

        updateLineCoverages.push(cov);
    });

    // We need the internal publicID of the quote branch. 
    // Usually it's in quoteState.publicID or nested in quoteData
    const internalPublicID = quoteState.publicID || quoteState.quoteData?.publicID || quoteState.quoteID || submission.quoteID;

    // DEBUG: Rich coverage tables for each vehicle and line coverages
    console.log('\n   ┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('   │                    COVERAGE CONFIGURATION DETAILS                       │');
    console.log('   └─────────────────────────────────────────────────────────────────────────┘');

    updateVehicleCoverages.forEach(vGroup => {
        const covs = vGroup.coverages || [];
        console.log(`\n   ┌─────────────────────────────────────────────────────────────────────────┐`);
        console.log(`   │  Vehicle: ${(vGroup.vehicleName || vGroup.publicID || 'Unknown').padEnd(58)}│`);
        console.log(`   ├──────────────────────────────────┬──────────┬───────────┬──────────────┤`);
        console.log(`   │ Coverage                         │ Selected │ Premium   │ Key Terms    │`);
        console.log(`   ├──────────────────────────────────┼──────────┼───────────┼──────────────┤`);
        covs.forEach(cov => {
            const name = (cov.name || cov.publicID || '?').substring(0, 32).padEnd(32);
            const sel = (cov.selected ? '✅ Yes' : '❌ No').padEnd(8);
            const amt = cov.amount?.amount != null ? `$${cov.amount.amount}`.padEnd(9) : 'N/A'.padEnd(9);
            const terms = (cov.terms || [])
                .filter(t => t.chosenTermValue)
                .map(t => `${t.name}=${t.chosenTermValue}`)
                .join(', ')
                .substring(0, 12);
            console.log(`   │ ${name} │ ${sel} │ ${amt} │ ${terms.padEnd(12)} │`);
        });
        console.log(`   └──────────────────────────────────┴──────────┴───────────┴──────────────┘`);
    });

    // Line coverages table
    console.log(`\n   ┌─────────────────────────────────────────────────────────────────────────┐`);
    console.log(`   │  Line Coverages (Policy-Level)                                          │`);
    console.log(`   ├──────────────────────────────────┬──────────┬───────────┬──────────────┤`);
    console.log(`   │ Coverage                         │ Selected │ Premium   │ Key Terms    │`);
    console.log(`   ├──────────────────────────────────┼──────────┼───────────┼──────────────┤`);
    updateLineCoverages.forEach(cov => {
        const name = (cov.name || cov.publicID || '?').substring(0, 32).padEnd(32);
        const sel = (cov.selected ? '✅ Yes' : '❌ No').padEnd(8);
        const amt = cov.amount?.amount != null ? `$${cov.amount.amount}`.padEnd(9) : 'N/A'.padEnd(9);
        const terms = (cov.terms || [])
            .filter(t => t.chosenTermValue)
            .map(t => `${t.name}=${t.chosenTermValue}`)
            .join(', ')
            .substring(0, 12);
        console.log(`   │ ${name} │ ${sel} │ ${amt} │ ${terms.padEnd(12)} │`);
    });
    console.log(`   └──────────────────────────────────┴──────────┴───────────┴──────────────┘`);

    // Endpoint logging
    console.log('\n   📡 API Endpoints:');
    console.log('      1. POST /gatewayquote/customquote → updateCustomQuoteCoverages');
    console.log('      2. POST /gatewayquote/quote       → retrieveQuote (re-fetch)');
    console.log('      3. POST /gatewayquote/quote       → saveAndQuote (generate premium)');


    const updateQuoteObject = {
        publicID: internalPublicID,
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

    // Send Update
    const quoteID = quoteState.quoteID || submission.quoteID;
    const updateResult = await quoteApi.updateCustomQuoteCoverages(updateQuoteObject, quoteID, sessionUUID);

    if (updateResult) {
        if (updateResult.validationErrors && updateResult.validationErrors.length > 0) {
            console.warn(`   ⚠️ Update returned ${updateResult.validationErrors.length} validation errors:`);
            updateResult.validationErrors.forEach(err => console.warn(`      - ${err.message || JSON.stringify(err)}`));
        }
    }

    console.log('   ✅ Coverages Saved. Re-retrieving clean state for rating...');

    // =========================================================================
    // 5. Re-retrieve clean state for saveAndQuote
    // =========================================================================
    const freshState = await quoteApi.retrieveQuote(quoteID, postalCode);


    // =========================================================================
    // 6. Save & Quote — triggers the rating engine to generate premium
    // =========================================================================
    const finalResult = await quoteApi.saveAndQuote(freshState, 'VEHICLE');

    // Extract and display premium from saveAndQuote response
    const offeredQuotes = finalResult?.quoteData?.offeredQuotes || [];
    if (offeredQuotes.length > 0 && offeredQuotes[0].premium) {
        const premium = offeredQuotes[0].premium;
        console.log(`\n💰 ==================================================`);
        console.log(`💰 ANNUAL PREMIUM: $${premium.total?.amount}`);
        console.log(`💰 MONTHLY PREMIUM: $${premium.monthlyPremium?.amount}`);
        console.log(`💰 ==================================================\n`);
    } else {
        console.warn('   ⚠️ No premium returned from saveAndQuote.');
    }

    console.log('✅ Coverages & Quote Step Complete.');
    return finalResult;
}

module.exports = { saveCoverages };
