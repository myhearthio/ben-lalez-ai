const SG_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "ben@benlalez.com";
const FROM_NAME = process.env.SENDGRID_FROM_NAME || "Ben Lalez | Compass";

export async function sendEmail({ to, subject, htmlBody, textBody }) {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SG_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject,
      content: [
        ...(textBody ? [{ type: "text/plain", value: textBody }] : []),
        { type: "text/html", value: htmlBody },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SendGrid ${res.status}: ${text}`);
  }

  // SendGrid returns 202 with no body on success
  return { status: "sent", to, subject };
}
