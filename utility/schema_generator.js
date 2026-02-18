const fs = require('fs');
const path = require('path');

// Simple JSONC parser (strips comments)
// Robust JSONC parser
function parseJsonc(content) {
    // 1. Strip comments
    let jsonContent = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    // 2. Escape bad control characters (newlines in strings that aren't escaped)
    // This is a bit hacky but helps with copy-pasted JSONs
    jsonContent = jsonContent.replace(/\n/g, ' ');

    // 3. Try parsing
    try {
        return JSON.parse(jsonContent);
    } catch (e) {
        // Fallback: If strict JSON parse fails, try to sanitize more aggressively
        console.warn('Standard parse failed, attempting aggressive sanitization...');
        jsonContent = jsonContent
            .replace(/[\u0000-\u0019]+/g, "") // Remove control chars
            .replace(/\\/g, "\\\\"); // Double escape backslashes? No, that might break valid escapes.

        // Let's rely on the first strip being usually enough for JSONC, 
        // but for "Bad control character", it's usually unescaped newlines in strings.
        // The specific error is usually newlines.

        return JSON.parse(jsonContent);
    }
}

function generateSchema(obj, prefix = '', schema = []) {
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const val = obj[key];
            const newKey = prefix ? `${prefix}.${key}` : key;
            const type = Array.isArray(val) ? 'array' : typeof val;

            if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
                generateSchema(val, newKey, schema);
            } else if (Array.isArray(val)) {
                schema.push({ path: newKey + '[]', type: 'array', example: 'List' });
                if (val.length > 0 && typeof val[0] === 'object') {
                    // Recurse into first item of array to get structure
                    generateSchema(val[0], newKey + '[]', schema);
                }
            } else {
                schema.push({ path: newKey, type: type, example: String(val).substring(0, 50) });
            }
        }
    }
    return schema;
}

function main() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.error('Usage: node schema_generator.js <input_file> <output_file>');
        process.exit(1);
    }

    const inputFile = args[0];
    const outputFile = args[1];

    try {
        const content = fs.readFileSync(inputFile, 'utf8');
        let data;
        if (inputFile.endsWith('.jsonc')) {
            data = parseJsonc(content);
        } else {
            data = JSON.parse(content);
        }

        const schema = generateSchema(data);

        // Output as a clean list of paths for easy copy-pasting into mapping
        const output = {
            sourceFile: inputFile,
            paths: schema.map(s => s.path)
        };

        fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
        console.log(`✅ Schema generated at: ${outputFile}`);
        console.log(`   Found ${schema.length} paths.`);

    } catch (e) {
        console.error('❌ Error:', e.message);
        process.exit(1);
    }
}

main();
