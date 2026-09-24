import "server-only";

/**
 * Envoie une notification sur le canal Teams via le webhook configuré
 * (workflow "Post to a channel when a webhook request is received",
 * format Adaptive Card — les connecteurs O365 MessageCard sont retirés).
 *
 * `eventId` voyage à côté de la carte : le workflow s'en sert pour poster
 * la première carte d'une activité comme nouveau fil, puis répondre dans
 * ce fil pour toutes les suivantes (voir docs/notifications-teams.md).
 *
 * L'échec d'une notification ne doit jamais faire échouer l'action
 * métier qui la déclenche : on loggue et on continue.
 */
export async function sendTeamsNotification(
  eventId: string,
  title: string,
  lines: string[],
  link?: { title: string; url: string },
): Promise<void> {
  const url = process.env.TEAMS_WEBHOOK_URL;
  if (!url) {
    console.warn("TEAMS_WEBHOOK_URL absente : notification Teams ignorée.");
    return;
  }

  const card = {
    type: "message",
    eventId,
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            ...brandHeader(),
            {
              type: "TextBlock",
              size: "Medium",
              weight: "Bolder",
              text: title,
              wrap: true,
            },
            ...lines.map((text) => ({ type: "TextBlock", text, wrap: true })),
          ],
          ...(link && {
            actions: [
              { type: "Action.OpenUrl", title: link.title, url: link.url },
            ],
          }),
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

/**
 * Neutralise le Markdown d'un texte saisi par un membre (titre, lieu,
 * nom affiché, message) avant de l'insérer dans une carte : les
 * TextBlock interprètent le Markdown, et un `[texte](https://…)` y
 * deviendrait un lien d'apparence légitime dans le canal Teams.
 */
export function md(text: string): string {
  return text.replace(/[\\`*_~[\]()<>#|!]/g, "\\$&");
}

/**
 * URL publique du site, pour les liens des cartes. NEXT_PUBLIC_SITE_URL
 * prime ; à défaut, Vercel fournit le domaine de production.
 */
export function siteUrl(): string | null {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return null;
}

/**
 * En-tête « ScalActivity » en tête de carte : le bot s'appelle forcément
 * « Flux de travail » côté Teams, l'en-tête dit d'où vient le message.
 * Le logo (PNG, Teams n'affiche pas le SVG) exige une URL publique.
 */
function brandHeader(): object[] {
  const base = siteUrl();
  return [
    {
      type: "Container",
      style: "good",
      bleed: true,
      items: [
        {
          type: "ColumnSet",
          columns: [
            ...(base
              ? [
                  {
                    type: "Column",
                    width: "auto",
                    verticalContentAlignment: "Center",
                    items: [
                      {
                        type: "Image",
                        url: `${base}/scalactivity-logo.png`,
                        altText: "ScalActivity",
                        width: "32px",
                        height: "32px",
                      },
                    ],
                  },
                ]
              : []),
            {
              type: "Column",
              width: "stretch",
              verticalContentAlignment: "Center",
              items: [
                {
                  type: "TextBlock",
                  text: "ScalActivity",
                  weight: "Bolder",
                  size: "Medium",
                  spacing: "None",
                },
              ],
            },
          ],
        },
      ],
    },
  ];
}
