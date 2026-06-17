import { v2 as cloudinary } from 'cloudinary';
// Configure Cloudinary from the CLOUDINARY_URL env variable
// Format: cloudinary://api_key:api_secret@cloud_name
cloudinary.config({ secure: true });
/**
 * Upload a file to Cloudinary from a URL (e.g. Twilio media URL).
 * Returns the secure URL and public ID.
 */
export async function uploadFromUrl(mediaUrl, mediaType) {
    const resourceType = mapResourceType(mediaType);
    const result = await cloudinary.uploader.upload(mediaUrl, {
        resource_type: resourceType,
        folder: 'skedmate',
    });
    return {
        url: result.secure_url,
        publicId: result.public_id,
        resourceType: result.resource_type,
    };
}
/**
 * Map a WhatsApp media type to a Cloudinary resource type.
 */
function mapResourceType(mediaType) {
    if (mediaType === 'image')
        return 'image';
    if (mediaType === 'video' || mediaType === 'audio')
        return 'video';
    return 'raw'; // documents
}
//# sourceMappingURL=storage.js.map