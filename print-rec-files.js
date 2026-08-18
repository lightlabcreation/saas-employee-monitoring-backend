const fs = require('fs');
const path = require('path');

const dirPath = 'c:\\Users\\Kiaan technology\\Desktop\\saas-employee-management\\Saasens_bakend\\screenrecording';

function getFilesRecursively(dir) {
    let files = [];
    if (!fs.existsSync(dir)) return files;
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            files = files.concat(getFilesRecursively(fullPath));
        } else {
            files.push({
                path: fullPath,
                size: stat.size,
                mtime: stat.mtime
            });
        }
    });
    return files;
}

const files = getFilesRecursively(dirPath);
console.log(`Found ${files.length} screen recording files inside c:\\Users\\Kiaan technology\\Desktop\\saas-employee-management\\Saasens_bakend\\screenrecording:`);
files.forEach(f => {
    console.log(`- Path: ${f.path}`);
    console.log(`  Size: ${(f.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Created/Modified: ${f.mtime.toString()}`);
});
