export enum EventType {
    TEXT_MESSAGE_START = "TEXT_MESSAGE_START",
    TEXT_MESSAGE_CONTENT = "TEXT_MESSAGE_CONTENT",
    TEXT_MESSAGE_END = "TEXT_MESSAGE_END",
    TEXT_MESSAGE_CHUNK = "TEXT_MESSAGE_CHUNK",
    THINKING_TEXT_MESSAGE_START = "THINKING_TEXT_MESSAGE_START",
    THINKING_TEXT_MESSAGE_CONTENT = "THINKING_TEXT_MESSAGE_CONTENT",
    THINKING_TEXT_MESSAGE_END = "THINKING_TEXT_MESSAGE_END",
    TOOL_CALL_START = "TOOL_CALL_START",
    TOOL_CALL_ARGS = "TOOL_CALL_ARGS",
    TOOL_CALL_END = "TOOL_CALL_END",
    TOOL_CALL_CHUNK = "TOOL_CALL_CHUNK",
    THINKING_START = "THINKING_START",
    THINKING_END = "THINKING_END",
    STATE_SNAPSHOT = "STATE_SNAPSHOT",
    STATE_DELTA = "STATE_DELTA",
    MESSAGES_SNAPSHOT = "MESSAGES_SNAPSHOT",
    RAW = "RAW",
    CUSTOM = "CUSTOM",
    RUN_STARTED = "RUN_STARTED",
    RUN_FINISHED = "RUN_FINISHED",
    RUN_ERROR = "RUN_ERROR",
    STEP_STARTED = "STEP_STARTED",
    STEP_FINISHED = "STEP_FINISHED",
  }
  
  export type BaseEvent = {
    type: EventType;
    timestamp?: number;
    raw_event?: any;
  };
  
  export type TextMessageStartEvent = BaseEvent & {
    type: EventType.TEXT_MESSAGE_START;
    message_id: string;
    role: "assistant";
  };
  
  export type TextMessageContentEvent = BaseEvent & {
    type: EventType.TEXT_MESSAGE_CONTENT;
    message_id: string;
    delta: string;
  };
  
  export type TextMessageEndEvent = BaseEvent & {
    type: EventType.TEXT_MESSAGE_END;
    message_id: string;
  };
  
  export type ToolCallStartEvent = BaseEvent & {
    type: EventType.TOOL_CALL_START;
    tool_call_id: string;
    tool_call_name: string;
    parent_message_id?: string;
  };
  
  export type ToolCallArgsEvent = BaseEvent & {
    type: EventType.TOOL_CALL_ARGS;
    tool_call_id: string;
    delta: string;
  };
  
  export type ToolCallEndEvent = BaseEvent & {
    type: EventType.TOOL_CALL_END;
    tool_call_id: string;
  };
  
  export type ThinkingStartEvent = BaseEvent & {
    type: EventType.THINKING_START;
    title?: string;
  };
  
  export type ThinkingEndEvent = BaseEvent & {
    type: EventType.THINKING_END;
  };
  
  export type RunStartedEvent = BaseEvent & {
    type: EventType.RUN_STARTED;
    thread_id: string;
    run_id: string;
  };
  
  export type RunFinishedEvent = BaseEvent & {
    type: EventType.RUN_FINISHED;
    thread_id: string;
    run_id: string;
  };
  
  export type StepStartedEvent = BaseEvent & {
    type: EventType.STEP_STARTED;
    step_name: string;
  };
  
  export type StepFinishedEvent = BaseEvent & {
    type: EventType.STEP_FINISHED;
    step_name: string;
  };
  
  export type UIEvent =
    | TextMessageStartEvent
    | TextMessageContentEvent
    | TextMessageEndEvent
    | ToolCallStartEvent
    | ToolCallArgsEvent
    | ToolCallEndEvent
    | ThinkingStartEvent
    | ThinkingEndEvent
    | RunStartedEvent
    | RunFinishedEvent
    | StepStartedEvent
    | StepFinishedEvent;
  
  export type Message = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
  };
  
  export type Agent = {
    id: string;
    name: string;
    // Add other agent properties as needed
  };
  
  export type ToolCall = {
    id: string;
    name: string;
    args: string;
  }; 