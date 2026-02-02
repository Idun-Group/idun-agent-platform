CREATE_AGENT_CSS = """
Screen {
    layout: vertical;
    align: center middle;
}

.app-container {
    width: 98%;
    max-width: 200;
    height: 90%;
    max-height: 55;
    border: round white;
    border-title-color: yellow;
    border-title-background: $surface;
    border-title-style: bold;
    border-title-align: center;
}

.main-layout {
    width: 100%;
    height: 100%;
}

.nav-container {
    width: 28;
    height: 100%;
    border: round white;
    border-title-color: yellow;
    border-title-background: $surface;
    border-title-style: bold;
    border-title-align: center;
    margin-right: 1;
    padding: 1;
    padding-bottom: 0;
}

.nav-container-active {
    border: round cyan;
    border-title-color: cyan;
}

.nav-pane {
    width: 100%;
    height: auto;
    min-height: 3;
    margin-bottom: 1;
    padding: 0 1 1 1;
    border: round white;
    border-title-color: yellow;
    border-title-background: $surface;
    border-title-style: bold;
    border-title-align: left;
    color: gray;
}

.nav-pane Label {
    margin: 0;
    padding: 0;
    width: 100%;
}

.nav-pane-active {
    border: round cyan;
    color: white;
    border-title-color: cyan;
    background: $surface;
}

.nav-pane-validated {
    border: round green;
    border-title-color: green;
}

.nav-pane:last-child {
    margin-bottom: 0;
}

.content-area {
    width: 1fr;
    height: 100%;
    padding: 0 1;
    overflow-y: auto;
}

#widget-identity, #widget-observability, #widget-guardrails, #widget-mcps, #widget-serve {
    width: 100%;
    height: auto;
}

.header {
    width: 100%;
    height: 3;
    text-align: center;
    color: yellow;
    text-style: bold;
    background: $surface;
    border-bottom: solid white;
    margin-bottom: 1;
}

.section {
    width: 100%;
    height: auto;
    border: none;
    padding: 0;
    margin-bottom: 0;
}

.section-split {
    height: auto;
}

.agent-info-section {
    width: 100%;
    height: auto;
    border: round white;
    padding: 1;
    margin-bottom: 1;
    border-title-color: yellow;
    border-title-background: $surface;
    border-title-style: bold;
    border-title-align: center;
}

.form-fields-container {
    width: 1fr;
    height: auto;
    border: round white;
    border-title-color: yellow;
    border-title-background: $surface;
    border-title-style: bold;
    border-title-align: left;
    padding: 1;
    margin-right: 1;
}

.info-panel {
    width: 1fr;
    height: 100%;
    padding: 0 1;
    margin-left: 1;
    border: round cyan;
    border-title-color: cyan;
    border-title-align: left;
    background: transparent;
    overflow-y: auto;
}

.help-markdown {
    color: white;
    margin: 0;
}

.section-title {
    display: none;
}

.help-section {
    width: 100%;
    border: round gray;
    padding: 0 1;
    height: auto;
    background: $panel;
    border-title-color: gray;
}

.section-description {
    color: gray;
    text-style: dim;
    margin-bottom: 0;
}

.field-row {
    width: 100%;
    height: 3;
    margin: 0;
    align: left middle;
}

.framework-row {
    height: auto;
    margin-bottom: 1;
}

.framework-row .field-label {
    height: auto;
    padding-top: 1;
}

.field-label {
    width: 11;
    color: gray;
    content-align: left middle;
    height: 3;
}

Input {
    height: 3;
    color: white;
    background: transparent;
    margin: 0;
    padding: 0 1;
    border: round white;
}

Input:focus {
    border: round cyan;
}

#name_input {
    width: 18;
}

#port_input {
    width: 12;
}

OptionList {
    height: 5;
    background: transparent;
    border: round white;
    margin: 0;
    padding: 0;
}

OptionList:focus {
    border: round cyan;
}

OptionList > .option-list--option {
    background: transparent;
    color: white;
}

OptionList > .option-list--option-highlighted {
    background: transparent;
    color: cyan;
    text-style: bold;
}

#framework_select {
    width: 20;
}

.graph-definition-section {
    width: 100%;
    height: 1fr;
    margin: 0;
    margin-bottom: 0;
    padding: 1;
    border: round white;
    background: transparent;
    border-title-color: yellow;
    border-title-background: $surface;
    border-title-style: bold;
    border-title-align: center;
}

.field-label-standalone {
    display: none;
}

.graph-def-row {
    width: 100%;
    height: 12;
    margin-top: 0;
}

.tree-container {
    width: 2fr;
    height: 100%;
    margin-right: 1;
    border: round white;
    border-title-color: yellow;
    border-title-background: $surface;
    border-title-style: bold;
    border-title-align: left;
    padding: 1;
}

.var-container {
    width: 1fr;
    height: 100%;
    border: round white;
    border-title-color: yellow;
    border-title-background: $surface;
    border-title-style: bold;
    border-title-align: left;
    padding: 1;
}

.tree-label, .var-label {
    display: none;
}

.var-list {
    width: 100%;
    height: 100%;
    background: transparent;
    border: none;
}

.var-list:focus {
    border: none;
}

.path-display-container {
    width: 100%;
    height: 4;
    border: round white;
    border-title-color: yellow;
    border-title-background: $surface;
    border-title-style: bold;
    border-title-align: center;
    padding: 0 1;
    margin-top: 1;
}

.full-definition-display {
    color: yellow;
    text-style: bold;
    padding: 0;
    width: 100%;
    height: 100%;
    content-align: left middle;
}

DirectoryTree {
    height: 100%;
    border: none;
    background: transparent;
    scrollbar-size: 1 1;
}

.error-message {
    color: red;
    text-style: bold;
    margin: 0;
}

.button-row {
    width: 100%;
    margin-top: 1;
    align: center middle;
    height: 3;
}

Button {
    background: transparent;
    border: round white;
    padding: 0 2;
    margin: 0 2;
    min-width: 12;
    height: 3;
}

Button:hover {
    background: transparent;
    text-style: bold;
}

Button:focus {
    background: transparent;
    border: round cyan;
}

.action-buttons {
    width: 100%;
    height: 3;
    dock: bottom;
    padding: 0 1;
    border-top: none;
    align: left middle;
}

.action-btn {
    background: transparent;
    border: none;
    color: yellow;
    text-style: bold;
    height: 3;
}

#back_button {
    width: auto;
    min-width: 8;
    padding-left: 0;
}

#next_button {
    width: 1fr;
    content-align: right middle;
}

.action-btn:hover {
    color: cyan;
    text-style: bold;
}

.action-btn:focus {
    color: cyan;
    text-style: bold;
}

.back-btn {
    width: 100%;
    height: 3;
    background: transparent;
    border: none;
    border-top: solid white;
    padding: 0;
    margin-top: 1;
    text-align: center;
}

.back-btn:focus {
    text-style: bold;
    color: cyan;
}

.next-btn {
    background: transparent;
    border: none;
    padding: 0;
    margin-left: 4;
}

Markdown {
    background: transparent;
    color: white;
    padding: 0;
    margin: 0;
}

Footer {
    height: 3;
    background: $surface;
    dock: bottom;
    width: 100%;
    align-horizontal: center;
}

Footer > .footer--highlight {
    background: transparent;
    align-horizontal: center;
}

Footer > .footer--highlight-key {
    background: cyan;
    color: black;
    text-style: bold;
}

Footer > .footer--key {
    background: yellow;
    color: black;
    text-style: bold;
    padding: 0 1;
}

Footer > .footer--description {
    color: white;
    padding: 0 1;
}

#widget-serve {
    padding: 2;
}

.serve-yaml-display {
    width: 100%;
    height: auto;
    max-height: 15;
    border: round white;
    border-title-color: yellow;
    border-title-style: bold;
    padding: 1;
    margin-bottom: 2;
    overflow-y: auto;
}

#yaml_content {
    width: 100%;
    height: auto;
    color: white;
}

.serve-button-container {
    width: 100%;
    height: auto;
    align: center middle;
}

.validate-run-btn {
    width: 1fr;
    height: 3;
    background: green;
    color: white;
    text-style: bold;
    border: round white;
    margin: 0 1;
}

.validate-run-btn:hover {
    background: cyan;
    color: black;
}

.validate-run-btn:focus {
    background: cyan;
    color: black;
    border: round yellow;
}

Button#save_run_button.kill-mode {
    background: red;
}

Button#save_run_button.kill-mode:hover {
    background: darkred;
    color: white;
}

Button#save_run_button.kill-mode:focus {
    background: darkred;
    color: white;
    border: round yellow;
}

.serve-logs {
    width: 100%;
    height: 1fr;
    border: round white;
    border-title-color: yellow;
    border-title-style: bold;
    padding: 1;
    margin-top: 2;
}

#server_logs {
    width: 100%;
    height: 100%;
    background: black;
    color: white;
}

.global-api-key-section {
    width: 100%;
    height: auto;
    border: round yellow;
    border-title-color: yellow;
    border-title-style: bold;
    padding: 1;
    margin-bottom: 1;
}

.guardrails-grid {
    layout: grid;
    grid-size: 2 3;
    grid-gutter: 1 2;
    padding: 1;
    width: 100%;
    height: auto;
}

.guardrail-card {
    border: round cyan;
    border-title-color: cyan;
    border-title-style: bold;
    padding: 0 1;
    height: auto;
    max-height: 14;
    overflow-y: auto;
}

.guardrail-card-enabled {
    border: round green;
    border-title-color: green;
    max-height: 30;
}

.guardrail-header {
    width: 100%;
    height: auto;
    margin-bottom: 0;
}

.gr-label {
    width: auto;
    padding-right: 1;
}

.gr-label-small {
    width: 100%;
    margin-top: 0;
    margin-bottom: 0;
    color: gray;
}

.applies-to-section {
    width: 100%;
    margin-bottom: 0;
    border-top: solid white;
    padding-top: 0;
    padding-bottom: 0;
    margin-top: 1;
}

.config-section {
    width: 100%;
    border-top: solid yellow;
    padding-top: 0;
    margin-top: 0;
}

TextArea.gr-textarea {
    width: 100%;
    height: 3;
    margin: 0;
    background: transparent;
    border: round white;
    padding: 0 1;
    color: white;
}

TextArea.gr-textarea > .text-area--cursor-line {
    background: transparent;
}

TextArea.gr-textarea:focus {
    border: round cyan;
}

RadioSet {
    background: transparent;
    padding: 0;
    border: none;
    height: auto;
    margin: 0;
}

RadioSet:focus {
    background: transparent;
}

RadioButton {
    background: transparent;
    padding: 0 1;
    height: 1;
    margin: 0;
}

Switch {
    width: 10;
}

.mcps-templates-section {
    width: 100%;
    height: auto;
    border: round yellow;
    padding: 1;
    margin-bottom: 1;
}

.templates-row {
    width: 100%;
    height: auto;
}

.template-selector {
    width: 1fr;
    height: 6;
    margin-right: 1;
}

.add-template-btn {
    width: 20;
    height: 3;
    background: transparent;
    border: round cyan;
    color: cyan;
}

.add-template-btn:hover {
    background: cyan;
    color: black;
}

.add-custom-btn {
    width: 100%;
    height: 3;
    background: transparent;
    border: round green;
    color: green;
    margin-bottom: 1;
}

.add-custom-btn:hover {
    background: green;
    color: white;
}

.mcps-container {
    width: 100%;
    height: auto;
}

.mcp-card {
    width: 100%;
    height: auto;
    border: round cyan;
    padding: 1;
    margin-bottom: 1;
}

.mcp-header {
    width: 100%;
    height: auto;
    margin-bottom: 1;
}

.mcp-name-display {
    width: 1fr;
    color: yellow;
    text-style: bold;
}

.remove-mcp-btn {
    width: 15;
    height: 3;
    background: transparent;
    border: round red;
    color: red;
}

.remove-mcp-btn:hover {
    background: red;
    color: white;
}

.mcp-field-row {
    width: 100%;
    height: auto;
    margin-bottom: 1;
}

.mcp-label {
    width: 15;
    color: gray;
}

.mcp-input {
    width: 1fr;
    height: 3;
    border: round white;
    background: transparent;
}

.mcp-input:focus {
    border: round cyan;
}

.mcp-textarea {
    width: 1fr;
    height: 4;
    border: round white;
    background: transparent;
    padding: 0 1;
}

.mcp-textarea:focus {
    border: round cyan;
}

.http-fields-container, .stdio-fields-container {
    width: 100%;
    height: auto;
    padding: 1;
    border: round yellow;
    margin-top: 1;
}

.custom-footer {
    dock: bottom;
    width: 100%;
    height: 1;
    background: $surface;
    color: yellow;
    text-align: center;
    text-style: bold;
}

#widget-chat {
    padding: 2;
}

.chat-history-container {
    width: 100%;
    height: 1fr;
    border: round white;
    border-title-color: yellow;
    border-title-style: bold;
    padding: 1;
    margin-bottom: 2;
}

#chat_history {
    width: 100%;
    height: 100%;
    background: transparent;
    color: white;
}

#chat_history Markdown {
    background: transparent;
}

#chat_history .em {
    color: gray;
}

#chat_history .strong {
    color: cyan;
}

#chat_history .code_inline {
    color: yellow;
    background: transparent;
}

#chat_history .h1, #chat_history .h2, #chat_history .h3 {
    color: green;
}

#chat_history .link {
    color: magenta;
}

.chat-thinking-container {
    width: 100%;
    height: 2;
    align: left middle;
    padding: 0 1;
}

#chat_spinner {
    width: auto;
    height: auto;
    color: yellow;
}

#thinking_label {
    width: auto;
    height: auto;
    color: yellow;
    margin-left: 1;
    text-style: italic;
}

.chat-input-container {
    width: 100%;
    height: 5;
    align: left middle;
}

.chat-input {
    width: 1fr;
    height: 3;
    color: white;
    background: transparent;
    border: round white;
    padding: 0 1;
    margin-right: 1;
}

.chat-input:focus {
    border: round cyan;
}

.chat-input:disabled {
    opacity: 0.5;
}

.send-btn {
    width: 12;
    height: 3;
    background: green;
    color: white;
    text-style: bold;
    border: round white;
}

.send-btn:hover {
    background: cyan;
    color: black;
}

.send-btn:focus {
    background: cyan;
    color: black;
    border: round yellow;
}

.send-btn:disabled {
    background: gray;
    opacity: 0.5;
}

#widget-memory {
    padding: 2;
}

.memory-main {
    width: 100%;
    height: auto;
    border: round white;
    border-title-color: yellow;
    border-title-style: bold;
    padding: 1;
    margin-bottom: 1;
}

.checkpoint-config-container {
    width: 100%;
    height: auto;
    margin-top: 1;
}

.checkpoint-fields-section {
    width: 100%;
    height: auto;
    border: round white;
    border-title-color: yellow;
    border-title-style: bold;
    padding: 1;
}
"""
