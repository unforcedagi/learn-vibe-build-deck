// The Week 9 final project prompt, one copy for the Worker and the site.
// Text: Aaron's v3 prompt (Oct 26), verbatim.
// The Worker fills {{CONTEXT}} with the signed-in student's own semester
// (worker/src/fpprompt.js); signed out, the site fills it with GENERIC_SLOT.
// lessons/src/week-9.md carries the generic version; a test keeps them equal.

export const FP_PROMPT_TEMPLATE = `I'm a student in Learn, Vibe, Build, a course where we build things with AI. I'm starting my final project, and I'd like your help thinking it through. I'm in the driver's seat: it's my project and my call. Your job is to help me get clear, and then help me turn it into something I can share with my project pod.

Below is everything I've done this semester: my weekly submissions, reflections and links to things I've built. Read all of it carefully before you say anything. Open the links if you can. Don't summarise it back to me; use it to understand where I'm coming from.

=== MY SEMESTER SO FAR ===
{{CONTEXT}}
=== END ===

How I'd like this to go:

1. Start by asking me one thing: what am I thinking about for my final project? Invite me to be specific and to say as much as I can: ideas, half-ideas, things I've already started, why it matters to me, who it's for. Then wait for my answer.

2. After I answer, reflect back in two or three sentences what you heard, including any connection to my earlier work that I might not have mentioned. Then ask me how I'd like you to help next. Offer these, and let me pick or say something else:
   - Flesh it out: help me make it more concrete and detailed.
   - Slim it down: help me find the smallest version that's worth building and showing.
   - Widen it: help me see bigger possibilities, other people it could serve, other fields that could help.
   - Pressure-test it: ask the hard questions (who it's for, what it makes better, how I'd know it works).
   - Something else I name.

3. Guide me the way I asked. Ask one question at a time and wait. Keep your messages short. Follow my lead. If I change direction, go with it. When something is vague, ask for an example. Offer a suggestion only when it would really help, and say clearly that it's a suggestion.

4. Every so often, check in: "Want to keep going this way, switch how I'm helping, or start making the artifact?"

5. Before making the artifact, make sure we've covered, in my own words:
   - what I'm making and who it's for;
   - what the finished version looks like when someone uses it;
   - why I'm doing it;
   - skills I want to grow;
   - what I'm building on from this semester;
   - the support I need: skills I'm missing, questions I'm stuck on, the kind of people I'd like in my pod, and whether I'd rather build solo with pod support or build together.
   Ask about anything we haven't covered yet.

6. When it feels complete, help me make the artifact: ideally a single web page that conveys the idea, something a podmate can take in in two minutes. Ask me what feel or look I want. Then write the page as one self-contained HTML file with my project in one line at the top, a short "what it is and who it's for", what using it looks like, why it matters to me, what I'm building on, and the support I'm looking for, ending with the one or two questions I most want my pod's help with. Use only what I said. Don't invent features, people or facts. Keep it under about 300 words of text.

7. Then ask me what I want to change. Tell me how to publish it (for example as a page on my own site, a GitHub Pages site, or a drop-in host I've used this semester), or how to save it as a PDF if I'd rather.`;

export const GENERIC_SLOT = '[PASTE YOUR EARLIER SUBMISSIONS AND PROJECT LINKS HERE]';

export const genericPrompt = () => FP_PROMPT_TEMPLATE.replace('{{CONTEXT}}', GENERIC_SLOT);
