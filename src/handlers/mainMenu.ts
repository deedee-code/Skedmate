import { sendText } from '../services/whatsapp.js';
import { setState } from '../utils/stateManager.js';
import { buildMainMenu } from '../utils/formatter.js';
import { getAIReply } from '../services/huggingface.js';
import type { BufferedMessage } from '../services/buffer.js';

/**
 * Route the user's menu selection to the appropriate state.
 */
export async function handleMainMenu(
  phone: string,
  msg: BufferedMessage,
  userName: string
): Promise<void> {
  const input = msg.text?.trim() ?? '';

  switch (input) {
    case '1':
      await setState(phone, 'AWAITING_CONTENT', { mode: 'text' });
      await sendText(
        phone,
        'Send your message now — text, file, image, or both together 👇\n\n(You can send text and media at the same time — I\'ll wait for both!)'
      );
      break;

    case '2':
      await setState(phone, 'AWAITING_CONTENT', { mode: 'media' });
      await sendText(
        phone,
        'Send your file or media now 👇\n\n(You can include a caption too — just send them together!)'
      );
      break;

    case '3':
      await setState(phone, 'AWAITING_BROADCAST_NUMBERS');
      await sendText(
        phone,
        'Send the numbers you want to broadcast to, separated by commas (or tap 📎 and share a Contact).\n\nExample: +2348012345678, +2348087654321'
      );
      break;

    case '4':
      await setState(phone, 'AWAITING_CONTENT', { mode: 'recurring' });
      await sendText(
        phone,
        'Send the message you want to repeat 👇\n\n(Text, image, or both — I\'ll handle it!)'
      );
      break;

    case '5': {
      // Import lazily to avoid circular deps
      const { handleViewSchedules } = await import('./viewSchedules.js');
      await handleViewSchedules(phone);
      break;
    }

    case '6':
      await setState(phone, 'AWAITING_CANCEL_ID');
      await sendText(
        phone,
        'Which message would you like to cancel?\n\nReply with the message ID (you can find it by viewing your scheduled messages — option 5).'
      );
      break;

    case '7':
      await setState(phone, 'AWAITING_SETTINGS_CHOICE');
      await sendText(
        phone,
        `⚙️ Settings\n\n1️⃣  Change timezone\n\nReply with a number.`
      );
      break;

    default: {
      // Unknown input — hand off to HuggingFace
      const reply = await getAIReply(input);
      await sendText(phone, reply);
      // Re-show the menu after AI reply
      await sendText(phone, buildMainMenu(userName));
      break;
    }
  }
}
