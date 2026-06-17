import fetch from 'node-fetch';
import { normalisePhone, isValidPhone } from '../utils/formatter.js';
/**
 * Download a vCard from a Twilio MediaUrl and extract all valid phone numbers.
 */
export async function parseVCardFromUrl(mediaUrl) {
    try {
        // Note: Twilio Sandbox media URLs are generally publicly accessible.
        // If auth is required, we would pass Authorization: Basic using TWILIO_ACCOUNT_SID:TWILIO_AUTH_TOKEN
        const authString = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
        const response = await fetch(mediaUrl, {
            headers: {
                Authorization: `Basic ${authString}`
            }
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch vCard: ${response.statusText}`);
        }
        const vcardText = await response.text();
        return extractNumbersFromVCard(vcardText);
    }
    catch (error) {
        console.error('[vCard] Error parsing vcard URL:', error);
        return [];
    }
}
/**
 * Extract phone numbers from vCard text content.
 * e.g., TEL;type=CELL;waid=1234567890:+1 234 567 890
 */
export function extractNumbersFromVCard(vcardData) {
    const numbers = new Set();
    // Split into lines
    const lines = vcardData.split('\n');
    for (const line of lines) {
        if (line.toUpperCase().startsWith('TEL')) {
            // Extract everything after the colon
            const parts = line.split(':');
            if (parts.length > 1) {
                // The number is typically the last part
                const rawNumber = parts.slice(1).join(':').trim();
                const cleaned = normalisePhone(rawNumber);
                if (isValidPhone(cleaned)) {
                    numbers.add(cleaned);
                }
            }
        }
    }
    return Array.from(numbers);
}
//# sourceMappingURL=vcard.js.map