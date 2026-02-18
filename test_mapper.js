const DataMapper = require('./utility/mapper');
const { ACCOUNT_SCHEMA, VEHICLE_BOAT_SCHEMA, DRIVER_SCHEMA, ENGINE_SCHEMA, TRAILER_SCHEMA } = require('./schemas/salesforce_schemas');
const fs = require('fs');
const path = require('path');

async function testMapping() {
    const sfData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'FromSalesforce.json'), 'utf8'));

    console.log('--- TESTING ACCOUNT MAPPING ---');
    const accountPayload = DataMapper.map(sfData, ACCOUNT_SCHEMA);
    console.log(JSON.stringify(accountPayload, null, 2));

    console.log('\n--- TESTING VEHICLE (BOAT) MAPPING ---');
    const boatPayload = DataMapper.map(sfData, VEHICLE_BOAT_SCHEMA);
    console.log(JSON.stringify(boatPayload, null, 2));

    console.log('\n--- TESTING ENGINE MAPPING ---');
    const enginePayload = DataMapper.map(sfData, ENGINE_SCHEMA);
    console.log(JSON.stringify(enginePayload, null, 2));

    console.log('\n--- TESTING TRAILER MAPPING ---');
    const trailerPayload = DataMapper.map(sfData, TRAILER_SCHEMA);
    console.log(JSON.stringify(trailerPayload, null, 2));

    console.log('\n--- TESTING DRIVER MAPPING ---');
    const driverPayload = DataMapper.map(sfData, DRIVER_SCHEMA);
    console.log(JSON.stringify(driverPayload, null, 2));
}

testMapping().catch(console.error);
