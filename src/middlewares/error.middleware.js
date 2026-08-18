const { errorResponse } = require('../utils/response');
const logger = require('../utils/logger');

const errorMiddleware = (err, req, res, next) => {
    logger.error(err.message, err.stack);

    // Prisma unique constraint error
    if (err.code === 'P2002') {
        const target = err.meta?.target || '';
        if (target.includes('email')) {
            return errorResponse(res, 'Employee with this email is already invited or exists.', 400);
        }
        return errorResponse(res, `Duplicate field value: ${target}`, 400);
    }

    // Zod validation error
    if (err.name === 'ZodError') {
        const message = err.errors.map(e => {
            const path = e.path.join(': ');
            if (e.code === 'invalid_string' && e.validation === 'email') {
                return `Invalid email format`;
            }
            return `${path}: ${e.message}`;
        }).join(', ');
        return errorResponse(res, message, 400);
    }

    // JWT error
    if (err.name === 'JsonWebTokenError') {
        return errorResponse(res, 'Invalid token. Please log in again!', 401);
    }

    if (err.name === 'TokenExpiredError') {
        return errorResponse(res, 'Your token has expired! Please log in again.', 401);
    }

    // Prisma general error handling (Foreign key failure, validation, etc.)
    if (err.code && err.code.startsWith('P')) {
        // P2003: Foreign key constraint failed
        if (err.code === 'P2003') {
            const target = err.meta?.field_name || err.meta?.target || '';
            let customMessage = 'Invalid relation reference. The selected record does not exist.';
            if (target.includes('teamId')) {
                customMessage = 'Invalid team assignment. The selected team does not exist.';
            } else if (target.includes('employeeId')) {
                customMessage = 'Selected employee does not exist.';
            } else if (target.includes('organizationId')) {
                customMessage = 'Organization does not exist.';
            }
            return errorResponse(res, customMessage, 400);
        }
        
        // P2025: Record to update/delete not found
        if (err.code === 'P2025') {
            return errorResponse(res, 'The requested record could not be found or has been deleted.', 404);
        }

        // Other Prisma error code
        return errorResponse(res, 'A database error occurred while processing your request.', 400);
    }

    // Default error
    const statusCode = err.statusCode || 500;
    let message = err.message || 'Internal Server Error';

    // Mask raw system, syntax, Prisma or TypeError stack traces for production-safe output
    const isSystemError = 
        message.includes('prisma') || 
        message.includes('Prisma') || 
        message.includes('TypeError') || 
        message.includes('ReferenceError') || 
        message.includes('SyntaxError') || 
        message.includes('RangeError') || 
        message.includes('database') ||
        message.includes('SQL') ||
        message.includes('\\') ||
        message.includes('/');

    if (statusCode === 500 && isSystemError) {
        message = 'An unexpected server error occurred. Please try again later.';
    }

    errorResponse(res, message, statusCode);
};

module.exports = errorMiddleware;
