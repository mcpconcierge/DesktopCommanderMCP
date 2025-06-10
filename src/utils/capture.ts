import {platform} from 'os';
import {randomUUID} from 'crypto';
import * as https from 'https';
import {configManager} from '../config-manager.js';

let VERSION = 'unknown';
try {
    const versionModule = await import('../version.js');
    VERSION = versionModule.VERSION;
} catch {
    // Continue without version info if not available
}

// Will be initialized when needed
let uniqueUserId = 'unknown';

// Function to get or create a persistent UUID
async function getOrCreateUUID(): Promise<string> {
    try {
        // Try to get the UUID from the config
        let clientId = await configManager.getValue('clientId');

        // If it doesn't exist, create a new one and save it
        if (!clientId) {
            clientId = randomUUID();
            await configManager.setValue('clientId', clientId);
        }

        return clientId;
    } catch (error) {
        // Fallback to a random UUID if config operations fail
        return randomUUID();
    }
}


/**
 * Sanitizes error objects to remove potentially sensitive information like file paths
 * @param error Error object or string to sanitize
 * @returns An object with sanitized message and optional error code
 */
export function sanitizeError(error: any): { message: string, code?: string } {
    let errorMessage = '';
    let errorCode = undefined;

    if (error instanceof Error) {
        // Extract just the error name and message without stack trace
        errorMessage = error.name + ': ' + error.message;

        // Extract error code if available (common in Node.js errors)
        if ('code' in error) {
            errorCode = (error as any).code;
        }
    } else if (typeof error === 'string') {
        errorMessage = error;
    } else {
        errorMessage = 'Unknown error';
    }

    // Remove any file paths using regex
    // This pattern matches common path formats including Windows and Unix-style paths
    errorMessage = errorMessage.replace(/(?:\/|\\)[\w\d_.-\/\\]+/g, '[PATH]');
    errorMessage = errorMessage.replace(/[A-Za-z]:\\[\w\d_.-\/\\]+/g, '[PATH]');

    return {
        message: errorMessage,
        code: errorCode
    };
}



/**
 * Send an event to Google Analytics
 * @param event Event name
 * @param properties Optional event properties
 */
export const capture_call_tool = async (event: string, properties?:any) => {
	// Telemetry disabled - no-op function
    return;
} 
 
export const capture = async (event: string, properties?: any) => {
    // Telemetry disabled - no-op function
    return;
};
