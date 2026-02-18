/**
 * DataMapper - Utility to transform JSON data based on a schema mapping.
 */
class DataMapper {
    /**
     * Map a source object to a target structure based on a schema.
     * @param {Object} source - The source data (e.g. Salesforce JSON)
     * @param {Object} schema - The mapping schema
     * @returns {Object} - The transformed data
     */
    static map(source, schema) {
        const target = {};

        for (const [targetPath, rule] of Object.entries(schema)) {
            let value;

            if (typeof rule === 'string') {
                // Rule is a direct path to the source value
                value = this.getValueByPath(source, rule);
            } else if (typeof rule === 'object' && rule.path) {
                // Rule is an object with a path and optional formatter
                value = this.getValueByPath(source, rule.path);
                if (rule.formatter && typeof rule.formatter === 'function') {
                    value = rule.formatter(value, source);
                }
            } else if (typeof rule === 'function') {
                // Rule is a function that takes the source and returns a value
                value = rule(source);
            } else if (rule === null || rule === undefined) {
                // Skip if null or undefined
                continue;
            } else {
                // Direct value (literal)
                value = rule;
            }

            if (value !== undefined) {
                this.setValueByPath(target, targetPath, value);
            }
        }

        return target;
    }

    /**
     * Get a value from a nested object using a dot-notation path.
     * @param {Object} obj 
     * @param {string} path 
     * @returns {*}
     */
    static getValueByPath(obj, path) {
        return path.split('.').reduce((acc, part) => {
            if (acc && typeof acc === 'object') {
                return acc[part];
            }
            return undefined;
        }, obj);
    }

    /**
     * Set a value in a nested object using a dot-notation path (creates objects as needed).
     * @param {Object} obj 
     * @param {string} path 
     * @param {*} value 
     */
    static setValueByPath(obj, path, value) {
        const parts = path.split('.');
        let current = obj;

        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!current[part] || typeof current[part] !== 'object') {
                current[part] = {};
            }
            current = current[part];
        }

        current[parts[parts.length - 1]] = value;
    }
}

module.exports = DataMapper;
