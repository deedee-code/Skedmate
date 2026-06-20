import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary from the CLOUDINARY_URL env variable
// Format: cloudinary://api_key:api_secret@cloud_name
cloudinary.config({ secure: true });

import fetch from 'node-fetch';

export interface UploadResult {
  url: string;
  publicId: string;
  resourceType: string;
}

/**
 * Upload a file to Cloudinary from a URL (e.g. Twilio media URL).
 * Returns the secure URL and public ID.
 */
export async function uploadFromUrl(
  mediaUrl: string,
  mediaType: string
): Promise<UploadResult> {
  const resourceType = mapResourceType(mediaType);
  
  let uploadTarget = mediaUrl;

  // Cloudinary's remote fetcher often strips or fails with inline Basic Auth.
  // For protected Twilio URLs, we fetch the file into our server's memory first.
  if (mediaUrl.includes('api.twilio.com')) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const authString = Buffer.from(`${sid}:${token}`).toString('base64');

    const response = await fetch(mediaUrl, {
      headers: { Authorization: `Basic ${authString}` }
    });

    if (!response.ok) {
      throw new Error(`Failed to download media from Twilio: ${response.statusText}`);
    }

    const buffer = await response.buffer();
    // Convert to a Base64 Data URI which Cloudinary natively supports
    uploadTarget = `data:${mediaType};base64,${buffer.toString('base64')}`;
  }

  const result = await cloudinary.uploader.upload(uploadTarget, {
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
 * Map a WhatsApp media type (or MIME type) to a Cloudinary resource type.
 */
function mapResourceType(mediaType: string): 'image' | 'video' | 'raw' | 'auto' {
  if (mediaType.startsWith('image')) return 'image';
  if (mediaType.startsWith('video') || mediaType.startsWith('audio')) return 'video';
  return 'raw'; // documents
}
