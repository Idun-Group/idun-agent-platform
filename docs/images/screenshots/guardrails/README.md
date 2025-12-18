# Guardrails Screenshots

This directory contains screenshots for the guardrails documentation.

## Required Screenshots

### API Testing (1 screenshot)

1. **guardrails-error-response.png**
   - Screenshot showing an error response when a guardrail blocks input
   - Can be from Postman, curl output in terminal, or browser dev tools
   - Should show the error JSON response clearly

### Agent Creation Flow (8 screenshots)

2. **guardrails-create-agent-step1.png**
   - Agent list page with "Create Agent" button highlighted
   - Show empty or populated agent list

3. **guardrails-create-agent-step2.png**
   - Agent basic info configuration page
   - Fields: Name, Description, Framework dropdown, Model selection

4. **guardrails-wizard-step.png**
   - Multi-step wizard navigation showing Guardrails step
   - Highlight "Guardrails" in the step indicator

5. **guardrails-add-input-button.png**
   - Guardrails configuration page (empty state)
   - "Add Input Guardrail" button prominently visible

6. **guardrails-type-dropdown.png**
   - Dropdown menu expanded showing all available guardrail types:
     - Ban List
     - Detect PII
     - Toxic Language
     - NSFW Text
     - Detect Jailbreak
     - Competition Check
     - Bias Check
     - Correct Language
     - Restrict Topic
     - Prompt Injection

7. **guardrails-configure-banlist.png**
   - Ban List configuration form filled with example data:
     - Guardrail type: "Ban List"
     - Banned Words: ["spam", "scam", "phishing"]
     - Max Levenshtein Distance: 0
     - Optional reject message field

8. **guardrails-list-view.png**
   - List of configured guardrails showing:
     - Input Guardrails section with multiple guardrails (ban_list, detect_pii, toxic_language, etc.)
     - Output Guardrails section with gibberish_text
     - Edit and Delete buttons for each guardrail

9. **guardrails-create-final.png**
   - Final review page before creating agent
   - "Create Agent" button visible
   - Summary of all configurations including guardrails

### Agent Editing Flow (5 screenshots)

10. **guardrails-edit-agent-button.png**
   - Agent list with "Edit" button highlighted on a specific agent row

11. **guardrails-edit-tab.png**
    - Agent edit page showing multiple tabs
    - "Guardrails" tab highlighted
    - Other tabs visible: General, Model, Memory, Tools, etc.

12. **guardrails-edit-view.png**
    - Guardrails edit interface showing:
      - List of existing guardrails
      - Delete icons next to each
      - "Add Guardrail" button
      - Save/Cancel buttons at bottom

12. **guardrails-edit-modal.png**
    - Edit modal for existing guardrail
    - Guardrail type (read-only field)
    - Editable parameter fields
    - Save and Cancel buttons

13. **guardrails-save-success.png**
    - Success notification/toast message
    - Message: "Agent updated successfully" or similar

## Screenshot Specifications

- **Resolution**: 1920x1080 or higher
- **Format**: PNG
- **Browser**: Use a modern browser (Chrome/Firefox) with developer tools closed
- **Highlighting**: Add red boxes or arrows to highlight important UI elements
- **Data**: Use consistent test data across screenshots:
  - Agent name: "Customer Support Agent" or similar
  - Banned words: ["spam", "scam", "phishing"]
  - Framework: LangGraph
  - Model: gpt-4

## How to Capture Screenshots

1. **Set up environment**: Ensure Manager UI is running with guardrails feature enabled
2. **Clear browser cache**: Start with a fresh state
3. **Use consistent data**: Follow the data guidelines above
4. **Capture at right moment**: Take screenshot when relevant UI elements are visible
5. **Add annotations**: Use an image editor to add red boxes/arrows highlighting key elements
6. **Optimize file size**: Use PNG compression tools to keep file sizes reasonable
7. **Name correctly**: Use exact filenames as specified above

## Current Status

- [ ] guardrails-create-agent-step1.png
- [ ] guardrails-create-agent-step2.png
- [ ] guardrails-wizard-step.png
- [ ] guardrails-add-input-button.png
- [ ] guardrails-type-dropdown.png
- [ ] guardrails-configure-banlist.png
- [ ] guardrails-list-view.png
- [ ] guardrails-create-final.png
- [ ] guardrails-edit-agent-button.png
- [ ] guardrails-edit-tab.png
- [ ] guardrails-edit-view.png
- [ ] guardrails-edit-modal.png
- [ ] guardrails-save-success.png

## Notes

These screenshots are referenced in `/docs/guardrails/overview.md`. Ensure filenames match exactly to avoid broken image links.
