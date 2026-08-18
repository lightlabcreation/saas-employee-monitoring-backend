const invitationsService = require('./invitations.service');
const { successResponse, errorResponse } = require('../../utils/response');
const { getOrganizationId } = require('../../utils/orgId');
const { z } = require('zod');

// Schema validation for sending invitations
const inviteSchema = z.object({
    fullName: z.string().min(2, 'Full Name is required'),
    email: z.string().email('Invalid email address'),
    teamId: z.string().uuid('Invalid Team ID'),
    location: z.string().optional().default('Remote')
});

const inviteEmployee = async (req, res, next) => {
    try {
        const organizationId = await getOrganizationId(req);
        
        // Validate request body
        const validated = inviteSchema.parse(req.body);

        const result = await invitationsService.createInvitation({
            fullName: validated.fullName,
            email: validated.email.toLowerCase(),
            teamId: validated.teamId,
            location: validated.location,
            organizationId
        });

        return res.status(201).json({
            success: true,
            message: result.emailSimulated 
                ? 'Invitation generated — check console for link (SMTP/SendGrid not configured)'
                : 'Invitation sent successfully',
            setupLink: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/activate?token=${result.invitation.token}`,
            emailSimulated: result.emailSimulated,
            data: result.invitation.employee
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return errorResponse(res, error.errors[0].message, 400);
        }
        return errorResponse(res, error.message, 400);
    }
};

const validateToken = async (req, res, next) => {
    try {
        const { token } = req.params;
        if (!token) {
            return errorResponse(res, 'Token is required', 400);
        }

        const data = await invitationsService.validateInvitationToken(token);
        
        const API_PUBLIC_URL = (process.env.API_PUBLIC_URL || process.env.API_URL || 'http://localhost:5000').replace(/\/$/, '');

        return successResponse(res, {
            ...data,
            agentDownloadUrl: `${API_PUBLIC_URL}/api/agent/download`,
            deepLink: `ems-tracker://setup?token=${token}`
        });
    } catch (error) {
        return errorResponse(res, error.message, 400);
    }
};

const activateEmployee = async (req, res, next) => {
    try {
        const { token, password } = req.body;
        if (!token || !password) {
            return errorResponse(res, 'Token and password are required', 400);
        }

        if (password.length < 6) {
            return errorResponse(res, 'Password must be at least 6 characters', 400);
        }

        const result = await invitationsService.activateAccount(token, password);
        return successResponse(res, result, 'Account activated successfully');
    } catch (error) {
        return errorResponse(res, error.message, 400);
    }
};

module.exports = {
    inviteEmployee,
    validateToken,
    activateEmployee
};
