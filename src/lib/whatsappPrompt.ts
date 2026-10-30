import { WhatsAppPromptData } from '../components/UpdateWhatsAppModal';

export const WHATSAPP_PROMPT_EVENT = 'OPEN_WHATSAPP_UPDATE_MODAL';

/**
 * Triggers the global Update WhatsApp Number modal for an influencer.
 */
export function triggerUpdateWhatsAppModal(data: WhatsAppPromptData) {
  window.dispatchEvent(
    new CustomEvent<WhatsAppPromptData>(WHATSAPP_PROMPT_EVENT, {
      detail: data,
    })
  );
}
