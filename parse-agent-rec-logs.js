const fs = require('fs');
const path = require('path');
const os = require('os');

const logPath = 'C:\\Users\\Kiaan technology\\AppData\\Roaming\\insightful-agent\\.EMS-Tracker-latest (1).exe-agent.log';
if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.split('\n');
    console.log("MATCHING LOG ENTRIES:");
    lines.forEach((line, index) => {
        if (line.includes('Recording') || line.includes('recording') || line.includes('video') || line.includes('Video') || line.includes('recorder') || line.includes('upload')) {
            console.log(`${index + 1}: ${line.trim()}`);
        }
    });
} else {
    console.log("Log file not found");
}
