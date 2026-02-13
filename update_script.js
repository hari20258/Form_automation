const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'direct_api_form_filler.js');
let content = fs.readFileSync(targetPath, 'utf8');

const startMarker = 'if (loginResult.location) {';
const endMarker = '// ---------------------------------------------------------\n                // Gateway Portal JSON-RPC helper';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
    console.error('Could not find markers.');
    console.log('Start found:', startIndex !== -1);
    console.log('End found:', endIndex !== -1);
    process.exit(1);
}

const bridgeCode = `if (loginResult.location) {
                    console.log('\\n--- ⚠️ API Redirect failed previously. Invoking Session Bridge (Playwright) ---');
                    console.log('       Target:', signedUrl);
                    
                    try {
                        // Exec bridge_session.js
                        // Ensure we pass the ORIGINAL signedUrl (which is the PartnerLogin link)
                        const execSync = require('child_process').execSync;
                        const bridgeCmd = \`node bridge_session.js "\${signedUrl}"\`;
                        console.log(\`       Executing: \${bridgeCmd}\`);
                        
                        execSync(bridgeCmd, { stdio: 'inherit' });
                        
                        // Read result
                        if (fs.existsSync('legacy_session.json')) {
                            const bridgeData = JSON.parse(fs.readFileSync('legacy_session.json', 'utf8'));
                            console.log('       ✅ Bridge success! Loaded legacy cookies.');
                            
                            // Append these cookies to our gatewayCookies
                            // bridgeData.cookies is a string "key=val; key2=val2"
                            if (bridgeData.cookies) {
                                const bridgeCookies = bridgeData.cookies.split(';').map(c => c.trim());
                                bridgeCookies.forEach(sc => {
                                     const [nameVal] = sc.split(';'); // just in case
                                     const [name, ...valParts] = nameVal.split('=');
                                     const val = valParts.join('=');
                                     
                                     if (!name) return;

                                     const cookieRegex = new RegExp(\`(^|;\\s*)\${name.trim()}=[^;]*\`);
                                     if (cookieRegex.test(gatewayCookies)) {
                                         gatewayCookies = gatewayCookies.replace(cookieRegex, \`$1\${name.trim()}=\${val}\`);
                                     } else {
                                         gatewayCookies += \`; \${name.trim()}=\${val}\`;
                                     }
                                });
                            }
                            console.log('       Cookies merged. Proceeding to Gateway...');
                        } else {
                             throw new Error('legacy_session.json not found after bridge execution.');
                        }
                        
                    } catch (e) {
                        console.error('       ❌ Session Bridge Failed:', e.message);
                        console.error('       (Make sure you ran: npm install playwright)');
                        process.exit(1);
                    }
                }
                
                `;

const newContent = content.substring(0, startIndex) + bridgeCode + content.substring(endIndex);

fs.writeFileSync(targetPath, newContent, 'utf8');
console.log('Successfully updated direct_api_form_filler.js');
