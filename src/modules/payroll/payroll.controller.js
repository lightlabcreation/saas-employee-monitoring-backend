const payrollService = require('./payroll.service');
const { getOrganizationId } = require('../../utils/orgId');
const { successResponse, errorResponse } = require('../../utils/response');

const getPayrollSummary = async (req, res) => {
    try {
        let { userId, teamId, startDate, endDate } = req.query;
        const organizationId = await getOrganizationId(req);

        if (req.user && req.user.role === 'EMPLOYEE') {
            userId = req.user.employeeId || req.user.userId || req.user.id;
        }
        
        const params = { userId, teamId, startDate, endDate };
        const summary = await payrollService.getPayrollSummary(organizationId, params);
        return successResponse(res, summary, 'Payroll summary retrieved successfully');
    } catch (error) {
        console.error('Error fetching payroll summary:', error);
        return errorResponse(res, error.message || 'Internal server error', 500);
    }
};

const getPayrollRecords = async (req, res) => {
    try {
        const organizationId = await getOrganizationId(req);
        let { userId, teamId, startDate, endDate } = req.query;

        if (req.user && req.user.role === 'EMPLOYEE') {
            userId = req.user.employeeId || req.user.userId || req.user.id;
        }
        
        const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
        const end = endDate ? new Date(endDate) : new Date();

        const params = { userId, teamId };
        const records = await payrollService.getPayrollRecords(organizationId, start, end, params);
        return successResponse(res, records, 'Payroll records retrieved successfully');
    } catch (error) {
        console.error('Error fetching payroll records:', error);
        return errorResponse(res, error.message || 'Internal server error', 500);
    }
};

const sendSalarySlip = async (req, res) => {
    try {
        const organizationId = await getOrganizationId(req);
        const { employeeId, startDate, endDate, period, hourlyRate, totalHours, overTime, grossPay, deductions, netPay } = req.body;
        
        if (!employeeId) {
            return errorResponse(res, 'Employee ID is required', 400);
        }

        const employee = await prisma.employee.findFirst({
            where: { id: employeeId, organizationId },
            include: { organization: true }
        });

        if (!employee) {
            return errorResponse(res, 'Employee not found', 404);
        }

        const orgName = employee.organization.legalName;
        const periodLabel = period || `${startDate} to ${endDate}`;

        const subject = `Your Salary Slip for Period ${periodLabel}`;
        
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="background: #0f172a; color: white; padding: 24px; text-align: center;">
                    <h2 style="margin: 0; font-weight: 800;">SALARY SLIP / PAYSLIP</h2>
                    <p style="margin: 4px 0 0 0; opacity: 0.8; font-size: 12px;">${orgName}</p>
                </div>
                <div style="padding: 24px; background: white;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-weight: bold;">Employee Name:</td>
                            <td style="padding: 8px 0; font-weight: bold; text-align: right;">${employee.fullName}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-weight: bold;">Employee Email:</td>
                            <td style="padding: 8px 0; text-align: right;">${employee.email}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-weight: bold;">Pay Period:</td>
                            <td style="padding: 8px 0; text-align: right;">${periodLabel}</td>
                        </tr>
                        <tr style="border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 12px 0; font-weight: bold; color: #0f172a;">Total Hours Worked:</td>
                            <td style="padding: 12px 0; font-weight: bold; text-align: right; color: #0f172a;">${totalHours || 0} Hrs</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b;">Hourly Rate:</td>
                            <td style="padding: 8px 0; text-align: right;">$${hourlyRate || employee.hourlyRate || 0}/Hr</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b;">Gross Earnings:</td>
                            <td style="padding: 8px 0; text-align: right; font-weight: 600;">$${grossPay || 0}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #ef4444;">Deductions (Tax 20%):</td>
                            <td style="padding: 8px 0; text-align: right; color: #ef4444;">-$${deductions || 0}</td>
                        </tr>
                        <tr style="border-top: 2px solid #0f172a; font-size: 16px;">
                            <td style="padding: 12px 0; font-weight: bold; color: #4f46e5;">Net Salary Payout:</td>
                            <td style="padding: 12px 0; font-weight: bold; text-align: right; color: #4f46e5;">$${netPay || 0}</td>
                        </tr>
                    </table>
                </div>
                <div style="background: #f8fafc; padding: 16px; font-size: 11px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0;">
                    Generated automatically by ${orgName} Tracking & Payroll System.
                </div>
            </div>
        `;

        await sendMail({ to: employee.email, subject, html });
        return successResponse(res, null, 'Salary slip emailed successfully');
    } catch (error) {
        console.error('Error sending salary slip:', error);
        return errorResponse(res, error.message || 'Internal server error', 500);
    }
};

module.exports = {
    getPayrollSummary,
    getPayrollRecords,
    sendSalarySlip
};
