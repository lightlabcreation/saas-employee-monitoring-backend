const fs = require('fs');
const path = require('path');
const os = require('os');

// Standard Electron AppData path for portable or installed Insightful Agent
const appData = path.join(os.homedir(), 'AppData', 'Roaming');
console.log("Searching AppData directory:", appData);

function findLogFiles(dir, depth = 0) {
    if (depth > 2) return [];
    let results = [];
    try {
        const list = fs.readdirSync(dir);
        list.forEach(file => {
            const fullPath = path.join(dir, file);
            let stat;
            try { stat = fs.statSync(fullPath); } catch (e) { return; }
            if (stat && stat.isDirectory()) {
                if (file.toLowerCase().includes('agent') || file.toLowerCase().includes('ems') || file.toLowerCase().includes('tracker') || file.toLowerCase().includes('insightful')) {
                    results = results.concat(findLogFiles(fullPath, depth + 1));
                }
            } else {
                if (file.endsWith('.log') || file.includes('storage.json')) {
                    results.push(fullPath);
                }
            }
        });
    } catch (e) { }
    return results;
}

const logFiles = findLogFiles(appData);
console.log("\nFOUND LOG/STORAGE FILES:");
logFiles.forEach(file => {
    console.log(`- File: ${file}, Size: ${fs.statSync(file).size} bytes`);
    if (file.endsWith('.log')) {
        console.log(`--- LAST 20 LINES OF ${path.basename(file)} ---`);
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');
        console.log(lines.slice(-20).join('\n'));
    } else if (file.endsWith('.json')) {
        console.log(`--- CONTENT OF ${path.basename(file)} ---`);
        console.log(fs.readFileSync(file, 'utf8'));
    }
});
