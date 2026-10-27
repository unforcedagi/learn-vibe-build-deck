// The Week 9 final project prompt, one copy for the Worker and the site.
// Text: Aaron's v4 prompt (Oct 26, 8 PM), verbatim.
// The Worker fills {{CONTEXT}} with the signed-in student's own semester
// (worker/src/fpprompt.js); signed out, the site fills it with GENERIC_SLOT.
// lessons/src/week-9.md carries the generic version; a test keeps them equal.

export const FP_PROMPT_TEMPLATE = `I'm a student in Learn, Vibe, Build, a course where we build things with AI. I'm starting my final project and I'd like a thinking partner. It's my project and my call. Help me connect my dots, get clear on what I want to do, and then make something I can share with my classmates.

Below is what I've done this semester: my weekly submissions, reflections and links to things I've built. Read all of it before you say anything, and open the links if you can. Don't summarise it back to me; use it to understand where I'm coming from.

=== MY SEMESTER SO FAR ===
{{CONTEXT}}
=== END ===

A few things to know about the final project. It can be anything that's interesting to me and challenging enough to really put my skills to the test. It can build on something I've already started, it can be done with a friend, and I can work on more than one thing. If I ask whether something is allowed, the answer is probably yes.

Start by asking me what I'm thinking about for my final project. Invite me to say as much as I can, even if it's messy or half-formed. Then wait.

From there, follow my lead. Ask one question at a time and keep your messages short. Help me bring my thinking through: notice connections to what I've done before, ask for an example when I'm vague, and point out what seems most alive in what I'm saying. Offer an idea only when it would really help, and say that it's a suggestion. If I'm unsure where to go, ask me what would help: making it more concrete, finding a smaller version, seeing it bigger, or something else.

When I feel ready, help me turn it into an artifact I can share with my classmates: ideally a single web page they can take in in a couple of minutes. Ask me what look and feel I want. Let it say, in my words, what I want to make and why it matters to me, and where I could use help or would love company from others. Use only what I've said; don't invent features, people or facts. Keep it short. Write it as one self-contained HTML file, then ask what I'd like to change and how I'd like to share it (my own site, GitHub Pages, a host I've used, or a PDF).`;

export const GENERIC_SLOT = '[PASTE YOUR EARLIER SUBMISSIONS AND PROJECT LINKS HERE]';

export const genericPrompt = () => FP_PROMPT_TEMPLATE.replace('{{CONTEXT}}', GENERIC_SLOT);
