/**
 * Random romantic quotes for CP personal messages (invitations vs removal).
 */
const CP_QUOTES = {
  invitation_received: [
    "I didn't send this invite by chance… I sent it hoping you'd become my favorite person. Will you accept? ❤️",
    "Accept this invite, and let's turn a simple hello into our sweetest love story. ✨💖",
    "Maybe we're just one click away from something magical. Will you take that chance with me? 🌸❤️",
    "I don't need a perfect love story… I just need you to accept this invite and let our story begin. 💞",
    "This isn't just an invitation—it's a little piece of my heart knocking on your door. Will you let it in? 🥹💕",
    "Every great love starts with one brave yes. Will you be my yes today? 💖",
    "I picked this ring because you deserve something as special as you are. Say yes? 💍✨",
  ],
  invitation_sent: [
    "Your heart is on its way to them—now we wait for magic. ✨",
    "You took the leap. However they answer, you were brave enough to try. 💕",
    "Some loves begin with a single invitation. Yours is out there now. 🌸",
  ],
  invitation_accepted: [
    "They said yes! Two hearts, one story—let the sweetest chapter begin. 💑✨",
    "Your invitation was accepted. Love just got a little more real. 💖",
    "Someone chose you today. Hold that feeling close. 🥹💕",
    "A yes changes everything. Welcome to your CP journey together. 🌸❤️",
  ],
  invitation_accepted_self: [
    "You said yes to love—and that's the bravest thing you could do. 💑",
    "Your story together starts now. Make every moment count. ✨💖",
    "Two hearts, one ring, endless possibilities. Enjoy the ride. 💞",
  ],
  invitation_declined: [
    "Not every door opens right away—and that's okay. Your ring is safe with you. 🌸",
    "They weren't ready yet. Your heart still matters, and your time will come. 💫",
    "A no today isn't the end of your story—just a different turn in the road. 🥀",
    "Love doesn't always say yes the first time. Keep believing in yours. 💔➡️💖",
  ],
  removal_request: [
    "Sometimes love needs honesty more than forever. Can we talk about letting go? 💔",
    "This isn't easy to say, but I think we need to take off the ring. Will you understand? 🥀",
    "Every story has chapters—maybe ours is asking for a gentle ending. 🌙",
    "If we can't make it work, I'd rather we part with respect than silence. 💔",
    "I'm knocking with a heavy heart… can we end this CP with kindness? 🥹",
  ],
  removal_request_sent: [
    "You asked for space to breathe. We sent your request—however they answer, be kind to yourself. 🌸",
    "Letting go is hard. You did what you felt was right. 💫",
  ],
  removal_confirmed: [
    "Some loves become memories—and memories can still be beautiful. Thank you for the chapter we shared. 💔",
    "The ring comes off, but the kindness we shared doesn't have to. Wishing you peace. 🌙",
    "Goodbye for now. May your next chapter be even brighter. ✨",
    "We gave it our all. That's still something worth honoring. 🥀💕",
  ],
  removal_confirmed_initiator: [
    "You chose to end your CP. However it feels today, be gentle with your heart. 🌸",
    "Closing a chapter takes courage too. Wishing you healing ahead. 💫",
  ],
  removal_request_declined: [
    "They want to keep trying—the story isn't over yet. 💕",
    "Your partner isn't ready to let go. Maybe there's still something worth fighting for. ✨",
    "They said no to breaking up. Whatever you decide next, choose with care. 🌸❤️",
  ],
  ring_change_request: [
    "A new ring for a new chapter—will you wear this one with me? 💍✨",
    "I found a ring that feels more like us. Will you say yes to the change? 💖",
  ],
  ring_change_declined: [
    "They'd rather keep the ring you have now—for now, your bond stays the same. 💍",
    "Not every change happens today. Your CP story continues as it is. 🌸",
  ],
  ring_change_accepted: [
    "They loved the new ring! Your CP just got a little sparklier. ✨💍",
    "Ring upgraded, hearts still together—enjoy the fresh sparkle. 💖",
  ],
};

function pickCpQuote(category) {
  const pool = CP_QUOTES[category];
  if (!pool?.length) return '';
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Append a random quote block for personal messages. */
function cpQuoteLine(category) {
  const q = pickCpQuote(category);
  return q ? `\n\n"${q}"` : '';
}

module.exports = {
  CP_QUOTES,
  pickCpQuote,
  cpQuoteLine,
};
