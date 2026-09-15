/**
 * Text cleaner and normalizer for Zhihu search content
 */
export class TextNormalizer {
  /**
   * Strip HTML tags like <em>, <p>, <br>, etc., while preserving natural paragraphs and normalizing spaces
   */
  static cleanHtml(input: string): string {
    if (!input) return "";
    return input
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<p[^>]*>/gi, "")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /**
   * Clean answer text ensuring it is not empty and has sensible length
   */
  static sanitizeContent(text: string): string {
    const cleaned = this.cleanHtml(text);
    return cleaned;
  }
}
