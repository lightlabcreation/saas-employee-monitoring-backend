const fs = require('fs');
const content = fs.readFileSync('c:/Users/Kiaan technology/Desktop/saas-employee-management/saas_ems_eng/index.html', 'utf8');

const tags = [];
const regex = /<\/?([a-zA-Z0-9:-]+)(?:\s+[^>]*)?>/g;
let match;
while ((match = regex.exec(content)) !== null) {
    const tagName = match[1].toLowerCase();
    const isClosing = match[0].startsWith('</');
    tags.push({ tagName, isClosing, line: content.slice(0, match.index).split('\n').length });
}

console.log('--- Tag Open/Close Hierarchy Analysis ---');
const stack = [];
tags.forEach(t => {
    if (t.tagName === 'img' || t.tagName === 'br' || t.tagName === 'hr' || t.tagName === 'input' || t.tagName === 'link' || t.tagName === 'meta' || t.tagName === 'circle' || t.tagName === 'path' || t.tagName === 'svg') {
        return;
    }
    if (!t.isClosing) {
        stack.push(t);
    } else {
        const top = stack.pop();
        if (!top) {
            console.warn(`[Mismatch] Extra closing tag </${t.tagName}> at line ${t.line}`);
        } else if (top.tagName !== t.tagName) {
            console.warn(`[Mismatch] Expected </${top.tagName}> (opened at line ${top.line}), but found </${t.tagName}> at line ${t.line}`);
            stack.push(top);
        }
    }
});

stack.forEach(t => {
    console.warn(`[Unclosed] Tag <${t.tagName}> opened at line ${t.line} was never closed.`);
});
console.log('Validation complete.');
