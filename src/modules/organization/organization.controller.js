const organizationService = require('./organization.service');
const { organizationSchema } = require('./organization.validation');
const { getOrganizationId } = require('../../utils/orgId');

const getOrganization = async (req, res, next) => {
    try {
        const organizationId = await getOrganizationId(req);
        const org = await organizationService.getOrganization(organizationId);
        res.status(200).json({
            success: true,
            data: org
        });
    } catch (error) {
        next(error);
    }
};

const updateOrganization = async (req, res, next) => {
    try {
        const { id } = req.params;
        const organizationId = await getOrganizationId(req);

        // Security check: ensure the admin belongs to the organization being updated
        if (id !== organizationId) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to update this organization's settings"
            });
        }

        const validatedData = organizationSchema.parse(req.body);

        const org = await organizationService.updateOrganization(organizationId, validatedData);
        res.status(200).json({
            success: true,
            message: "Organization updated successfully",
            data: org
        });
    } catch (error) {
        next(error);
    }
};

const createOrganization = async (req, res, next) => {
    try {
        const validatedData = organizationSchema.parse(req.body);
        const org = await organizationService.createOrganization(validatedData);
        res.status(201).json({
            success: true,
            message: "Organization created successfully",
            data: org
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getOrganization,
    updateOrganization,
    createOrganization
};
