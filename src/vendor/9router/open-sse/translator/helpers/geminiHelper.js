export const UNSUPPORTED_SCHEMA_CONSTRAINTS = [
  "minLength",
  "maxLength",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "pattern",
  "minItems",
  "maxItems",
  "format",
  "default",
  "examples",
  "$schema",
  "$defs",
  "definitions",
  "const",
  "$ref",
  "$comment",
  "additionalProperties",
  "propertyNames",
  "patternProperties",
  "enumDescriptions",
  "anyOf",
  "oneOf",
  "allOf",
  "not",
  "dependencies",
  "dependentSchemas",
  "dependentRequired",
  "title",
  "if",
  "then",
  "else",
  "contentMediaType",
  "contentEncoding",
  "cornerRadius",
  "fillColor",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "gap",
  "padding",
  "strokeColor",
  "strokeThickness",
  "textColor",
];

export const DEFAULT_SAFETY_SETTINGS = [
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "OFF" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "OFF" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "OFF" },
  { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "OFF" },
];

export function convertOpenAIContentToParts(content) {
  const parts = [];

  if (typeof content === "string") {
    parts.push({ text: content });
  } else if (Array.isArray(content)) {
    for (const item of content) {
      if (item.type === "text") {
        parts.push({ text: item.text });
      } else if (item.type === "image_url" && item.image_url?.url?.startsWith("data:")) {
        const url = item.image_url.url;
        const commaIndex = url.indexOf(",");
        if (commaIndex !== -1) {
          const mimePart = url.substring(5, commaIndex);
          const data = url.substring(commaIndex + 1);
          const mimeType = mimePart.split(";")[0];

          parts.push({
            inlineData: {
              mime_type: mimeType,
              data,
            },
          });
        }
      } else if (
        item.type === "image_url" &&
        item.image_url?.url &&
        (item.image_url.url.startsWith("http://") || item.image_url.url.startsWith("https://"))
      ) {
        parts.push({
          fileData: {
            fileUri: item.image_url.url,
            mimeType: "image/*",
          },
        });
      } else if (item.type === "input_audio" && item.input_audio?.data) {
        const format = item.input_audio.format || "wav";
        const mimeType = format === "mp3" ? "audio/mpeg" : `audio/${format}`;
        parts.push({
          inlineData: {
            mime_type: mimeType,
            data: item.input_audio.data,
          },
        });
      } else if (item.type === "audio_url" && item.audio_url?.url?.startsWith("data:")) {
        const url = item.audio_url.url;
        const commaIndex = url.indexOf(",");
        if (commaIndex !== -1) {
          const mimePart = url.substring(5, commaIndex);
          const data = url.substring(commaIndex + 1);
          const mimeType = mimePart.split(";")[0];
          parts.push({
            inlineData: {
              mime_type: mimeType,
              data,
            },
          });
        }
      }
    }
  }

  return parts;
}

export function extractTextContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("");
  }

  return "";
}

export function tryParseJSON(value) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function generateRequestId() {
  return `agent-${crypto.randomUUID()}`;
}

export function generateSessionId() {
  return `${crypto.randomUUID()}${Date.now().toString()}`;
}

export function generateProjectId() {
  const adjectives = ["useful", "bright", "swift", "calm", "bold"];
  const nouns = ["fuze", "wave", "spark", "flow", "core"];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adjective}-${noun}-${crypto.randomUUID().slice(0, 5)}`;
}

function removeUnsupportedKeywords(value, keywords) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      removeUnsupportedKeywords(item, keywords);
    }
    return;
  }

  for (const key of Object.keys(value)) {
    if (keywords.includes(key) || key.startsWith("x-")) {
      delete value[key];
      continue;
    }

    removeUnsupportedKeywords(value[key], keywords);
  }
}

function convertConstToEnum(value) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (value.const !== undefined && !value.enum) {
    value.enum = [value.const];
    delete value.const;
  }

  for (const child of Object.values(value)) {
    convertConstToEnum(child);
  }
}

function convertEnumValuesToStrings(value) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (value.enum && Array.isArray(value.enum)) {
    value.enum = value.enum.map((item) => String(item));
    if (!value.type) {
      value.type = "string";
    }
  }

  for (const child of Object.values(value)) {
    convertEnumValuesToStrings(child);
  }
}

function mergeAllOf(value) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (value.allOf && Array.isArray(value.allOf)) {
    const merged = {};

    for (const item of value.allOf) {
      if (item.properties) {
        merged.properties = { ...(merged.properties || {}), ...item.properties };
      }

      if (item.required && Array.isArray(item.required)) {
        merged.required = merged.required || [];
        for (const field of item.required) {
          if (!merged.required.includes(field)) {
            merged.required.push(field);
          }
        }
      }
    }

    delete value.allOf;
    if (merged.properties) {
      value.properties = { ...(value.properties || {}), ...merged.properties };
    }
    if (merged.required) {
      value.required = [...(value.required || []), ...merged.required];
    }
  }

  for (const child of Object.values(value)) {
    mergeAllOf(child);
  }
}

function selectBest(items) {
  let bestIndex = 0;
  let bestScore = -1;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    let score = 0;

    if (item.type === "object" || item.properties) {
      score = 3;
    } else if (item.type === "array" || item.items) {
      score = 2;
    } else if (item.type && item.type !== "null") {
      score = 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function flattenAnyOfOneOf(value) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (value.anyOf && Array.isArray(value.anyOf) && value.anyOf.length > 0) {
    const nonNullSchemas = value.anyOf.filter((item) => item && item.type !== "null");
    if (nonNullSchemas.length > 0) {
      const selected = nonNullSchemas[selectBest(nonNullSchemas)];
      delete value.anyOf;
      Object.assign(value, selected);
    }
  }

  if (value.oneOf && Array.isArray(value.oneOf) && value.oneOf.length > 0) {
    const nonNullSchemas = value.oneOf.filter((item) => item && item.type !== "null");
    if (nonNullSchemas.length > 0) {
      const selected = nonNullSchemas[selectBest(nonNullSchemas)];
      delete value.oneOf;
      Object.assign(value, selected);
    }
  }

  for (const child of Object.values(value)) {
    flattenAnyOfOneOf(child);
  }
}

function flattenTypeArrays(value) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (value.type && Array.isArray(value.type)) {
    const nonNullTypes = value.type.filter((item) => item !== "null");
    value.type = nonNullTypes.length > 0 ? nonNullTypes[0] : "string";
  }

  for (const child of Object.values(value)) {
    flattenTypeArrays(child);
  }
}

function ensureObjectType(value) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (value.properties && !value.type) {
    value.type = "object";
  }

  for (const child of Object.values(value)) {
    ensureObjectType(child);
  }
}

export function cleanJSONSchemaForAntigravity(schema) {
  if (!schema || typeof schema !== "object") {
    return schema;
  }

  const cleaned = schema;

  convertConstToEnum(cleaned);
  convertEnumValuesToStrings(cleaned);
  mergeAllOf(cleaned);
  flattenAnyOfOneOf(cleaned);
  flattenTypeArrays(cleaned);
  ensureObjectType(cleaned);
  removeUnsupportedKeywords(cleaned, UNSUPPORTED_SCHEMA_CONSTRAINTS);

  function cleanupRequired(value) {
    if (!value || typeof value !== "object") {
      return;
    }

    if (value.required && Array.isArray(value.required) && value.properties) {
      const validRequired = value.required.filter((field) =>
        Object.prototype.hasOwnProperty.call(value.properties, field),
      );
      if (validRequired.length === 0) {
        delete value.required;
      } else {
        value.required = validRequired;
      }
    }

    for (const child of Object.values(value)) {
      cleanupRequired(child);
    }
  }

  function addPlaceholders(value) {
    if (!value || typeof value !== "object") {
      return;
    }

    if (value.type === "object" && (!value.properties || Object.keys(value.properties).length === 0)) {
      value.properties = {
        reason: {
          type: "string",
          description: "Brief explanation of why you are calling this tool",
        },
      };
      value.required = ["reason"];
    }

    for (const child of Object.values(value)) {
      addPlaceholders(child);
    }
  }

  cleanupRequired(cleaned);
  addPlaceholders(cleaned);
  return cleaned;
}
