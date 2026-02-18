/**
 * Salesforce to AMSuite Mapping Schemas
 */

const formatters = {
    dateToObj: (val) => {
        if (!val) return null;
        const d = new Date(val);
        return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
    },
    parseAddress: (val, source) => {
        // Salesforce often has components or a billing_address string
        if (source.leadDetails?.street) {
            return {
                addressLine1: source.leadDetails.street,
                city: source.leadDetails.city,
                state: source.leadDetails.state,
                postalCode: source.leadDetails.postalcode,
                country: source.leadDetails.country || "US"
            };
        }
        // Fallback or Opportunity logic can be added here
        return null;
    },
    booleanString: (val) => val === 'Yes' || val === true ? 'true' : 'false',
    hullMaterialCode: (val) => {
        const map = { 'Fiberglass': 'F', 'Aluminum': 'A', 'Wood': 'W', 'Steel': 'S', 'Inflatable': 'I', 'Other': 'O' };
        return map[val] || 'F';
    },
    splitFirstName: (val) => val ? val.split(' ')[0] : '',
    splitLastName: (val) => val ? val.split(' ').slice(1).join(' ') : ''
};

const ACCOUNT_SCHEMA = {
    "first_name": "leadDetails.firstname",
    "last_name": "leadDetails.lastname",
    "dob": "leadDetails.date_of_birth__c",
    "phone": "leadDetails.phone",
    "address.address_line_1": "leadDetails.street",
    "address.city": "leadDetails.city",
    "address.state": "leadDetails.state",
    "address.zip": "leadDetails.postalcode",
    "currently_insured": "opportunityDetails.currentPolicy.currently_insured__c"
};

const VEHICLE_BOAT_SCHEMA = {
    "year": "opportunityDetails.watercraft.model_year__c",
    "make": { path: "opportunityDetails.watercraft.manufactuer_name", formatter: (v) => (v || '').toUpperCase() },
    "model": { path: "opportunityDetails.watercraft.model_name", formatter: (v) => (v || '').toUpperCase() },
    "hullId": "opportunityDetails.hin_vessel__c",
    "length": { path: "opportunityDetails.watercraft.length_ft__c", formatter: (v) => parseInt(v) || 0 },
    "totalHorsepower": { path: "opportunityDetails.propulsion.propulsion_hp_total__c", formatter: (v) => String(v || '0') },
    "hullConstruction": { path: "opportunityDetails.watercraft.hull_material__c", formatter: formatters.hullMaterialCode },
    "vehicleValue": "opportunityDetails.watercraft.current_hull_value__c",
    "purchasePrice": "opportunityDetails.watercraft.purchase_price__c",
    "purchaseDate": { path: "opportunityDetails.watercraft.purchase_date__c", formatter: formatters.dateToObj },
    "speed": "opportunityDetails.watercraft.speed__c",
    "primaryUse": "opportunityDetails.watercraft.watercraft_use__c",
    "storageAddress.addressLine1": "opportunityDetails.storageLocation.storage_marina__c", // "Residence" usually
    "storageAddress.city": "opportunityDetails.storageLocation.storage_city__c",
    "storageAddress.state": "opportunityDetails.storageLocation.storage_state__c",
    "storageAddress.postalCode": "opportunityDetails.storageLocation.storage_zip_code__c"
};

const DRIVER_SCHEMA = {
    "person.firstName": { path: "opportunityDetails.operators.operator_1_name__c", formatter: formatters.splitFirstName },
    "person.lastName": { path: "opportunityDetails.operators.operator_1_name__c", formatter: formatters.splitLastName },
    "person.dateOfBirth": { path: "opportunityDetails.operators.operator_1_dob__c", formatter: formatters.dateToObj },
    "person.maritalStatus": "opportunityDetails.operators.operator_1_marital_status__c",
    "person.licenseNumber": {
        path: "opportunityDetails.operators.operator_1_dl__c",
        formatter: (v) => v ? v.split('-')[0].trim() : ""
    },
    "person.licenseState": {
        path: "opportunityDetails.operators.operator_1_dl__c",
        formatter: (v) => v ? v.split('-')[1].trim() : "FL"
    },
    "experienceYears": "opportunityDetails.operators.operator_1_yrs_of_exp__c"
};

const ENGINE_SCHEMA = {
    "propulsion_type": "opportunityDetails.propulsion.propulsion_type__c",
    "fuel_type": "opportunityDetails.propulsion.propulsion_fuel_type__c",
    "hp_total": "opportunityDetails.propulsion.propulsion_hp_total__c",
    "num_engines": "opportunityDetails.propulsion.propulsion_num_engines__c",
    "engine_mfgr": "opportunityDetails.propulsion.propulsion_manufacturer_name",
    "engine_year": "opportunityDetails.propulsion.propulsion_year__c",
    "engine_model": "opportunityDetails.propulsion.propulsion_model__c" // Assuming path
};

const TRAILER_SCHEMA = {
    "trailer_mfgr": "opportunityDetails.trailerAndTender.trailer_manufacturer_name",
    "trailer_year": "opportunityDetails.trailerAndTender.trailer_model_year__c",
    "trailer_value": "opportunityDetails.trailerAndTender.trailer_price__c",
    "trailer_model": "opportunityDetails.trailerAndTender.trailer_model__c" // Assuming path
};

module.exports = {
    ACCOUNT_SCHEMA,
    VEHICLE_BOAT_SCHEMA,
    DRIVER_SCHEMA,
    ENGINE_SCHEMA,
    TRAILER_SCHEMA,
    formatters
};