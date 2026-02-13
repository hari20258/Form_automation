/**
 * Handles the "Vehicles" step of the Quote Wizard.
 * Adds boat and trailer vehicles from NBOA data via addVehicleToSubmission API,
 * then saves the VEHICLE step.
 *
 * @param {Object} quoteApi - The QuoteApi instance
 * @param {Object} submission - The current submission object (from retrieve or driver save)
 * @param {Object} customer - The customer data object (NBOA Structure)
 * @returns {Promise<Object>} - The updated submission object
 */
module.exports = async function saveVehicles(quoteApi, submission, customer) {
    console.log('🚤 Adding Vehicles...');

    const submissionNumber = submission.quoteID || submission.jobNumber ||
        submission.job?.jobNumber;
    if (!submissionNumber) {
        throw new Error('Missing submissionNumber for addVehicleToSubmission');
    }

    // Get sessionUUID from submission if available
    const sessionUUID = submission.sessionUUID || '';

    // Get primary driver reference (for primaryOperator field)
    const drivers = submission.lobData?.personalAuto?.coverables?.drivers || [];
    const primaryDriver = drivers.find(d => d.isPolicyHolder === true || d.person?.accountHolder === true) || drivers[0] || null;

    // Address info (for storage/registration)
    const loc = customer.location_storage || {};
    const address = {
        country: "US",
        addressLine1: loc.loc_address || '',
        city: loc.city || '',
        state: loc.state || '',
        postalCode: loc.zip || '',
        displayName: `${loc.loc_address || ''}, ${loc.city || ''}, ${loc.state || ''} ${loc.zip || ''}`.trim(),
        standardizeStatus: "standardized",
        countyName: ""
    };

    const vessel = customer.vessel || {};
    const engine = customer.engine_trailer || {};
    const hins = customer.hins || {};

    // =========================================================================
    //  1. BOAT VEHICLE
    // =========================================================================
    if (vessel.mfgr_name) {
        // Map hull material → construction code
        const hullMap = { 'Fiberglass': 'F', 'Aluminum': 'A', 'Wood': 'W', 'Steel': 'S', 'Inflatable': 'I', 'Other': 'O' };
        const hullConstruction = hullMap[vessel.hull_material] || vessel.hull_material || 'F';

        // Map propulsion type
        const propulsionMap = { 'Outboard': 'Outboard', 'Inboard': 'Inboard', 'Inboard/Outboard': 'Inboard/Outboard', 'Jet': 'Jet', 'Sail': 'Sail' };
        const engineType = propulsionMap[engine.propulsion_type] || engine.propulsion_type || 'Outboard';

        // Map fuel type
        const fuelMap = { 'Gas': 'Gasoline', 'Gasoline': 'Gasoline', 'Diesel': 'Diesel', 'Electric': 'Electric' };
        const fuelType = fuelMap[engine.fuel_type] || engine.fuel_type || 'Gasoline';

        // Parse purchase date
        let purchaseDate = null;
        if (vessel.purchase_date) {
            const pd = new Date(vessel.purchase_date);
            purchaseDate = { year: pd.getFullYear(), month: pd.getMonth(), day: pd.getDate() };
        }

        // Map storage type from NBOA
        const storageMap = {
            'Trailer': 'LockedGarageBuilding',
            'Indoor': 'LockedGarageBuilding',
            'Outdoor': 'Outdoor_driveway',
            'Marina': 'Marina_Dockside',
            'Dry Stack': 'DryStack'
        };
        const storageType = storageMap[loc.storage_type] || 'LockedGarageBuilding';

        // Build engine details array
        const engineDetails = [];
        if (engine.engine_mfgr) {
            engineDetails.push({
                year: vessel.model_year || '',
                make: engine.engine_mfgr.toUpperCase(),
                model: 'N/A', // Required field, default to N/A if missing
                horsePower: engine.hp_per_engine || engine.hp_total || '0'
            });
        }

        const boatVehicle = {
            tempId: 27,
            costNew: { amount: 0 },
            licenseState: loc.state || 'FL',
            vehicleNumber: 1,
            storageAddress: address,
            registrationAddress: address,
            vinNumberChanged_Ext: false,
            year: vessel.model_year || '',
            make: (vessel.mfgr_name || '').toUpperCase(),
            model: (vessel.model_name || '').toUpperCase(),
            hullId: hins.hin_vessel || '',
            length: parseInt(vessel.length_ft) || 0,
            totalHorsepower: engine.hp_total || '0',
            hullConstruction: hullConstruction,
            engineType: engineType,
            fuelType: fuelType,
            numberOfEngines: engine.num_engines || '1',
            purchasePrice: vessel.purchase_price || '0',
            purchaseDate: purchaseDate,
            weight: '0',
            weightChanged_Ext: true,
            numberOfEnginesChanged_Ext: true,
            vehicleValue: vessel.hull_value || vessel.purchase_price || '0',
            vehicleType: 'boat',
            engineDetails: engineDetails,
            streetUse: false,
            storageType: storageType,
            vehicleQuestionSets: [
                { code: "PA_VehicleDetails_1", answers: { "PA_QSAntiTheftVehicleRecoveryTrackingSystem_1": "false" } },
                { code: "PA_VehicleDetails_3", answers: {} },
                { code: "PA_VehicleDetails_5", answers: {} }
            ],
            primaryUse: 'commuting'
        };

        // Set primary operator if available
        if (primaryDriver) {
            boatVehicle.primaryOperator = primaryDriver;
        }

        // --- Print Boat Summary ---
        const boatFields = [
            { field: 'Type', value: 'Boat' },
            { field: 'Year', value: boatVehicle.year },
            { field: 'Make', value: boatVehicle.make },
            { field: 'Model', value: boatVehicle.model },
            { field: 'Hull ID (HIN)', value: boatVehicle.hullId },
            { field: 'Length', value: `${boatVehicle.length} ft` },
            { field: 'Hull Construction', value: `${vessel.hull_material} → ${hullConstruction}` },
            { field: 'Engine Type', value: engineType },
            { field: 'Fuel Type', value: fuelType },
            { field: 'Num Engines', value: boatVehicle.numberOfEngines },
            { field: 'Total HP', value: boatVehicle.totalHorsepower },
            { field: 'Purchase Price', value: `$${boatVehicle.purchasePrice}` },
            { field: 'Vehicle Value', value: `$${boatVehicle.vehicleValue}` },
            { field: 'Storage Type', value: storageType },
            { field: 'Primary Operator', value: primaryDriver ? `${primaryDriver.person?.firstName} ${primaryDriver.person?.lastName}` : 'N/A' },
        ];
        if (engineDetails.length > 0) {
            boatFields.push({ field: 'Engine Make', value: engineDetails[0].make });
            boatFields.push({ field: 'Engine HP', value: engineDetails[0].horsePower });
            boatFields.push({ field: 'Engine Model', value: engineDetails[0].model });
        }

        console.log('\n   ┌─────────────────────────────────────────────────┐');
        console.log('   │        VEHICLE (BOAT) - Fields Being Sent       │');
        console.log('   ├──────────────────────┬──────────────────────────┤');
        console.log('   │ Field                │ Value                    │');
        console.log('   ├──────────────────────┼──────────────────────────┤');
        boatFields.forEach(f => {
            const field = f.field.padEnd(20);
            const val = String(f.value).substring(0, 24).padEnd(24);
            console.log(`   │ ${field} │ ${val} │`);
        });
        console.log('   └──────────────────────┴──────────────────────────┘\n');

        await quoteApi.addVehicleToSubmission(boatVehicle, submissionNumber, sessionUUID, 'boat', loc.state || 'FL');
    } else {
        console.log('   ℹ️ No vessel data found — skipping boat vehicle.');
    }

    // =========================================================================
    //  2. TRAILER VEHICLE (if trailer data exists)
    // =========================================================================
    if (engine.trailer_mfgr) {
        const trailerVehicle = {
            tempId: 28,
            costNew: { amount: 0 },
            vehicleNumber: 2,
            vehicleType: 'trailer',
            storageAddress: address, // Fixed: Send full address instead of just country
            registrationAddress: address, // Fixed: Send full address
            vehicleAdditionalUsage: false,
            stateAssignedVin: false,
            vin: hins.hin_trailer || hins.hin_vessel || '',
            vinNumberChanged_Ext: true,
            year: engine.trailer_year || '',
            make: (engine.trailer_mfgr || '').toUpperCase(),
            length: 16, // Default if not provided
            model: '',
            totalHorsepower: '0',
            fuelType: 'Gasoline',
            vehicleValue: engine.trailer_value || '0',
            primaryUse: 'commuting',
            horsePowerChanged_Ext: false,
            hullConstructionChanged_Ext: false,
            engineTypeChanged_Ext: false,
            fuelTypeChanged_Ext: false,
            engineSizeChanged_Ext: false
        };

        // --- Print Trailer Summary ---
        const trailerFields = [
            { field: 'Type', value: 'Trailer' },
            { field: 'Year', value: trailerVehicle.year },
            { field: 'Make', value: trailerVehicle.make },
            { field: 'VIN', value: trailerVehicle.vin || '(none)' },
            { field: 'Value', value: `$${trailerVehicle.vehicleValue}` },
        ];

        console.log('\n   ┌─────────────────────────────────────────────────┐');
        console.log('   │      VEHICLE (TRAILER) - Fields Being Sent      │');
        console.log('   ├──────────────────────┬──────────────────────────┤');
        console.log('   │ Field                │ Value                    │');
        console.log('   ├──────────────────────┼──────────────────────────┤');
        trailerFields.forEach(f => {
            const field = f.field.padEnd(20);
            const val = String(f.value).substring(0, 24).padEnd(24);
            console.log(`   │ ${field} │ ${val} │`);
        });
        console.log('   └──────────────────────┴──────────────────────────┘\n');

        await quoteApi.addVehicleToSubmission(trailerVehicle, submissionNumber, sessionUUID, 'boat', loc.state || 'FL');
    } else {
        console.log('   ℹ️ No trailer data found — skipping trailer vehicle.');
    }

    // =========================================================================
    //  3. SAVE the VEHICLE step
    // =========================================================================
    console.log('   💾 Re-retrieving submission and saving VEHICLE step...');
    const postalCode = submission.baseData?.policyAddress?.postalCode ||
        customer.location_storage?.zip || '34471';
    const freshState = await quoteApi.retrieveQuote(submissionNumber, postalCode);
    const result = await quoteApi.updateDraftSubmission(freshState, 'VEHICLE');

    // Check for Blocking Errors
    if (result.validationResult && result.validationResult.shouldBlockPage) {
        if (result.validationResult.validationMessages?.errors?.length > 0) {
            console.error('❌ [Vehicles Declined] Blocked by underwriting rules:');
            result.validationResult.validationMessages.errors.forEach(e => {
                console.error(`   - ${e.errorMessage}`);
            });
            throw new Error('Submission Declined at Vehicles Step.');
        }
    }

    // Log Warnings
    if (result.validationResult?.validationMessages?.warnings) {
        result.validationResult.validationMessages.warnings.forEach(w => {
            console.warn(`⚠️ [Vehicles Warning] ${w.warningMessage}`);
        });
    }

    console.log('✅ Vehicles Saved.');
    return result;
};
