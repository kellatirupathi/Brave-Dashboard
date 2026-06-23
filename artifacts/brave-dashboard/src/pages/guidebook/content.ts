// BRAVE Guidebook content — a modular, role-agnostic field guide for student
// entrepreneurs (also a reference for coordinators and admins who mentor them).
// Content is grounded in the programme knowledge base (brave-knowledge.txt) and
// the actual dashboard workflow. Pure data — the page (./index.tsx) renders it.
//
// To edit the guide: change the text below. No backend or migration involved.

export type GbBlock =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "steps"; items: string[] }
  | { kind: "tip"; text: string }
  | { kind: "warn"; text: string }
  | { kind: "danger"; text: string }
  | { kind: "example"; title: string; text: string }
  | { kind: "checklist"; items: string[] }
  | { kind: "table"; columns: string[]; rows: string[][] }
  | { kind: "faq"; items: { q: string; a: string }[] };

export type GbSection = { heading?: string; blocks: GbBlock[] };

// `icon` is a string key mapped to a lucide icon in ./index.tsx so this file
// stays free of React imports.
export type GbModule = {
  slug: string;
  title: string;
  icon: string;
  tagline: string;
  minutes: number;
  sections: GbSection[];
};

export const GUIDEBOOK_MODULES: GbModule[] = [
  // ---------------------------------------------------------------------------
  {
    slug: "start-here",
    title: "Start Here",
    icon: "rocket",
    tagline: "What BRAVE is, and the simple loop that wins it.",
    minutes: 4,
    sections: [
      {
        heading: "What BRAVE actually is",
        blocks: [
          {
            kind: "p",
            text: "BRAVE is NIAT's 3-month entrepreneurship programme. The goal is simple and real: build AI-powered software for a real local business, get them to pay you in rupees, and grow that into a small business of your own — all during the programme.",
          },
          {
            kind: "list",
            items: [
              "It is completely free for NIAT students.",
              "NIAT takes no equity, no IP, and no cut of your revenue — the business stays 100% yours after the programme.",
              "Your customer is a real local business paying for real software. This is not a 'make money online' challenge.",
              "AI must be the working mechanism of what you build — not a buzzword bolted on.",
            ],
          },
        ],
      },
      {
        heading: "The BRAVE loop",
        blocks: [
          {
            kind: "p",
            text: "Everything in the programme is one repeating loop. Get good at the loop and the leaderboard takes care of itself.",
          },
          {
            kind: "steps",
            items: [
              "Find a real local business with a painful, repetitive problem.",
              "Pitch a simple AI solution to that exact problem.",
              "Build it (no-code/low-code + AI APIs are fine) and deliver.",
              "Get paid — UPI, bank transfer, cheque, or cash — and keep the payment proof.",
              "Log it as a revenue entry with a BRD, and an admin verifies it.",
              "Verified revenue climbs the leaderboard and unlocks Demo Day.",
              "Repeat — sell the same solution to similar businesses on a monthly plan.",
            ],
          },
          {
            kind: "tip",
            text: "The single fastest way to start: walk into a small business near you and ask, 'What is the most time-consuming thing you do every day?' Listen. That problem is your first product.",
          },
        ],
      },
      {
        heading: "How to use this Guidebook",
        blocks: [
          {
            kind: "p",
            text: "Each module is short and practical. Read 'Find Your First Client', 'How to Pitch', 'What to Build', and 'How to Price' in order before your first sales walk — then come back to the dashboard modules (BRD, Leaderboard, Teams & Journals) when you're ready to log a deal.",
          },
        ],
      },
      {
        heading: "Your first 7 days — a simple plan",
        blocks: [
          {
            kind: "p",
            text: "Feeling lost on where to begin? Don't overthink it. Here's a week-one plan that has worked for hundreds of students.",
          },
          {
            kind: "steps",
            items: [
              "Day 1 — Form or join a team and create it on the dashboard (you get your BRAVE-XXXXX code).",
              "Day 2 — Make a list of 15 local businesses near you (shops, clinics, tuition centres, salons).",
              "Day 3–4 — Visit 5–10 of them and just ask what wastes their time the most. Don't sell. Take notes.",
              "Day 5 — Pick the one problem you heard most often. Sketch a simple AI solution for it.",
              "Day 6 — Build a tiny working demo (even one feature) using a no-code tool + an AI API.",
              "Day 7 — Go back to that owner, show the demo, and ask for a small paid pilot. Write your first weekly journal.",
            ],
          },
          {
            kind: "tip",
            text: "Done beats perfect. A rough demo that solves one real problem and earns ₹2,000 teaches you more than a month of planning. Start small, get a yes, then grow it.",
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  {
    slug: "find-first-client",
    title: "Find & Approach Your First Client",
    icon: "search",
    tagline:
      "Where your first paying client is hiding — and exactly what to say.",
    minutes: 9,
    sections: [
      {
        heading: "Your first client is closer than you think",
        blocks: [
          {
            kind: "p",
            text: "You do not need a network or a fancy idea. Your first client is a small business within a few kilometres of where you live or study. Every one of them runs on manual, repetitive work that AI can take off their plate.",
          },
          {
            kind: "list",
            items: [
              "Retail shops, supermarkets, kirana stores",
              "Clinics, hospitals, pharmacies, diagnostic labs",
              "Restaurants, cloud kitchens, food delivery outlets",
              "Schools, colleges, tuition and coaching centres",
              "Real estate agents and property dealers",
              "Logistics, transport and courier businesses",
              "Salons, spas and beauty parlours",
              "CA offices, accounting and tax firms",
            ],
          },
          {
            kind: "tip",
            text: "A family member's or friend's business counts — as long as it is a real commercial deal where they actually pay you. Remote clients in another city are allowed too.",
          },
        ],
      },
      {
        heading: "The 5–10 shop method",
        blocks: [
          {
            kind: "p",
            text: "Do not sit and brainstorm ideas. Ideas come from a client's problem, not from your head. Go and collect problems first.",
          },
          {
            kind: "steps",
            items: [
              "Pick a market area or street near you with 10+ small businesses.",
              "Walk into 5–10 of them, one by one.",
              "Introduce yourself simply: 'I'm a student building AI tools for local businesses.'",
              "Ask the magic question: 'What is the most time-consuming or frustrating thing you do every day?'",
              "Listen and take notes. Do not pitch yet — you are diagnosing.",
              "By shop number 5 you will hear the same painful problems repeating. That repetition is your opportunity.",
            ],
          },
        ],
      },
      {
        heading: "Build a simple lead list",
        blocks: [
          {
            kind: "p",
            text: "Track your prospects so you can follow up. A deal is rarely won on the first visit — it is won in the follow-up.",
          },
          {
            kind: "list",
            items: [
              "Business name and type",
              "Who you spoke to (owner / manager) and their phone or WhatsApp",
              "The problem they described, in their own words",
              "Your one-line solution idea",
              "Next step and follow-up date",
            ],
          },
        ],
      },
      {
        heading: "Warm vs cold — start warm",
        blocks: [
          {
            kind: "list",
            items: [
              "Warm: a business owned by family, a friend's family, a teacher's contact, or someone who already knows you. These convert fastest — start here.",
              "Cold: walk-ins and cold calls. Higher volume, lower hit-rate, but it is how most first deals happen. Treat every 'no' as one step closer to a 'yes'.",
            ],
          },
        ],
      },
      {
        heading: "The first conversation",
        blocks: [
          {
            kind: "p",
            text: "Your only job in the first conversation is to understand the problem deeply enough to solve it. Ask, then shut up and listen.",
          },
          {
            kind: "list",
            items: [
              "'Walk me through how you handle ___ today.' (uncover the manual process)",
              "'How much time does that take you per day or week?' (quantify the pain)",
              "'What happens when it goes wrong — do you lose customers or money?' (find the cost)",
              "'Have you ever wished this just happened automatically?' (open the door to your solution)",
            ],
          },
          {
            kind: "example",
            title: "Opening line that works",
            text: "\"Hi, I'm a student building AI tools for local businesses here. I'm not selling anything today — I just want to understand what slows your shop down the most. Can I ask you two quick questions?\"",
          },
        ],
      },
      {
        heading: "Following up (this is where deals are won)",
        blocks: [
          {
            kind: "list",
            items: [
              "Send a short WhatsApp the same day: thank them and restate the problem you heard.",
              "Within 2–3 days, send a one-line solution idea and ask for 10 minutes to show a quick demo.",
              "If they go quiet, follow up politely up to 3 times before moving on — most people are just busy, not uninterested.",
            ],
          },
          {
            kind: "warn",
            text: "Do not pitch your solution before you fully understand the problem, and do not chase huge companies for your first deal — small owners decide fast and pay fast. If a client backs out mid-build, that's normal: find another, or re-offer a smaller scope, and write about it in your journal.",
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  {
    slug: "field-visits-safety",
    title: "Field Visits & Safety",
    icon: "shield",
    tagline:
      "Show up prepared, behave professionally, and stay safe — every visit.",
    minutes: 6,
    sections: [
      {
        heading: "Before you go",
        blocks: [
          {
            kind: "p",
            text: "A field visit is your first real impression. Ten minutes of preparation is the difference between a real conversation and a polite brush-off.",
          },
          {
            kind: "checklist",
            items: [
              "Tell your Campus Coordinator before any off-campus visit. All-girls teams must get explicit confirmation first.",
              "Research the business for ~10 minutes — what they do, their size, and their likely pain points.",
              "Dress neatly and professionally; it earns credibility before you say a word.",
              "Carry a notepad or phone for notes, and a one-page solution summary if you have one.",
              "Visit in daytime hours (8:00 AM – 7:00 PM) and avoid the owner's peak rush (lunch at restaurants, morning OPD at clinics).",
            ],
          },
        ],
      },
      {
        heading: "During the visit",
        blocks: [
          {
            kind: "steps",
            items: [
              "Introduce yourself honestly — a NIAT student building a real AI solution. Never claim to be a professional agency.",
              "Listen before pitching. A solution offered before you understand the problem is just a product looking for a buyer.",
              "Don't commit scope, price, or timeline on the spot. Say 'I'll confirm with my team and follow up within 24 hours.'",
              "Take notes: client name, business name, the problem, and specific requirements — these become your BRD. Don't rely on memory.",
              "Before leaving, agree a specific next step — a date, a call, or a return demo. 'I'll be in touch' is not a next step.",
            ],
          },
        ],
      },
      {
        heading: "Safety rules — for every team",
        blocks: [
          {
            kind: "danger",
            text: "Never visit a client alone. Solo field visits are not permitted under any circumstances — always go in pairs or groups.",
          },
          {
            kind: "list",
            items: [
              "Meet only in public, professional settings — the business premises, a café, or a co-working space. Never a private residence or an isolated location.",
              "Share your live location with a teammate or family member before you leave. Check in when you arrive and when you leave.",
              "All-girls teams travel together, in daytime, using public or shared transport where possible.",
              "Any safety concern — however small — is an immediate escalation to your Campus Coordinator. Do not wait for the next check-in.",
            ],
          },
        ],
      },
      {
        heading: "After the visit",
        blocks: [
          {
            kind: "table",
            columns: ["Action", "What to do", "By when"],
            rows: [
              [
                "Log the visit",
                "Record business, owner, problem, outcome, and next step in your journal",
                "Same day",
              ],
              [
                "Follow up",
                "Send a short WhatsApp confirming what was discussed and the next step",
                "Within 2 hours",
              ],
              [
                "Start the BRD",
                "Open a BRD entry from your visit notes — don't wait for a second meeting",
                "Same day",
              ],
              [
                "Brief your team",
                "Make sure every member knows the client's status and requirements",
                "Within 24 hours",
              ],
            ],
          },
          {
            kind: "tip",
            text: "The 2-hour follow-up message is where trust is built — it shows you're serious and creates a written record you can point back to.",
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  {
    slug: "pitch",
    title: "How to Pitch",
    icon: "pitch",
    tagline: "Turn a problem you found into a yes — and get it in writing.",
    minutes: 8,
    sections: [
      {
        heading: "A pitch sells an outcome, not your code",
        blocks: [
          {
            kind: "p",
            text: "The owner does not care that you used a fancy AI model. They care that they will save 2 hours a day, stop missing customers, or earn more. Pitch the outcome; mention the AI only as proof it will actually work.",
          },
        ],
      },
      {
        heading: "The 6-part pitch",
        blocks: [
          {
            kind: "steps",
            items: [
              "Their problem, in their words: 'You told me you spend 2 hours a day answering the same WhatsApp questions.'",
              "The cost of it: 'That's ~14 hours a week, and some customers don't get a reply and go elsewhere.'",
              "Your solution in one line: 'I'll build an AI assistant that answers those questions instantly, 24/7.'",
              "How the AI does the work: 'It uses an AI chatbot trained on your products, so it replies like you would.'",
              "Proof / demo: show a 2-minute working demo or a quick prototype on your phone.",
              "The ask: state the price and the next step — 'It's ₹12,000 to set up plus ₹3,000/month. Can we start a 1-week pilot?'",
            ],
          },
        ],
      },
      {
        heading: "Show, don't tell",
        blocks: [
          {
            kind: "p",
            text: "A 2-minute live demo beats any slide deck. Even a rough prototype that answers one real question convinces an owner more than ten minutes of talking. Build something small and tangible before you pitch.",
          },
        ],
      },
      {
        heading: "Handle the common objections",
        blocks: [
          {
            kind: "list",
            items: [
              "'It's too expensive' → reframe to value: 'It costs less than the time you lose every month. You'll make it back in weeks.' Offer the monthly plan instead of a big one-time fee.",
              "'I'll think about it' → find the real hesitation: 'Totally fair — is it the price, or are you not sure it'll work for your shop?' Then address that one thing.",
              "'Does it really work?' → run the demo again on their own real example, live.",
              "'Maybe later' → lower the risk: 'Let's do a small paid pilot for one week. If it doesn't help, we stop.'",
              "'Can you do it cheaper?' → trim the scope, not the price: remove a feature rather than devaluing your work.",
            ],
          },
        ],
      },
      {
        heading: "Close it — and write it down",
        blocks: [
          {
            kind: "steps",
            items: [
              "Ask directly for the yes: 'Shall we start?' Then stay silent and let them answer.",
              "Propose a small, concrete first step (a paid pilot or a 50% advance).",
              "Get the agreement in writing — even a WhatsApp message: 'Yes, go ahead, I agree to pay ₹___.'",
              "Collect the advance or pilot payment and screenshot the proof — you'll need it for your BRD.",
            ],
          },
          {
            kind: "tip",
            text: "A short WhatsApp confirmation from the client ('This is good, I agree to pay ₹15,000') is exactly the sign-off the admin looks for when verifying your revenue. Always get it.",
          },
        ],
      },
      {
        heading: "A worked example",
        blocks: [
          {
            kind: "example",
            title: "Pitch to a busy clinic",
            text: "\"Dr. Rao, you said the front desk spends most of the morning on appointment calls and still misses some. I'll set up an AI voice agent that answers calls, books slots into your calendar, and sends reminders automatically — so no call is missed and your staff is free. Here's a 2-minute demo booking a test appointment. Setup is ₹20,000 plus ₹4,000/month for maintenance. Can we run it on one phone line for a week as a pilot?\"",
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  {
    slug: "handle-rejection",
    title: "Handle Rejection Like a Pro",
    icon: "rejection",
    tagline: "Most owners say no first — recovering fast is the real skill.",
    minutes: 6,
    sections: [
      {
        heading: "Rejection is the job, not the exception",
        blocks: [
          {
            kind: "p",
            text: "Every student faces rejection — it is a structural part of selling, not a sign you're doing badly. The question is never whether you'll be rejected, but how fast you recover and adapt.",
          },
          { kind: "h", text: "What rejection usually looks like" },
          {
            kind: "list",
            items: [
              "A flat 'no' the moment you walk in.",
              "'We already have a system' from tech-forward shops or clinics.",
              "A long, friendly chat that quietly goes nowhere.",
              "Interest, then non-payment and silence (ghosting).",
              "Requirement changes that make the original deal unviable.",
            ],
          },
        ],
      },
      {
        heading: "The 4-step response protocol",
        blocks: [
          {
            kind: "steps",
            items: [
              "Acknowledge without arguing: 'Thank you for your time — I understand' is always the right first line.",
              "Ask one non-pushy question: 'Is there any part of this that could be useful to you in a different form?' — it surfaces the real objection.",
              "Leave the door open: leave your contact and a one-line reminder of the value. Many who say no today convert in 2–4 weeks.",
              "Log and move: note the business, the objection, and the date in your journal — then go to the next prospect immediately.",
            ],
          },
        ],
      },
      {
        heading: "Match the pattern, then adapt",
        blocks: [
          {
            kind: "p",
            text: "Most rejections fall into a handful of patterns. Spot which one you're hearing and respond with the matching move.",
          },
          {
            kind: "table",
            columns: [
              "If you keep hearing…",
              "The likely cause",
              "Adapt by doing this",
            ],
            rows: [
              [
                "'Too complex, we don't need this'",
                "Over-engineered for their maturity",
                "Strip back to the simplest version; show one immediate win",
              ],
              [
                "'We already have something'",
                "You're not differentiating",
                "Ask what they use, find the gap, position around that gap",
              ],
              [
                "'We'll think about it' (again)",
                "No urgency or deadline",
                "Offer a time-bound paid pilot; agree a specific follow-up date",
              ],
              [
                "No reply after first interest",
                "Wrong channel or low priority",
                "Switch channels — a brief in-person visit or a call",
              ],
              [
                "Goes silent after the advance",
                "Delivery slow or you went quiet",
                "Reconnect now; show partial progress even if incomplete",
              ],
            ],
          },
          {
            kind: "tip",
            text: "Three follow-up attempts across two channels before you mark a lead as lost. Most 'no replies' are just busy people, not rejections.",
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  {
    slug: "what-to-build",
    title: "What Solutions & Businesses to Target",
    icon: "target",
    tagline: "Pick problems AI can truly solve — then productize and resell.",
    minutes: 8,
    sections: [
      {
        heading: "The one non-negotiable rule",
        blocks: [
          {
            kind: "warn",
            text: "AI must be doing real work in your solution. A plain website, a static form, or a 'chatbot' that just shows canned replies will be rejected. The AI must be the engine — answering, deciding, generating, recognising, or automating something real.",
          },
        ],
      },
      {
        heading: "What makes a great AI use-case",
        blocks: [
          {
            kind: "p",
            text: "Look for work that is repetitive, time-consuming, and language-, voice-, or data-heavy — with a clear 'before vs after'.",
          },
          {
            kind: "list",
            items: [
              "Answering the same customer questions over and over (chat or voice)",
              "Taking bookings, orders, or appointments by phone or WhatsApp",
              "Generating documents — invoices, reports, summaries, follow-up messages",
              "Sorting, tagging, or recognising things in photos or data",
              "Recommending products or chasing leads automatically",
            ],
          },
        ],
      },
      {
        heading: "AI capabilities you can sell",
        blocks: [
          {
            kind: "list",
            items: [
              "LLM / chatbot — answers customer queries in natural language",
              "Voice AI — a voice agent that books appointments or takes orders",
              "AI content generation — auto-creates invoices, reports, replies",
              "AI image recognition — detects defects, reads documents, sorts photos",
              "AI automation — automated follow-ups, scheduling, reminders",
              "AI recommendations — suggests products or next-best actions",
            ],
          },
          {
            kind: "tip",
            text: "You don't need to be an expert coder. No-code/low-code tools (Voiceflow, Botpress, Bubble, Glide) plus AI APIs (OpenAI, Gemini, Claude, Whisper, ElevenLabs) are enough to ship a real product.",
          },
        ],
      },
      {
        heading: "Business type → solution ideas",
        blocks: [
          {
            kind: "list",
            items: [
              "Retail / supermarket → WhatsApp ordering bot + AI inventory/restock alerts",
              "Clinic / hospital → AI voice agent for appointment booking and reminders",
              "Restaurant → AI assistant that answers menu questions and takes orders",
              "School / tuition centre → admissions and parent-query chatbot",
              "Real estate agent → AI lead-qualification bot that filters serious buyers",
              "Logistics / transport → automated dispatch and delivery-status updates",
              "Salon / parlour → AI booking bot with automatic reminders",
              "CA / accounting office → AI document and data-entry automation",
            ],
          },
        ],
      },
      {
        heading: "Handle scope changes without losing money",
        blocks: [
          {
            kind: "p",
            text: "Clients will ask for changes mid-build. Sort each request into one of three buckets so 'small favours' don't quietly eat your time.",
          },
          {
            kind: "table",
            columns: ["Change", "What it is", "What to do"],
            rows: [
              [
                "Minor",
                "Wording, colour, layout, small text edits",
                "Just do it — no discussion needed",
              ],
              [
                "Moderate",
                "A new page, extra feature, or integration",
                "Do it if it's under ~2 hours; otherwise scope it as paid future work",
              ],
              [
                "Major",
                "A different solution or full redesign",
                "Stop and discuss openly; re-quote, and loop in your coordinator if needed",
              ],
            ],
          },
          {
            kind: "warn",
            text: "Never go silent during a build. Send every active client a short progress update at least once every 3 days — silence is the number-one reason deals collapse after the pitch.",
          },
        ],
      },
      {
        heading: "Build once, sell many times",
        blocks: [
          {
            kind: "p",
            text: "The strongest BRAVE strategy: build a solution for one client, perfect it, then sell the same product to similar businesses on a monthly subscription. Each business's payment is a separate verified revenue entry — your revenue compounds while your build cost stays flat.",
          },
        ],
      },
      {
        heading: "Validate before you build",
        blocks: [
          {
            kind: "steps",
            items: [
              "Confirm the problem with a real owner.",
              "Get a verbal yes on the outcome and a price range.",
              "Ask for a small advance or paid pilot before you build the full thing.",
              "Build the smallest version that solves the core problem, then expand.",
            ],
          },
          {
            kind: "warn",
            text: "Do NOT target: plain websites with no AI, free or personal projects, college assignments, or 'sell-to-yourself' deals. The client must be an external business paying real money for AI that does real work.",
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  {
    slug: "pricing",
    title: "How to Price Your Solution",
    icon: "rupee",
    tagline: "Charge for the value you create — and make it recurring.",
    minutes: 7,
    sections: [
      {
        heading: "Price on value, not on effort",
        blocks: [
          {
            kind: "p",
            text: "Never price by 'how hard it was to build'. Price by what the problem is costing the client. If their manual work wastes ₹20,000 of time a month, a ₹5,000/month solution is a bargain — and they'll happily pay it.",
          },
          {
            kind: "tip",
            text: "Quick rule of thumb: estimate the monthly money or time your solution saves (or earns) them, and price at a clear fraction of that. The bigger their pain, the more you can charge.",
          },
        ],
      },
      {
        heading: "Three ways to charge",
        blocks: [
          {
            kind: "list",
            items: [
              "One-time payment — a single fee to build and deliver (e.g., ₹15,000).",
              "Monthly subscription — a recurring fee for the running service (e.g., ₹3,000/month × 3 months). This is the best model.",
              "Milestone-based — split the fee (e.g., 50% on delivery, 50% after one month of use).",
            ],
          },
        ],
      },
      {
        heading: "Why subscriptions win",
        blocks: [
          {
            kind: "p",
            text: "A one-time fee is paid once. A subscription pays every month and grows as you add clients. ₹3,000/month from five businesses is ₹15,000 every month — and it keeps coming. Aim for a setup fee plus a monthly plan wherever you can.",
          },
        ],
      },
      {
        heading: "How to quote with confidence",
        blocks: [
          {
            kind: "steps",
            items: [
              "Anchor on value first: restate the problem's cost before you say a number.",
              "Give a clear package: what's included, what's not.",
              "State the price plainly and then stop talking — let them react.",
              "If they push back, trim scope or offer the monthly plan; don't slash your price.",
            ],
          },
        ],
      },
      {
        heading: "The pilot strategy",
        blocks: [
          {
            kind: "p",
            text: "If an owner hesitates, offer a small paid pilot — one week or one feature, at a reduced but real price. It lowers their risk, gets you a paying client (and a verifiable payment), and lets you upsell the full solution once they see results.",
          },
        ],
      },
      {
        heading: "Getting paid (and proving it)",
        blocks: [
          {
            kind: "list",
            items: [
              "Accept UPI, bank transfer, cheque, or cash — whatever is easiest for the client.",
              "Always capture payment proof: a UPI/bank screenshot showing amount, date, payer name, and transaction ID.",
              "The amount you receive must match the amount you log in the dashboard and write in your BRD.",
            ],
          },
          {
            kind: "warn",
            text: "No payment proof = no verified revenue. Screenshot every payment the moment it lands — you cannot verify a deal without it.",
          },
        ],
      },
      {
        heading: "Starting price ranges (illustrative)",
        blocks: [
          {
            kind: "p",
            text: "These are conservative starting points to anchor your first quotes — real prices vary with the client and the value delivered. Start reasonable, deliver well, then raise prices as you build a track record.",
          },
          {
            kind: "list",
            items: [
              "Small automation (reminders, follow-ups): ~₹5,000–₹15,000 one-time",
              "AI chatbot or voice agent: ~₹10,000–₹40,000 setup + ₹2,000–₹5,000/month",
              "Productized subscription (resold to many): ~₹2,000–₹8,000/month per business",
            ],
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  {
    slug: "brd-and-revenue",
    title: "Prove It: BRD & Logging Revenue",
    icon: "brd",
    tagline: "Turn a real payment into verified revenue that counts.",
    minutes: 8,
    sections: [
      {
        heading: "What a BRD is — and why it matters most",
        blocks: [
          {
            kind: "p",
            text: "A BRD (Business Requirements Document) is the evidence file for your deal. It is the single most important document you create in BRAVE. Admins use it to confirm four things before your revenue counts.",
          },
          {
            kind: "list",
            items: [
              "You actually built something (not just promised it).",
              "The client is real and agreed to pay.",
              "AI was genuinely used — not just mentioned.",
              "The amount you claim matches the payment evidence.",
            ],
          },
          {
            kind: "warn",
            text: "Without a proper BRD with payment proof, your revenue entry will be rejected.",
          },
        ],
      },
      {
        heading: "What a strong BRD includes",
        blocks: [
          {
            kind: "list",
            items: [
              "Client & business info — name, business, type, location, contact",
              "Problem statement — what they struggled with, and how much it cost them",
              "Solution description — what you built and how the client uses it",
              "How AI is used — which AI, which tool/API, and what it does (mandatory)",
              "Scope / deliverables — what you delivered, and what's not included",
              "Pricing & commercial terms — amount and payment structure",
              "Payment proof — UPI/bank screenshot, receipt, or cheque image",
              "Client sign-off — a message or signature confirming they agree to pay",
              "Testimonial — optional but strongly recommended",
              "Team members & roles — who built what",
            ],
          },
        ],
      },
      {
        heading: "Payment proof is the #1 thing",
        blocks: [
          {
            kind: "p",
            text: "The relevancy of your BRD is driven mostly by clear, genuine payment proof whose amount matches your claim. Attach at least one: a UPI screenshot (amount, date, payer, transaction ID), a bank transfer receipt, or a cheque image with confirmation.",
          },
          {
            kind: "tip",
            text: "The money must be RECEIVED by you/your team from the client. A payment sent by the client's company, finance team, or family is fine. But money paid to a team member or moving between teammates is not valid revenue.",
          },
        ],
      },
      {
        heading: "Order Book vs Revenue",
        blocks: [
          {
            kind: "list",
            items: [
              "Order Book entry = a deal you've committed but not yet been paid for. Useful for tracking, but it does NOT count toward the leaderboard.",
              "Revenue entry = money you've actually received, with a BRD attached. Only verified revenue counts.",
            ],
          },
        ],
      },
      {
        heading: "Log a revenue entry — step by step",
        blocks: [
          {
            kind: "steps",
            items: [
              "Open Projects in the sidebar and select the project for this client (or create one).",
              "In the project, find the Revenue section and click 'Add Revenue Entry'.",
              "Enter the amount received and a clear description.",
              "Attach your BRD (PDF recommended; DOC/DOCX or a clear image also work, max 25 MB).",
              "Save as Draft, review it, then click Submit to send it to the admin Review Queue.",
              "Wait for verification. Verified → it counts on the leaderboard. Rejected → read the reason, fix, and resubmit.",
            ],
          },
        ],
      },
      {
        heading: "Why entries get rejected (and how to avoid it)",
        blocks: [
          {
            kind: "list",
            items: [
              "No payment proof attached — always include the screenshot/receipt.",
              "AI not explained — say which AI, which API, and what it does in the product.",
              "Client info missing — admins can't verify a nameless client.",
              "Amount in the document doesn't match the amount entered in the dashboard.",
              "BRD is just a proposal — it must describe work that's already done and paid for.",
              "No client sign-off — get at least a WhatsApp confirmation.",
              "No real AI, or a personal/college/free project — these don't qualify.",
            ],
          },
        ],
      },
      {
        heading: "Pre-submit checklist",
        blocks: [
          {
            kind: "checklist",
            items: [
              "Client name, business name, and location included",
              "Problem statement clearly described",
              "Solution features listed in detail",
              "AI usage explained (which AI, what it does)",
              "Deliverables listed",
              "Payment amount and structure written",
              "Payment proof (UPI screenshot / receipt) attached",
              "Client sign-off or acknowledgment included",
              "Document amount matches the dashboard amount",
              "File is PDF/DOC/DOCX or a clear image, under 25 MB",
            ],
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  {
    slug: "leaderboard-demo-day",
    title: "Leaderboard & Demo Day",
    icon: "trophy",
    tagline: "What counts, how you climb, and the finish line.",
    minutes: 5,
    sections: [
      {
        heading: "Only verified revenue counts",
        blocks: [
          {
            kind: "p",
            text: "The leaderboard ranks teams purely on verified revenue — the sum of verified amounts on revenue entries an admin has approved. Draft, submitted, and rejected entries do not count yet. Order Book entries never count.",
          },
        ],
      },
      {
        heading: "The leaderboard",
        blocks: [
          {
            kind: "list",
            items: [
              "National view — all teams across every campus.",
              "Campus view — filter to compare within your own campus.",
              "Your team is highlighted so you can spot your rank quickly.",
              "If a submission has been pending a long time, ask your coordinator to follow up.",
            ],
          },
        ],
      },
      {
        heading: "Demo Day",
        blocks: [
          {
            kind: "p",
            text: "Demo Day is the final showcase where the best teams pitch their businesses to a panel. The default eligibility threshold is ₹2,00,000 in verified revenue, with higher recognition levels at ₹5,00,000 and ₹20,00,000.",
          },
          {
            kind: "steps",
            items: [
              "Reach the verified-revenue threshold (default ₹2,00,000).",
              "Wait for the admin to open Demo Day applications — you'll get a notification.",
              "Open the Demo Day page and fill in the application (business, traction, why you).",
              "Submit before the deadline. Admins review and shortlist.",
            ],
          },
          {
            kind: "tip",
            text: "Even if you don't make Demo Day, you keep everything — your product, your clients, and every rupee you earned. NIAT takes nothing.",
          },
        ],
      },
      {
        heading: "Milestones along the way",
        blocks: [
          {
            kind: "p",
            text: "The system automatically marks milestones on your Team page: team registered, first project, first verified revenue, and crossing ₹50K, ₹1L, and the Demo Day threshold. They're a quick way to see your team's journey.",
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  {
    slug: "teams-and-journals",
    title: "Stay on Track: Teams & Journals",
    icon: "track",
    tagline: "Build a strong team and keep momentum every week.",
    minutes: 6,
    sections: [
      {
        heading: "Teams",
        blocks: [
          {
            kind: "list",
            items: [
              "2–4 members works best; up to 5 allowed; solo is allowed too.",
              "Every member must be from the same NIAT campus — the platform enforces this strictly.",
              "A team is active the moment it's created, with a unique invite code (BRAVE-XXXXX).",
              "A student can be on only one team at a time.",
            ],
          },
          {
            kind: "p",
            text: "Join a team by creating one (you become leader), browsing same-campus teams and requesting to join, entering an invite code, or accepting an invitation. Split roles clearly — e.g., one on the build, one on AI integration, one on client communication and sales.",
          },
        ],
      },
      {
        heading: "Weekly journals",
        blocks: [
          {
            kind: "p",
            text: "Once a week, each member writes a short journal entry from the Weekly Journal page. It is a structured check-in, not an essay — even 5–6 clear bullet points beat a long vague paragraph.",
          },
          {
            kind: "list",
            items: [
              "What you worked on this week (calls, meetings, features, demos)",
              "Wins — any deals signed or payments received",
              "Blockers — what slowed you down",
              "Next week's plan — what you'll focus on",
              "Any help you need from your coordinator or mentor",
            ],
          },
        ],
      },
      {
        heading: "Don't go silent",
        blocks: [
          {
            kind: "warn",
            text: "If a team makes no journal activity for several days, the platform sends silent-team nudges at day 5 and day 7 (and alerts your coordinator). To reset the timer, just write a journal entry — one from any member is enough.",
          },
        ],
      },
      {
        heading: "Where to get help",
        blocks: [
          {
            kind: "list",
            items: [
              "Your Campus Coordinator is your first point of contact for anything.",
              "The in-app assistant (chat bubble) answers programme questions any time.",
              "The Resources Library (if enabled) has curated tools and tutorials.",
              "Remember: BRAVE runs alongside your classes — plan your week so both move forward.",
            ],
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  {
    slug: "mindset-and-habits",
    title: "Mindset & Habits That Win",
    icon: "spark",
    tagline: "The student habits that separate top teams from silent ones.",
    minutes: 6,
    sections: [
      {
        heading: "You are not doing a project — you are starting a business",
        blocks: [
          {
            kind: "p",
            text: "The biggest shift in BRAVE is mental. This is not a college assignment you submit and forget. You are finding real customers, solving real problems, and earning real money. Treat every client like your own business depends on it — because after the programme, it's 100% yours.",
          },
        ],
      },
      {
        heading: "Talk to people, don't sit and think",
        blocks: [
          {
            kind: "p",
            text: "The #1 reason students get stuck is they try to think of the 'perfect idea' alone. Ideas don't come from your head — they come from a business owner's problem. Every hour spent talking to shop owners is worth ten hours of brainstorming.",
          },
          {
            kind: "tip",
            text: "Set a weekly target: talk to at least 5 new businesses every week. Volume beats genius — the more problems you hear, the faster you find a paying one.",
          },
        ],
      },
      {
        heading: "Sell first, build second",
        blocks: [
          {
            kind: "p",
            text: "Don't spend three weeks building something nobody asked for. Get a verbal yes and a small advance FIRST, then build the smallest version that solves the core problem. A paying client keeps you motivated and tells you exactly what to build next.",
          },
        ],
      },
      {
        heading: "Rejection is part of the job",
        blocks: [
          {
            kind: "p",
            text: "Most owners will say no, be busy, or go quiet. That is normal — it is not about you. Every 'no' moves you closer to a 'yes'. The students who win are simply the ones who knocked on more doors and followed up one more time.",
          },
          {
            kind: "warn",
            text: "The fastest way to fail BRAVE is to go silent. If you hit a wall, write it in your weekly journal and ask your coordinator — don't disappear. Quiet teams get help last; visible teams get help first.",
          },
        ],
      },
      {
        heading: "Small, consistent steps",
        blocks: [
          {
            kind: "list",
            items: [
              "Do one BRAVE thing every day — a visit, a call, a feature, a follow-up.",
              "Log your week honestly in the journal, even when the week was slow.",
              "Celebrate small wins — your first ₹500 is proof the model works.",
              "Keep your classes moving too — plan your week so both progress.",
            ],
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  {
    slug: "conduct-integrity",
    title: "Conduct, Integrity & Getting Help",
    icon: "conduct",
    tagline: "Play it straight, stay safe, and know exactly who to ask.",
    minutes: 6,
    sections: [
      {
        heading: "The five principles behind every rule",
        blocks: [
          {
            kind: "list",
            items: [
              "Revenue is the truth — interest, demos, and advances are signals; only verified revenue received in full is real.",
              "Execution over theory — a simple solution that ships and gets paid beats a sophisticated one that never launches.",
              "Real clients only — genuine SMB owners, not friends, family simulations, or NIAT staff posing as clients.",
              "Honesty in all documentation — real names, real amounts, real dates, every time.",
              "Ownership stays with you — NIAT takes no equity, no IP, and no cut, during or after the programme.",
            ],
          },
        ],
      },
      {
        heading: "Zero tolerance for fakery",
        blocks: [
          {
            kind: "danger",
            text: "Fake entries, inflated amounts, wrong dates, or fabricated client names lead to immediate rejection and possible disqualification. There are no exceptions — honesty is the one line you never cross.",
          },
        ],
      },
      {
        heading: "How to conduct yourself",
        blocks: [
          { kind: "h", text: "With clients" },
          {
            kind: "list",
            items: [
              "Always represent yourself truthfully as a student — never overstate your background or capabilities.",
              "Never promise what your team can't deliver, and if you'll miss a deadline, tell the client before it passes, not after.",
              "Treat every client as a professional engagement, regardless of business size.",
            ],
          },
          { kind: "h", text: "Within your team" },
          {
            kind: "list",
            items: [
              "Raise blockers and progress inside the team before escalating outside.",
              "Give each client and deliverable a clear owner — ambiguity kills execution.",
              "Respond to coordinator messages within 24 hours and check portal announcements every couple of days.",
            ],
          },
        ],
      },
      {
        heading: "Consequences of violations",
        blocks: [
          {
            kind: "table",
            columns: ["Violation", "Consequence"],
            rows: [
              [
                "Fake or inflated revenue entry",
                "Entry rejected; team flagged; repeat = disqualification",
              ],
              [
                "Misrepresenting client status",
                "Entry rejected; journal reviewed; coordinator informed",
              ],
              [
                "Sharing portal credentials",
                "Account suspended pending review",
              ],
              [
                "Misconduct toward a client or teammate",
                "Escalated to Programme Admin; possible removal",
              ],
              [
                "Safety protocol not followed",
                "Escalated immediately to Coordinator and Admin",
              ],
            ],
          },
        ],
      },
      {
        heading: "When you're stuck: who to ask",
        blocks: [
          {
            kind: "p",
            text: "Use the right level. Don't skip levels unless it's urgent or involves safety or integrity.",
          },
          {
            kind: "table",
            columns: ["Level", "Who", "Use it for"],
            rows: [
              [
                "L1",
                "Team Leader",
                "Internal disputes, task ownership, minor client disagreements (resolve in ~48h)",
              ],
              [
                "L2",
                "Campus Coordinator",
                "Client blockers stuck 7+ days, safety concerns, suspected fake entries, portal access",
              ],
              [
                "L3",
                "Programme Admin",
                "Revenue disputes, disqualification or Demo Day eligibility queries, cross-campus issues",
              ],
            ],
          },
          {
            kind: "danger",
            text: "Anything involving personal safety — yours or a client's — is an immediate L2 escalation, any time of day. Contact your Campus Coordinator directly; don't wait.",
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  {
    slug: "student-faq",
    title: "Student FAQ — Quick Answers",
    icon: "faq",
    tagline: "Fast answers to the questions students ask most.",
    minutes: 8,
    sections: [
      {
        heading: "Getting started",
        blocks: [
          {
            kind: "faq",
            items: [
              {
                q: "I have no idea for a business. Where do I start?",
                a: "Go to a market near you, walk into 5–10 shops, and ask each owner: 'What is the most time-consuming thing you do every day?' Listen. The repeated answers are your opportunity. The idea comes from their problem, not from your head.",
              },
              {
                q: "Do I need to be a great programmer?",
                a: "No. BRAVE is about entrepreneurship and using AI as leverage. You can use no-code/low-code tools (Bubble, Glide, Voiceflow, Botpress) plus AI APIs (OpenAI, Gemini, Claude). Technical skills help, but they are not required to start.",
              },
              {
                q: "Do I need to know AI already?",
                a: "No — you'll learn as you build. The goal is to use AI as a tool to solve a real problem, not to be an expert first.",
              },
              {
                q: "Is BRAVE free?",
                a: "Yes — completely free for all NIAT students. And NIAT takes no equity, no IP, and no cut of your revenue.",
              },
              {
                q: "What about my classes?",
                a: "BRAVE runs alongside your classes, not instead of them. Plan your week so both move forward.",
              },
            ],
          },
        ],
      },
      {
        heading: "Teams",
        blocks: [
          {
            kind: "faq",
            items: [
              {
                q: "What's the ideal team size?",
                a: "2–4 members works best; up to 5 are allowed; solo is allowed too.",
              },
              {
                q: "Can I be on two teams at once?",
                a: "No. Each student can be on only one team at a time. You must leave your current team before joining another.",
              },
              {
                q: "Can I team up with students from another campus?",
                a: "No. Every team member must be from the same NIAT campus — the platform enforces this strictly.",
              },
              {
                q: "Where is my team's invite code?",
                a: "On the Team page (sidebar → My Team). It looks like BRAVE-XXXXX. Share it with classmates from your campus so they can join.",
              },
              {
                q: "How do I join a team?",
                a: "Create one (you become leader), browse same-campus teams and 'Request to Join', enter an invite code, or accept an invitation from the bell/notifications.",
              },
              {
                q: "My team leader is inactive — what do I do?",
                a: "Contact your Campus Coordinator. They can escalate to the admin, who can reassign team leadership.",
              },
            ],
          },
        ],
      },
      {
        heading: "Revenue, BRD & verification",
        blocks: [
          {
            kind: "faq",
            items: [
              {
                q: "What's the difference between Order Book and Revenue?",
                a: "Order Book = a deal you've committed but not yet been paid for. Revenue = money you've actually received (with a BRD). Only verified Revenue counts toward the leaderboard.",
              },
              {
                q: "Can I log revenue without a BRD?",
                a: "No. A BRD (or equivalent proof document with payment evidence) is required for every revenue entry — without it, an admin can't confirm the deal is real.",
              },
              {
                q: "My entry says 'Draft' or 'Submitted' — does it count?",
                a: "Not yet. Only 'Verified' entries count. Draft = saved but not submitted. Submitted = waiting for admin review. It counts once an admin marks it Verified.",
              },
              {
                q: "My revenue entry was rejected. What now?",
                a: "Read the rejection reason. The usual fixes: attach payment proof, explain how AI is used more clearly, make the document amount match the dashboard amount, and add a client sign-off. Fix it and resubmit.",
              },
              {
                q: "Can I submit multiple revenue entries?",
                a: "Yes — submit a separate entry for each payment and each client. Separate entries are easier to verify, and one rejection doesn't affect the others.",
              },
              {
                q: "How long does verification take?",
                a: "There's no fixed SLA, but admins usually review within a few days. If yours has been pending more than a week, ask your coordinator to follow up.",
              },
              {
                q: "Can I work with a family member's business?",
                a: "Yes — as long as it's a real commercial deal where they actually pay you for the product. The BRD must reflect a genuine transaction, not a gift.",
              },
            ],
          },
        ],
      },
      {
        heading: "Leaderboard & Demo Day",
        blocks: [
          {
            kind: "faq",
            items: [
              {
                q: "What is the leaderboard based on?",
                a: "Only verified revenue — the sum of verified amounts on approved revenue entries. Draft, submitted, and rejected entries don't count.",
              },
              {
                q: "How do I become eligible for Demo Day?",
                a: "Reach the verified-revenue threshold (default ₹2,00,000), then apply when the admin opens applications. You'll get a notification when they open.",
              },
              {
                q: "What if my team doesn't make Demo Day?",
                a: "You keep everything — your product, your clients, and every rupee you earned. NIAT takes nothing. The business is yours to continue.",
              },
            ],
          },
        ],
      },
      {
        heading: "Account & access",
        blocks: [
          {
            kind: "faq",
            items: [
              {
                q: "I get a 'not on roster' message and can't log in.",
                a: "You need to be on your campus's student roster. Contact your Campus Coordinator and ask them to add you. Once added, try logging in again.",
              },
              {
                q: "Can I use the dashboard on my phone?",
                a: "Yes. The BRAVE Dashboard is mobile-responsive — open it in your phone's browser and log in normally.",
              },
              {
                q: "How do I stop the 'silent team' reminders?",
                a: "Write a weekly journal entry. The timer resets when any team member submits a journal — one entry is enough.",
              },
            ],
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  {
    slug: "quick-reference-glossary",
    title: "Quick Reference & Glossary",
    icon: "reference",
    tagline: "The cheat sheet — do's, don'ts, deadlines, and key terms.",
    minutes: 5,
    sections: [
      {
        heading: "Do / Don't at a glance",
        blocks: [
          {
            kind: "table",
            columns: ["Do", "Don't"],
            rows: [
              [
                "Approach real businesses with real problems",
                "Pitch friends or family as token clients",
              ],
              [
                "Get an advance as proof of commitment",
                "Treat verbal interest as confirmed revenue",
              ],
              [
                "Start with the simplest solution that works",
                "Over-engineer before the client approves the basics",
              ],
              [
                "Update every active client at least every 3 days",
                "Go silent during a build",
              ],
              [
                "Submit revenue entries the moment you're paid",
                "Batch all entries at the end of the cycle",
              ],
              [
                "Log every blocker in your weekly journal",
                "Skip a journal week, even a slow one",
              ],
              ["Escalate blockers early", "Try to solve everything alone"],
              ["Fix and resubmit rejected entries", "Abandon a rejected entry"],
            ],
          },
        ],
      },
      {
        heading: "Key deadlines & standards",
        blocks: [
          {
            kind: "table",
            columns: ["Activity", "Standard"],
            rows: [
              [
                "Revenue entry",
                "Submit immediately on receiving payment — don't hold it",
              ],
              [
                "Weekly journal",
                "On time, every week — missed journals are flagged",
              ],
              [
                "Client communication",
                "A status update to every active client at least every 3 days",
              ],
              [
                "Re-engaging a quiet client",
                "Within 48 hours; 3 attempts across 2 channels before marking lost",
              ],
              [
                "Coordinator response to escalation",
                "Acknowledged within 24 hours",
              ],
              [
                "Keep client records",
                "Retain all communication for 30 days post-programme",
              ],
            ],
          },
        ],
      },
      {
        heading: "Glossary",
        blocks: [
          {
            kind: "table",
            columns: ["Term", "What it means"],
            rows: [
              [
                "Advance payment",
                "An upfront partial payment — the standard proof of client commitment",
              ],
              [
                "BRD",
                "Business Requirements Document — the evidence file for a deal (problem, solution, AI, proof)",
              ],
              [
                "Order Book",
                "A confirmed deal that hasn't been paid yet — does NOT count on the leaderboard",
              ],
              [
                "Revenue",
                "Money actually received with proof — only verified revenue counts",
              ],
              [
                "Verified Revenue",
                "A revenue entry approved by an admin — the only figure that ranks you",
              ],
              [
                "SMB",
                "Small and Medium Business — the target client for every BRAVE engagement",
              ],
              [
                "Demo Day",
                "The showcase where top teams pitch to investors and the NIAT community",
              ],
              [
                "GRIT Finale",
                "The national BRAVE finale, open to top Demo Day teams",
              ],
              [
                "Warm network",
                "Contacts who already know you — the fastest source of a first client",
              ],
            ],
          },
        ],
      },
      {
        heading: "What the top teams earn",
        blocks: [
          {
            kind: "list",
            items: [
              "A GRIT Finale ticket — access to the national programme finale.",
              "A direct investor pitch opportunity.",
              "A Demo Day presentation slot in front of the wider NIAT and external community.",
              "Full ownership — NIAT takes no equity, IP, or cut, including after the programme.",
            ],
          },
          {
            kind: "tip",
            text: "Reaching the top isn't luck — it's submitting verified revenue early and consistently. Teams that log deals the day they're paid rank highest.",
          },
        ],
      },
    ],
  },
  // ---------------------------------------------------------------------------
  {
    slug: "international-clients-payments",
    title: "International Clients & Payments",
    icon: "rupee",
    tagline: "Work with clients worldwide — and how to get paid.",
    minutes: 3,
    sections: [
      {
        heading: "You can work with international clients",
        blocks: [
          {
            kind: "p",
            text: "Your customer doesn't have to be in India. You're free to work with international businesses — including clients in the U.S. — as long as you're building real AI-powered software they pay for. Revenue from an international client counts exactly the same as domestic revenue once it's verified.",
          },
          {
            kind: "list",
            items: [
              "International clients, including those in the U.S., are fully allowed.",
              "The work and the AI-value rules are identical to domestic projects.",
              "Once verified, international revenue counts the same toward your leaderboard rank and Demo Day eligibility.",
              "Log the payment in its rupee value at the time you received it, the same way you record any revenue entry.",
            ],
          },
        ],
      },
      {
        heading: "Accepted payment methods",
        blocks: [
          {
            kind: "list",
            items: [
              "Bank / wire transfer (including international SWIFT / wire payments).",
              "PayPal.",
              "Wise (TransferWise).",
              "UPI / Razorpay — for domestic (Indian) clients.",
            ],
          },
          {
            kind: "tip",
            text: "Whatever method you use, keep proof of payment (invoice, receipt, or bank statement). You'll attach it as supporting evidence when you submit the revenue entry — submitted revenue is typically verified within 24 hours.",
          },
        ],
      },
    ],
  },
];
