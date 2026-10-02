import {
  encodingsCharsetConvert,
  encodingsDecode,
  encodingsEncode,
  encodingsIdentify,
  encodingsInfo,
  type CharsetConvertDetails,
  type DecodeDetails,
  type EncodeDetails,
  type IdentifyDetails,
  type InfoDetails,
  type ToolResult,
} from "#tool-operations";

/** Every agent tool, in the order every surface lists them. Same names over MCP, Pi, OMP and the AI SDK. */
export const TOOLS = [
  "encodings_encode",
  "encodings_decode",
  "encodings_identify",
  "encodings_info",
  "encodings_charset_convert",
] as const;

export type ToolName = (typeof TOOLS)[number];

type ToolDetails = EncodeDetails | DecodeDetails | IdentifyDetails | InfoDetails | CharsetConvertDetails;

/**
 * Runs one tool's executor, the one the MCP server runs.
 *
 * @param {ToolName} name - The tool.
 * @param {Record<string, unknown>} params - Its arguments.
 * @returns {ToolResult<ToolDetails>} Text and details.
 */
export function runTool(name: ToolName, params: Readonly<Record<string, unknown>>): ToolResult<ToolDetails> {
  switch (name) {
    case "encodings_encode":
      return encodingsEncode(params);
    case "encodings_decode":
      return encodingsDecode(params);
    case "encodings_identify":
      return encodingsIdentify(params);
    case "encodings_info":
      return encodingsInfo(params);
    case "encodings_charset_convert":
      return encodingsCharsetConvert(params);
  }
}

/**
 * The text a tool hands a model.
 *
 * @param {ToolName} name - The tool.
 * @param {Record<string, unknown>} params - Its arguments.
 * @returns {string} `content[0].text`.
 */
export function toolText(name: ToolName, params: Readonly<Record<string, unknown>>): string {
  return runTool(name, params).content[0]!.text;
}

/**
 * The text and candidates `encodings_identify` hands a model.
 *
 * @param {string} text - Text in an unknown encoding.
 * @param {number} limit - Most candidates.
 * @returns {{ text: string; candidates: IdentifyDetails["candidates"] }} The answer.
 */
export function identifyAnswer(text: string, limit = 3): { text: string; candidates: IdentifyDetails["candidates"] } {
  const result = encodingsIdentify({ text, limit });
  return { text: result.content[0]!.text, candidates: result.details.candidates };
}
