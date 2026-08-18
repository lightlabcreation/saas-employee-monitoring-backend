const nodemailer = require('nodemailer');
const https = require('https');

// ─── Brevo (Sendinblue) transactional email via REST API ───────────────────────
/**
 * Sends mail via Brevo Transactional Email API v3.
 * Uses only the built-in `https` module — no extra SDK required at call time.
 */
function sendBrevoMail({ to, subject, html, text }) {
    return new Promise((resolve, reject) => {
        const apiKey = process.env.BREVO_API_KEY;
        if (!apiKey) {
            return reject(new Error('BREVO_API_KEY is not configured'));
        }

        // Verified sender — as configured in Brevo dashboard
        const senderEmail = process.env.MAIL_FROM_EMAIL || 'lightlabcreation@gmail.com';
        const senderName  = process.env.MAIL_FROM_NAME || 'Kiaan Technology Pvt Ltd';

        const payload = JSON.stringify({
            sender: { name: senderName, email: senderEmail },
            to: [{ email: to }],
            subject: subject,
            ...(html ? { htmlContent: html } : {}),
            ...(text && !html ? { textContent: text } : {})
        });

        const options = {
            hostname: 'api.brevo.com',
            port: 443,
            path: '/v3/smtp/email',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': apiKey,
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ sent: true, provider: 'brevo' });
                } else {
                    reject(new Error(`Brevo API returned status ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(payload);
        req.end();
    });
}

// ─── SMTP fallback via Nodemailer ─────────────────────────────────────────────
/**
 * Sends mail via SMTP (Nodemailer). Used as fallback when Brevo is unavailable.
 */
async function sendSmtpMail({ to, subject, html, text }) {
    if (!process.env.SMTP_HOST) {
        return null;
    }

    const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    const from = process.env.SMTP_FROM || 'Employee Monitoring <noreply@localhost>';
    await transport.sendMail({ from, to, subject, html, text });
    return { sent: true, provider: 'smtp' };
}

// ─── Centralized sendMail ─────────────────────────────────────────────────────
/**
 * Primary entry point used by all services.
 * Priority order:
 *   1. Brevo  (if BREVO_API_KEY is set)
 *   2. SMTP   (if SMTP_HOST is set) — fallback
 *   3. Console log simulation        — last resort
 */
async function sendMail({ to, subject, html, text }) {
    if (process.env.BREVO_API_KEY) {
        try {
            console.log(`[Email] Sending to ${to} via Brevo...`);
            return await sendBrevoMail({ to, subject, html, text });
        } catch (err) {
            console.error('[Email] Brevo delivery failed:', err.message);
            // Fallback to SMTP if configured
            if (process.env.SMTP_HOST) {
                try {
                    console.log(`[Email] Falling back to SMTP for ${to}...`);
                    return await sendSmtpMail({ to, subject, html, text });
                } catch (smtpErr) {
                    console.error('[Email] SMTP fallback failed:', smtpErr.message);
                }
            }
            return logConsoleFallback({ to, subject, html, text }, `Brevo Error: ${err.message}`);
        }
    } else if (process.env.SMTP_HOST) {
        try {
            console.log(`[Email] Sending to ${to} via SMTP...`);
            return await sendSmtpMail({ to, subject, html, text });
        } catch (err) {
            console.error('[Email] SMTP delivery failed:', err.message);
            return logConsoleFallback({ to, subject, html, text }, `SMTP Error: ${err.message}`);
        }
    } else {
        return logConsoleFallback({ to, subject, html, text });
    }
}

// ─── Console fallback logger ──────────────────────────────────────────────────
function logConsoleFallback({ to, subject, html, text }, errorReason = null) {
    console.log('\n========== EMAIL (SIMULATION — no provider configured) ==========');
    

    if (errorReason) {
        console.log(`[REASON] Real delivery failed: ${errorReason}`);
    }
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(text || html);
    console.log('============================================================\n');
    return { sent: false, simulated: true };
}

module.exports = { sendMail };

