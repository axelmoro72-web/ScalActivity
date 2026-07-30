import "server-only";

/**
 * Envoie une notification sur le canal Teams via le webhook configuré
 * (workflow "Post to a channel when a webhook request is received",
 * format Adaptive Card — les connecteurs O365 MessageCard sont retirés).
 *
 * L'échec d'une notification ne doit jamais faire échouer l'action
 * métier qui la déclenche : on loggue et on continue.
 */
export async function sendTeamsNotification(
  title: string,
  lines: string[],
): Promise<void> {
  const url = process.env.TEAMS_WEBHOOK_URL;
  if (!url) {
    console.warn("TEAMS_WEBHOOK_URL absente : notification Teams ignorée.");
    return;
  }

  const card = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              size: "Medium",
              weight: "Bolder",
              text: title,
              wrap: true,
            },
            ...lines.map((text) => ({ type: "TextBlock", text, wrap: true })),
          ],
        },
      },
    ],
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card),
    });
    if (!res.ok) {
      console.error(
        `Webhook Teams : réponse ${res.status} ${await res.text()}`,
      );
    }
  } catch (err) {
    console.error("Webhook Teams injoignable :", err);
  }
}
