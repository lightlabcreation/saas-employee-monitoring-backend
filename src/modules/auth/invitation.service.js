const prisma = require('../../config/db');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { sendMail } = require('../../utils/email.service');

const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
const API_PUBLIC_URL = (process.env.API_PUBLIC_URL || process.env.API_URL || 'http://localhost:5000').replace(/\/$/, '');

const createInvitationToken = async (email, role, organizationId) => {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await prisma.invitationToken.create({
        data: {
            email,
            role,
            organizationId,
            token,
            expiresAt,
        },
    });

    return { invitation, token, expiresAt };
};

const sendInvitation = async (email, role, organizationId, fullName) => {
    const { token } = await createInvitationToken(email, role, organizationId);

    if (role === 'ADMIN' || role === 'MANAGER') {
        await prisma.user.upsert({
            where: { email },
            update: { name: fullName, role },
            create: {
                email,
                name: fullName,
                role,
                password: await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10),
            },
        });
    }

    const setupLink = `${FRONTEND_URL}/setup-password?token=${token}`;
    return { setupLink };
};

/**
 * Personal computer invite: email with agent setup + download links.
 */
const sendEmployeeAgentInvitation = async ({ email, fullName, organizationId, workMode }) => {
    const { token } = await createInvitationToken(email, 'EMPLOYEE', organizationId);

    const agentSetupLink = `${FRONTEND_URL}/setup-agent?token=${token}`;
    const agentDownloadLink = `${API_PUBLIC_URL}/api/agent/download`;
    const deepLink = `ems-tracker://setup?token=${token}`;

    const subject = 'Install your Employee Monitoring Agent';
    const text = [
        `Hello ${fullName},`,
        '',
        'Your organization invited you to install the monitoring agent on your personal computer.',
        '',
        `1. Open this link to get started: ${agentSetupLink}`,
        `2. Download the agent, then install and open it.`,
        `3. Use this email address: ${email}`,
        '4. Choose your password and allow tracking permissions.',
        '',
        `Direct download: ${agentDownloadLink}`,
        '',
        'This link expires in 7 days.',
    ].join('\n');

    const html = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
            <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 32px; text-align: center; color: white;">
                <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Welcome to the Team</h1>
                <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 14px;">Employee Onboarding &amp; Agent Setup</p>
            </div>
            
            <div style="padding: 32px; background: white;">
                <p style="margin-top: 0; font-size: 16px;">Hello <strong>${fullName}</strong>,</p>
                <p>You have been invited to join the team and install the monitoring agent on your <strong>personal computer</strong> (${workMode || 'Remote'}). This agent automatically tracks your daily working hours, manages attendance, and helps compile accurate data to generate your monthly **Salary Slips**.</p>
                
                <div style="background: #f8fafc; border-radius: 12px; padding: 20px; border: 1px dashed #cbd5e1; margin: 24px 0; text-align: center;">
                    <h3 style="margin-top: 0; color: #1e293b; font-size: 15px; font-weight: 700;">STEP 1: Register &amp; Setup Password</h3>
                    <p style="font-size: 13px; color: #64748b; margin-bottom: 18px;">Click below to set up your password and complete onboarding registration.</p>
                    <a href="${agentSetupLink}" style="background: #4f46e5; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block; font-size: 13px; box-shadow: 0 4px 6px rgba(79, 70, 229, 0.15);">
                        Setup Password &amp; Register
                    </a>
                </div>

                <div style="background: #f8fafc; border-radius: 12px; padding: 20px; border: 1px dashed #cbd5e1; margin: 24px 0; text-align: center;">
                    <h3 style="margin-top: 0; color: #1e293b; font-size: 15px; font-weight: 700;">STEP 2: Download the Desktop Agent</h3>
                    <p style="font-size: 13px; color: #64748b; margin-bottom: 18px;">Download and run the tracker setup to start tracking your working hours.</p>
                    <a href="${agentDownloadLink}" style="background: #0f172a; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block; font-size: 13px; box-shadow: 0 4px 6px rgba(15, 23, 42, 0.15);">
                        📥 Download Windows Agent (.exe)
                    </a>
                </div>

                <div style="margin: 24px 0; padding: 16px; background: #e0f2fe; border-radius: 12px; border-left: 4px solid #0284c7;">
                    <p style="margin: 0; font-size: 13px; color: #0369a1; font-weight: 600; line-height: 1.5;">
                        💡 <strong>Salary Slip Info:</strong> The tracker automatically records active work periods, which are compiled monthly to generate your timesheet, payroll adjustments, and payslips. Keep the agent active during work hours to ensure accurate payout calculations.
                    </p>
                </div>

                <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 30px;">
                    Having trouble? Copy and paste the setup URL into your browser:<br/>
                    <a href="${agentSetupLink}" style="color: #4f46e5;">${agentSetupLink}</a>
                </p>
            </div>

            <div style="background: #f1f5f9; padding: 20px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
                This invitation link is valid for a limited period. If you did not expect this email, please ignore it.
            </div>
        </div>
    `;

    const mailResult = await sendMail({ to: email, subject, html, text });

    return {
        setupLink: agentSetupLink,
        agentDownloadLink,
        deepLink,
        emailSent: mailResult.sent,
        emailSimulated: mailResult.simulated,
    };
};

const getInvitationByToken = async (token) => {
    const invitation = await prisma.invitationToken.findUnique({ where: { token } });
    if (!invitation || invitation.expiresAt < new Date()) {
        return null;
    }

    const employee = await prisma.employee.findUnique({
        where: { email: invitation.email },
        include: { team: { select: { name: true } } },
    });

    return { invitation, employee };
};

const completeInvitation = async (token, password) => {
    const invitation = await prisma.invitationToken.findUnique({
        where: { token },
    });

    if (!invitation || invitation.expiresAt < new Date()) {
        throw new Error('Invalid or expired invitation token');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let result;
    if (invitation.role === 'EMPLOYEE') {
        result = await prisma.employee.update({
            where: { email: invitation.email },
            data: {
                status: 'ACTIVE',
                user: {
                    upsert: {
                        create: {
                            email: invitation.email,
                            password: hashedPassword,
                            role: invitation.role,
                        },
                        update: {
                            password: hashedPassword,
                            role: invitation.role,
                        },
                    },
                },
            },
        });
    } else {
        result = await prisma.user.update({
            where: { email: invitation.email },
            data: {
                password: hashedPassword,
                role: invitation.role,
            },
        });
    }

    await prisma.invitationToken.delete({ where: { id: invitation.id } });
    return result;
};

const consumeInvitationForAgent = async (token, email) => {
    const data = await getInvitationByToken(token);
    if (!data) {
        throw new Error('Invalid or expired invitation link');
    }
    if (data.invitation.email.toLowerCase() !== email.toLowerCase()) {
        throw new Error('Email must match the invited address');
    }
    await prisma.invitationToken.delete({ where: { id: data.invitation.id } });
    return data.employee;
};

module.exports = {
    sendInvitation,
    sendEmployeeAgentInvitation,
    getInvitationByToken,
    completeInvitation,
    consumeInvitationForAgent,
};
