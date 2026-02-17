// Prior Losses & Violations - parses NBOA isheet data

/**
 * Parses a violation/claim string like "3/10/24 - DUI & at fault accident"
 * into a structured object.
 */
function parseViolationString(str) {
    if (!str || typeof str !== 'string') return null;

    const parts = str.split(' - ');
    if (parts.length < 2) return { description: str.trim(), date: null, type: 'Other' };

    const dateStr = parts[0].trim();
    const description = parts.slice(1).join(' - ').trim();

    // Parse date (M/D/YY or MM/DD/YYYY format)
    let parsedDate = null;
    const dateParts = dateStr.split('/');
    if (dateParts.length === 3) {
        let [month, day, year] = dateParts;
        // Handle 2-digit year
        if (year.length === 2) {
            year = parseInt(year) > 50 ? `19${year}` : `20${year}`;
        }
        parsedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    // Classify type
    let type = 'Other';
    const desc = description.toUpperCase();
    if (desc.includes('DUI') || desc.includes('DWI')) type = 'DUI';
    else if (desc.includes('ACCIDENT') || desc.includes('COLLISION')) type = 'Accident';
    else if (desc.includes('THEFT') || desc.includes('STOLEN')) type = 'Theft';
    else if (desc.includes('SPEEDING') || desc.includes('TICKET')) type = 'Violation';

    return { date: parsedDate, type, description };
}

/**
 * Extracts all prior losses, claims, and violations from the NBOA data.
 * Sources:
 *   - vessel.prev_claims / vessel.prev_violations
 *   - operators[].prev_claims / operators[].prev_violations
 *   - policy_discounts.watercraft_losses
 */
function extractPriorLosses(nboaData) {
    const losses = [];

    // Vessel-level violations/claims
    if (nboaData.vessel?.prev_violations) {
        const items = nboaData.vessel.prev_violations.split('\n').filter(s => s.trim());
        items.forEach(item => {
            const parsed = parseViolationString(item);
            if (parsed) losses.push({ source: 'vessel', ...parsed });
        });
    }
    if (nboaData.vessel?.prev_claims) {
        const items = nboaData.vessel.prev_claims.split('\n').filter(s => s.trim());
        items.forEach(item => {
            const parsed = parseViolationString(item);
            if (parsed) losses.push({ source: 'vessel_claim', ...parsed });
        });
    }

    // Operator-level violations/claims
    (nboaData.operators || []).forEach((op, idx) => {
        if (op.prev_violations) {
            const items = op.prev_violations.split('\n').filter(s => s.trim());
            items.forEach(item => {
                const parsed = parseViolationString(item);
                if (parsed) losses.push({ source: `operator_${idx + 1}`, operator: op.name, ...parsed });
            });
        }
        if (op.prev_claims) {
            const items = op.prev_claims.split('\n').filter(s => s.trim());
            items.forEach(item => {
                const parsed = parseViolationString(item);
                if (parsed) losses.push({ source: `operator_${idx + 1}_claim`, operator: op.name, ...parsed });
            });
        }
    });

    return losses;
}

/**
 * Saves prior losses and violations to the submission.
 * 
 * In AMSuite, "prior losses" are typically handled by:
 * 1. The server auto-running CLUE and MVR reports
 * 2. Manual entry of known prior incidents
 * 
 * We parse the NBOA isheet text fields and include them in the
 * submission's priorPolicies and lobData structures.
 */
async function savePriorLosses(quoteApi, submission, nboaData) {
    console.log('\n--- STEP 7b: Prior Losses & Violations ---');

    const losses = extractPriorLosses(nboaData);
    // Force flag to true if we found losses, otherwise trust the JSON or default to false
    const hasWatercraftLosses = losses.length > 0 || nboaData.policy_discounts?.watercraft_losses === 'true';

    // Display parsed losses table
    console.log(`\n   ┌──────────────────────────────────────────────────────────────────┐`);
    console.log(`   │  PRIOR LOSSES & VIOLATIONS                                      │`);
    console.log(`   ├──────────────┬──────────┬──────────────┬─────────────────────────┤`);
    console.log(`   │ Source       │ Date     │ Type         │ Description             │`);
    console.log(`   ├──────────────┼──────────┼──────────────┼─────────────────────────┤`);

    if (losses.length === 0) {
        console.log(`   │ (none)       │          │              │                         │`);
    } else {
        losses.forEach(loss => {
            const src = (loss.operator || loss.source).substring(0, 12).padEnd(12);
            const dt = (loss.date || 'N/A').padEnd(8);
            const tp = (loss.type || '').padEnd(12);
            const desc = (loss.description || '').substring(0, 23).padEnd(23);
            console.log(`   │ ${src} │ ${dt} │ ${tp} │ ${desc} │`);
        });
    }
    console.log(`   └──────────────┴──────────┴──────────────┴─────────────────────────┘`);
    console.log(`   Watercraft losses flag: ${hasWatercraftLosses ? '✅ Yes' : '❌ No'}`);
    console.log(`   Total violations/claims found: ${losses.length}`);

    // Build the prior losses payload for the submission
    // In the HAR, priorPolicies is always [] for this quote,
    // but we still include parsed data in the submission's lobData
    if (losses.length > 0) {
        // Retrieve current state
        const postalCode = submission.baseData?.policyAddress?.postalCode || '34471';
        const quoteID = submission.quoteID || submission.jobNumber;
        const freshState = await quoteApi.retrieveQuote(quoteID, postalCode);

        // Ensure priorPolicies array exists
        if (!freshState.priorPolicies) {
            freshState.priorPolicies = [];
        }

        // Add prior loss information to the submission's LOB data
        const paLine = freshState.lobData?.personalAuto;
        if (paLine) {
            // Set watercraft losses flag
            if (paLine.policyDiscounts) {
                paLine.policyDiscounts.watercraftLosses = hasWatercraftLosses;
            }

            // Add violations as prior loss entries if not already present
            if (!paLine.priorLosses) {
                paLine.priorLosses = [];
            }

            losses.forEach(loss => {
                paLine.priorLosses.push({
                    lossDate: loss.date || null,
                    lossType: loss.type,
                    lossDescription: loss.description,
                    source: loss.source,
                    operatorName: loss.operator || null
                });
            });

            console.log(`   📡 Saving ${losses.length} prior loss records to submission...`);
            try {
                const result = await quoteApi.updateDraftSubmission(freshState, 'DRIVER');
                console.log('   ✅ Prior losses saved successfully.');
                return result;
            } catch (err) {
                console.warn(`   ⚠️ Failed to save prior losses: ${err.message}`);
                console.warn('   Continuing without prior losses (server will use CLUE/MVR data).');
                return submission;
            }
        }
    } else {
        console.log('   ℹ️ No prior losses to submit. Server will auto-fetch CLUE/MVR data.');
    }

    return submission;
}

module.exports = savePriorLosses;
