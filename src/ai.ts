/** Vercel AI SDK tool surface over the shared encoding tool definitions. */

import { toAiTool, type AiToolOutput } from "@agntn/tools/ai";
import type { Static } from "@agntn/tools";
import type { Tool } from "ai";
import type {
  DecodeDetails,
  EncodeDetails,
  IdentifyDetails,
  InfoDetails,
} from "./tool-operations.ts";
import {
  decodeSchema,
  decodeTool,
  encodeSchema,
  encodeTool,
  identifySchema,
  identifyTool,
  infoSchema,
  infoTool,
} from "./tools.ts";

export const encodingsEncodeTool: Tool<
  Static<typeof encodeSchema>,
  AiToolOutput<EncodeDetails>
> = toAiTool(encodeTool);

export const encodingsDecodeTool: Tool<
  Static<typeof decodeSchema>,
  AiToolOutput<DecodeDetails>
> = toAiTool(decodeTool);

export const encodingsIdentifyTool: Tool<
  Static<typeof identifySchema>,
  AiToolOutput<IdentifyDetails>
> = toAiTool(identifyTool);

export const encodingsInfoTool: Tool<
  Static<typeof infoSchema>,
  AiToolOutput<InfoDetails>
> = toAiTool(infoTool);

/** Every encoding tool, keyed by the name MCP, Pi and OMP use for it. */
export const encodingAiTools = {
  encodings_encode: encodingsEncodeTool,
  encodings_decode: encodingsDecodeTool,
  encodings_identify: encodingsIdentifyTool,
  encodings_info: encodingsInfoTool,
};
