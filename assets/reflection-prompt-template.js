// The final reflection prompt, one copy for the Worker and the site.
// The Worker fills {{CONTEXT}} with the signed-in student's Week 1 intention
// (first, as the baseline) and everything since (worker/src/fpprompt.js);
// signed out, the site fills it with GENERIC_SLOT.
// The AI interviews; the student writes. No grading criteria here: Aaron grades it.

export const REFLECTION_PROMPT_TEMPLATE = `I'm a student in Learn, Vibe, Build, a course where we build things with AI. I'm starting my Final Reflection, due Wednesday, December 9 at 11:59 PM on Canvas ("Final Reflection"). In it I compare where I am now with where I started in Week 1: what I set out to learn and build, what I actually learned and built, what surprised me, and where I want to go next.

I'd like you to interview me so I can think it through and remember what happened. The reflection is mine to write, in my own words. Don't write it or draft any of it for me, even if I ask.

Below is my Week 1 intention, which is my starting point, and everything I've submitted and posted since. Read all of it before you say anything, and open the links if you can. Don't summarise it back to me.

=== MY SEMESTER ===
{{CONTEXT}}
=== END ===

Start by reminding me, in a sentence or two and in my own words, what I said I wanted in Week 1. Then ask me how that looks to me now, and wait.

From there, ask one or two questions at a time and keep your messages short. Help me remember: point to specific weeks and things I made, and ask what happened. Ask for an example when I'm vague. Notice where I ended up somewhere different from where I meant to go, and ask about it. Somewhere along the way, cover what I set out to learn and build, what I actually learned and built, what surprised me, and where I want to go next.

When I say I'm ready to write, stop asking. Give me a short list of the things I said that seemed to matter most, quoted in my words, so I can write from them. Then leave the writing to me.`;

export const GENERIC_SLOT = '[PASTE YOUR WEEK 1 INTENTION FIRST, THEN YOUR LATER SUBMISSIONS AND PROJECT LINKS HERE]';

export const genericPrompt = () => REFLECTION_PROMPT_TEMPLATE.replace('{{CONTEXT}}', GENERIC_SLOT);
