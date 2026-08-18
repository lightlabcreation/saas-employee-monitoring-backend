const prisma = require('../../config/db');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { sendMail } = require('../../utils/email.service');
const employeesService = require('../employees/employees.service');

const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

/**
 * Phase 1 - Creates Employee Record & Invitation Details in Database
 */
const createInvitation = async ({ fullName, email, teamId, location, organizationId }) => {
    // 1. Check if employee already exists with this email
    let employee = await prisma.employee.findUnique({ where: { email } });
    
    if (employee) {
        if (employee.status !== 'INVITED' && employee.status !== 'DEACTIVATED') {
            throw new Error('Employee with this email already exists and is active');
        }
        // Update existing invited employee with new details
        employee = await prisma.employee.update({
            where: { id: employee.id },
            data: {
                fullName,
                teamId,
                workMode: location || 'Remote',
                status: 'INVITED',
                deviceOwnership: 'PERSONAL_DEVICE'
            }
        });
    } else {
        // Create new employee record
        employee = await employeesService.inviteEmployee({
            fullName,
            email,
            teamId,
            location,
            computerType: 'PERSONAL',
            deviceOwnership: 'PERSONAL_DEVICE',
            organizationId
        });
    }

    // 2. Generate unique token and expiry date (7 days)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // 3. Store invitation details in database
    // Delete any pending invitations for this employee to clean up
    await prisma.invitation.deleteMany({
        where: { employeeId: employee.id, status: 'PENDING' }
    });

    const invitation = await prisma.invitation.create({
        data: {
            employeeId: employee.id,
            organizationId,
            token,
            expiresAt,
            status: 'PENDING'
        },
        include: {
            employee: true,
            organization: true
        }
    });

    // 4. Send email delivery (Phase 2)
    const orgName = invitation.organization.legalName;
    const activationUrl = `${FRONTEND_URL}/activate?token=${token}`;

    const subject = `Welcome to ${orgName}`;
    const text = [
        `Hello ${fullName},`,
        '',
        `You have been invited to join ${orgName}.`,
        '',
        'Click the link below to download and activate your monitoring agent:',
        activationUrl,
        '',
        'Invitation expires in 7 days.',
    ].join('\n');

    const html = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
            <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 32px; text-align: center; color: white;">
                <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Welcome to ${orgName}</h1>
                <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 14px;">Employee Onboarding &amp; Agent Setup</p>
            </div>
            
            <div style="padding: 32px; background: white;">
                <p style="margin-top: 0; font-size: 16px;">Hello <strong>${fullName}</strong>,</p>
                <p>You have been invited by <strong>${orgName}</strong> to join their team. To track your daily working hours, manage attendance, and generate your monthly **Salary Slips**, you need to install the monitoring agent on your system.</p>
                
                <div style="background: #f8fafc; border-radius: 12px; padding: 20px; border: 1px dashed #cbd5e1; margin: 24px 0; text-align: center;">
                    <h3 style="margin-top: 0; color: #1e293b; font-size: 15px; font-weight: 700;">STEP 1: Activate Your Account</h3>
                    <p style="font-size: 13px; color: #64748b; margin-bottom: 18px;">Click below to set your account password and activate your profile.</p>
                    <a href="${activationUrl}" style="background: #4f46e5; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block; font-size: 13px; box-shadow: 0 4px 6px rgba(79, 70, 229, 0.15);">
                        Set Password &amp; Activate
                    </a>
                </div>

                <div style="background: #f8fafc; border-radius: 12px; padding: 20px; border: 1px dashed #cbd5e1; margin: 24px 0; text-align: center;">
                    <h3 style="margin-top: 0; color: #1e293b; font-size: 15px; font-weight: 700;">STEP 2: Download the Desktop Agent</h3>
                    <p style="font-size: 13px; color: #64748b; margin-bottom: 18px;">Download and run the tracker setup to start tracking your working hours.</p>
                    <a href="${process.env.API_PUBLIC_URL || 'http://localhost:5000'}/agent/EMS-Tracker-latest.exe" style="background: #0f172a; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block; font-size: 13px; box-shadow: 0 4px 6px rgba(15, 23, 42, 0.15);">
                        📥 Download Windows Agent (.exe)
                    </a>
                </div>

                <div style="margin: 24px 0; padding: 16px; background: #e0f2fe; border-radius: 12px; border-left: 4px solid #0284c7;">
                    <p style="margin: 0; font-size: 13px; color: #0369a1; font-weight: 600; line-height: 1.5;">
                        💡 <strong>Salary Slip Info:</strong> The tracker automatically records active work periods, which are compiled monthly to generate your timesheet, payroll adjustments, and payslips. Keep the agent active during work hours to ensure accurate payout calculations.
                    </p>
                </div>

                <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 30px;">
                    Having trouble? Copy and paste the activation URL into your browser:<br/>
                    <a href="${activationUrl}" style="color: #4f46e5;">${activationUrl}</a>
                </p>
            </div>

            <div style="background: #f1f5f9; padding: 20px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
                This invitation link is valid for 7 days. If you did not expect this email, please ignore it.
            </div>
        </div>
    `;

    const mailResult = await sendMail({ to: email, subject, html, text });

    return {
        success: true,
        invitation,
        emailSent: mailResult.sent,
        emailSimulated: mailResult.simulated
    };
};

/**
 * Phase 3 - Backend validates token and expiry
 */
const validateInvitationToken = async (token) => {
    const invitation = await prisma.invitation.findUnique({
        where: { token },
        include: {
            employee: { select: { fullName: true, email: true } },
            organization: { select: { legalName: true } }
        }
    });

    if (!invitation) {
        throw new Error('Invitation link is invalid');
    }

    if (invitation.status === 'ACTIVATED' || invitation.usedAt) {
        throw new Error('This invitation has already been used');
    }

    if (invitation.status === 'EXPIRED' || invitation.expiresAt < new Date()) {
        if (invitation.status === 'PENDING') {
            // Auto-update to EXPIRED in database
            await prisma.invitation.update({
                where: { id: invitation.id },
                data: { status: 'EXPIRED' }
            });
        }
        throw new Error('This invitation has expired');
    }

    return {
        organizationName: invitation.organization.legalName,
        employeeName: invitation.employee.fullName,
        employeeEmail: invitation.employee.email,
        employeeId: invitation.employeeId,
        organizationId: invitation.organizationId
    };
};

/**
 * Phase 3 - Employee sets password on activation page
 */
const activateAccount = async (token, password) => {
    const validData = await validateInvitationToken(token);

    const hashedPassword = await bcrypt.hash(password, 10);

    // Save the hashed password to the Invitation record temporarily
    // It will be applied to create the User record on Agent First Run
    await prisma.invitation.update({
        where: { token },
        data: { password: hashedPassword }
    });

    return {
        success: true,
        message: 'Password saved. You can now download and run the agent to complete activation.',
        ...validData
    };
};

module.exports = {
    createInvitation,
    validateInvitationToken,
    activateAccount
};
