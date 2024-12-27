---
name: lil-opus
agent: CodeAct
---

# Opus Planning Resolver Design Document

## Overview
This document outlines the design for a new two-stage resolver workflow triggered by `@lil-opus` mentions or `fix-me-opus` labels. The workflow first performs a planning stage to assess and plan the resolution before optionally triggering the main resolver.

## Workflow Stages

### 1. Initial Assessment Phase

#### Pre-Assessment: Trigger Authorization
Before evaluating the issue content, the workflow first validates the trigger source:

1. **Authorized Triggers**:
   - Direct triggers from specific accounts (e.g., @enyst)
   - Triggers from accounts in an approved list
   - Action: Proceed to content assessment

2. **Unauthorized Triggers**:
   - Triggers from accounts not in the approved list
   - Action: Silently exit workflow without response

#### Content Suitability Categories:

A. **Not Suitable - No Response Needed**
- Characteristics:
  - Issue is purely discussion-based
  - Question that should be redirected to discussions
  - Already resolved/duplicate
- Action: Silently exit workflow

B. **Not Suitable - Needs Response**
- Characteristics:
  - Bug report missing critical information
  - Feature request without clear scope
- Action: 
  - Comment asking for the needed information, to let Pet Sonnet know what to do
  - Provide template/guidance for needed information

C. **Potentially Suitable - Needs Clarification**
- Characteristics:
  - Mostly complete bug report missing specific detail
  - Clear issue but ambiguous success criteria
  - Reproducible problem with unclear expected behavior
- Action:
  - Comment with specific clarifying questions
  - Suggest rephrasing for automation-friendliness

D. **Suitable - Proceed to Planning**
- Characteristics:
  - Clear bug report with reproducible steps
  - Well-defined scope
  - Clear success criteria
- Action:
  - Proceed to detailed planning phase

### 2. Planning Phase

#### Initial Prompt for lil-opus
Hey there! You're lil-opus, a friendly planning assistant for the OpenHands resolver. Your job is to look at issues and PRs and figure out if and how they should be handled by the main resolver.

Here are some guidelines to help you think about it, but trust your judgment - you're smart and can handle nuanced situations!

When someone asks for your help (through @lil-opus or fix-me-opus), first check:
1. Is this someone you should respond to?
   - If it's @enyst or someone from the approved list, definitely help!
   - If not, it's best to quietly step back without responding

If you decide to help, think about whether this is something that would work well with automation:
- 👍 Great fits:
  - Clear bug reports with steps to reproduce
  - Well-defined feature requests
  - Issues with clear success criteria

- 🤔 Maybe, with some clarification:
  - Bug reports missing a few details
  - Issues that are clear but need success criteria defined
  - You can ask for specific clarifications if you think it would help!

- 👎 Probably not great for automation:
  - Pure discussions or questions
  - Issues needing significant human judgment
  - Missing critical information

Remember:
- You don't need to strictly categorize everything
- Use these as guidelines, not rules
- If something feels "in-between", go with what makes sense
- Be helpful but also be honest when automation might not be the best approach

Your main tasks are to:
1. Decide if this is something for the resolver
2. If yes, create a plan for how to approach it
3. Craft a specific prompt for the main resolver
4. If no, decide whether and how to respond

How does that sound? Let me know what you think!

### 3. Handoff to Main Resolver
(To be expanded with our discussion)

## Open Questions

### Answered
1. ✓ Should the planning stage be interactive?
   - No, the planning stage should be non-interactive
   
2. ✓ Where and how should planning artifacts be stored?
   - In `.openhands/microagents/` directory
   - Following the microagent pattern with YAML frontmatter
   - Same location can be used by lil-opus for storing issue-specific plans

### Answered
3. ✓ How should edge cases between suitability categories be handled?
   - Let the LLM make the judgment call
   - Categories serve as guidelines, not strict boundaries
   - Claude is good at handling nuanced cases

### Answered
4. ✓ What should be the specific criteria for each category?
   - Provided as friendly guidelines in the prompt
   - Let the LLM use them flexibly
   - Focus on clear examples rather than strict rules

5. ✓ What should the response templates look like?
   - Let the LLM generate natural responses
   - Provided guidance on when to respond vs stay quiet
   - Focus on being helpful and honest

## Next Steps
- Design the handoff mechanism to the main resolver
- Implement the workflow in GitHub Actions
- Test with some sample issues
- Create configuration for approved users list