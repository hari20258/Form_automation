const _ = require('lodash');

class PayloadMapper {

    /**
     * Map source data to target schema using configuration.
     * @param {Object} sourceData - The flat or nested source object (Salesforce)
     * @param {Object} template - The target JSON structure (Wizard Payload)
     * @param {Object} mappingConfig - The rules definition
     * @param {Object} runtimeContext - Dynamic values (sessionUUID, quoteID, etc.)
     */
    static map(sourceData, template, mappingConfig, runtimeContext = {}) {
        //Deep clone to avoid mutating the template
        let payload = _.cloneDeep(template);

        // 1. Process Direct Mappings (Global/Root)
        if (mappingConfig.directMappings) {
            for (const [targetPath, sourceRule] of Object.entries(mappingConfig.directMappings)) {
                this.applyRule(payload, sourceData, targetPath, sourceRule, runtimeContext);
            }
        }

        // 2. Process Array/Iterative Mappings
        if (mappingConfig.arrayMappings) {
            for (const arrayRule of mappingConfig.arrayMappings) {
                this.processArrayMapping(payload, sourceData, arrayRule, runtimeContext);
            }
        }

        return payload;
    }

    static processArrayMapping(payload, sourceData, rule, runtimeContext) {
        // rule: { targetParentPath: "addDriverToSubmission.params[0].driver", sourceArrayPath: "operators", itemMapping: { ... } }

        // 1. Get the source array
        const sourceArray = _.get(sourceData, rule.sourceArrayPath) || [];
        if (!Array.isArray(sourceArray) || sourceArray.length === 0) return;

        // 2. Get the template for a single item (often predefined in the JSONC as the 0th element or a specific object)
        // Adjust logic: The 'targetParentPath' might point to a list where we append, 
        // OR it might point to a request object that needs to be duplicated for each item.
        // For Atomic Calls (addDriver), we usually generate a LIST of request payloads, not a list inside a payload.
        // Let's handle the "Atomic Call Generation" pattern specifically if needed, 
        // but for now, let's assume we are populating an array INSIDE the payload (like drivers list in updateDraft).

        const targetArrayPath = rule.targetArrayPath;
        const targetArray = _.get(payload, targetArrayPath);

        if (!Array.isArray(targetArray)) {
            // Special Case: Generating Multiple Atomic Requests? 
            // If strictly inside a JSON payload, target must be array.
            // If we are generating multiple API calls, that's a different layer.
            // For this specific 'updateDraftSubmission' payload, 'drivers' is an array.
            return;
        }

        // Template is usually the first item in the sample payload
        const itemTemplate = _.cloneDeep(targetArray[0]);
        const mappedItems = [];

        sourceArray.forEach((sourceItem, index) => {
            // Apply filter if exists
            if (rule.filter && !rule.filter(sourceItem)) return;

            let newItem = _.cloneDeep(itemTemplate);

            // Apply item-specific mappings
            for (const [targetSubPath, sourceSubPath] of Object.entries(rule.itemMapping)) {
                // Determine value
                let value;

                // Handle complex object/array access in source item
                if (typeof sourceSubPath === 'object' && sourceSubPath.value) {
                    // Hardcoded value
                    value = sourceSubPath.value;
                } else if (sourceSubPath.startsWith('$RUN.')) {
                    // Runtime context for items (rare)
                    value = _.get(runtimeContext, sourceSubPath.replace('$RUN.', ''));
                } else {
                    value = _.get(sourceItem, sourceSubPath);
                }

                // Set value in the new item
                if (value !== undefined) {
                    _.set(newItem, targetSubPath, value);
                }
            }
            mappedItems.push(newItem);
        });

        // Replace the sample array with the mapped array
        _.set(payload, targetArrayPath, mappedItems);
    }

    static applyRule(payload, sourceData, targetPath, rule, runtimeContext) {
        let value = undefined;

        // A. Handle Literal Value
        if (typeof rule === 'object' && rule.type === 'literal') {
            value = rule.value;
        }
        // B. Handle Runtime Injection
        else if (typeof rule === 'string' && rule.startsWith('$RUN.')) {
            const contextKey = rule.replace('$RUN.', '');
            value = _.get(runtimeContext, contextKey);
        }
        // C. Handle Source Extraction
        else if (typeof rule === 'string') {
            value = _.get(sourceData, rule);
        }
        // D. Handle Transformation (Object with 'path' and 'transform')
        else if (typeof rule === 'object' && rule.path) {
            let rawValue = _.get(sourceData, rule.path);
            if (rule.transform) {
                value = this.applyTransform(rawValue, rule.transform);
            } else {
                value = rawValue;
            }
        }

        // Set the value if found (allow null if explicit)
        if (value !== undefined) {
            _.set(payload, targetPath, value);
        }
    }

    static applyTransform(value, transformType) {
        switch (transformType) {
            case 'boolean':
                return String(value).toLowerCase() === 'true' || value === true;
            case 'string':
                return String(value);
            case 'date_yyyy_mm_dd':
                // Implement date parsing logic if needed
                if (!value) return null;
                const d = new Date(value);
                return {
                    year: d.getUTCFullYear(),
                    month: d.getUTCMonth(), // 0-indexed matches schema often
                    day: d.getUTCDate()
                };
            case 'uppercase':
                return String(value).toUpperCase();
            default:
                return value;
        }
    }
}

module.exports = PayloadMapper;
