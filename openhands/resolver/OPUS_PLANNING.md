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
   - Rationale: Security and resource management

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
  - Issue requiring human decision-making
- Action: 
  - Comment explaining unsuitability for automation
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
(To be expanded with our discussion)

### 3. Handoff to Main Resolver
(To be expanded with our discussion)

## Open Questions
1. Should the planning stage be interactive?
2. Where and how should planning artifacts be stored?
3. How should edge cases between suitability categories be handled?
4. What should be the specific criteria for each category?
5. What should the response templates look like?

## Next Steps
- Define specific criteria for each suitability category
- Design response templates
- Plan the detailed planning phase workflow
- Design the handoff mechanism to the main resolver