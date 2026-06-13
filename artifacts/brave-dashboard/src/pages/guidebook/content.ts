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
  | { kind: "example"; title: string; text: string }
  | { kind: "checklist"; items: string[] };

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
];
