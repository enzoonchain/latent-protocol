/**
 * Minimal ambient declarations for the slice of the OpenClaw plugin SDK this
 * plugin uses. The real `openclaw` peer dependency provides the full types at
 * build/runtime; this keeps `tsc --noEmit` honest when it isn't installed.
 *
 * Refs:
 *   https://docs.openclaw.ai/plugins/sdk-entrypoints
 *   https://docs.openclaw.ai/plugins/hooks
 */

declare module "openclaw/plugin-sdk/plugin-entry" {
  /** Per-hook options. `timeoutMs` aborts a slow handler and moves on. */
  export interface HookOptions {
    priority?: number;
    timeoutMs?: number;
  }

  export interface BeforePromptBuildEvent {
    sessionId: string;
    userMessage?: string;
    isFirstTurn?: boolean;
    channel?: string;
  }

  /** Return shape that mutates the prompt before submission. */
  export interface BeforePromptBuildResult {
    prependContext?: string;
    appendSystemContext?: string;
    prependSystemContext?: string;
    systemPrompt?: string;
  }

  export interface MessageSendingEvent {
    sessionId: string;
    content: string;
    channel?: string;
    metadata?: Record<string, unknown>;
  }

  export interface MessageSendingResult {
    content?: string;
  }

  export interface SessionStartEvent {
    sessionId: string;
    channel?: string;
  }

  export interface SessionStartResult {
    systemMessage?: string;
  }

  type HookMap = {
    before_prompt_build: [BeforePromptBuildEvent, BeforePromptBuildResult | void];
    message_sending: [MessageSendingEvent, MessageSendingResult | void];
    session_start: [SessionStartEvent, SessionStartResult | void];
  };

  export interface NextTurnInjection {
    sessionId: string;
    text: string;
    idempotencyKey: string;
    ttlMs?: number;
  }

  export interface PluginApi<C = Record<string, unknown>> {
    /** User config validated against the manifest's configSchema. */
    config: C;
    on<K extends keyof HookMap>(
      hook: K,
      handler: (event: HookMap[K][0]) => Promise<HookMap[K][1]> | HookMap[K][1],
      options?: HookOptions,
    ): void;
    /** Durable injection delivered to the next turn exactly once. */
    enqueueNextTurnInjection(injection: NextTurnInjection): void;
    logger?: { info(msg: string): void; warn(msg: string): void; error(msg: string): void };
  }

  export interface PluginEntry<C = Record<string, unknown>> {
    id: string;
    name: string;
    description: string;
    register(api: PluginApi<C>): void | Promise<void>;
  }

  export function definePluginEntry<C = Record<string, unknown>>(
    entry: PluginEntry<C>,
  ): PluginEntry<C>;
}
