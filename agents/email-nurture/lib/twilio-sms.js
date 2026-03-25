import twilio from "twilio";

let _client;
function smsClient() {
  if (!_client) _client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return _client;
}

export async function sendSms(to, body) {
  const message = await smsClient().messages.create({
    body,
    from: process.env.TWILIO_FROM_NUMBER,
    to,
  });
  return { sid: message.sid, to, status: message.status };
}
